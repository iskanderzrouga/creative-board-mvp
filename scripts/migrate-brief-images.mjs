import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const DATA_IMAGE_RE =
  /<img\b[^>]*\bsrc\s*=\s*(["'])(data:image\/([a-z0-9.+-]+);base64,([^"']+))\1[^>]*>/gi

const DEFAULT_BUCKET = 'editors-board-brief-images'
const DEFAULT_BACKUP_ROOT = 'artifacts/brief-image-migration'

const { values } = parseArgs({
  options: {
    mode: { type: 'string', default: 'inventory' },
    'workspace-id': { type: 'string' },
    bucket: { type: 'string', default: DEFAULT_BUCKET },
    'backup-root': { type: 'string', default: DEFAULT_BACKUP_ROOT },
    'backup-file': { type: 'string' },
    strategy: { type: 'string', default: 'smallest' },
    'image-key': { type: 'string' },
    yes: { type: 'boolean', default: false },
  },
})

await loadEnvFile('.env.local')

const mode = values.mode
const bucketName = values.bucket
const workspaceId = values['workspace-id'] ?? process.env.VITE_REMOTE_WORKSPACE_ID ?? 'primary'
const backupRoot = values['backup-root']

if (!['inventory', 'dry-run', 'canary', 'bulk', 'rollback-check', 'rollback'].includes(mode)) {
  throw new Error(
    `Unsupported mode "${mode}". Use inventory, dry-run, canary, bulk, rollback-check, or rollback.`,
  )
}

const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

if (mode === 'rollback' || mode === 'rollback-check') {
  await runRollback()
} else {
  await runMigrationMode()
}

async function runMigrationMode() {
  const row = await fetchWorkspaceState()
  const backup = await writeBackup(row)
  const inventory = buildInventory(row.state)
  const summary = summarizeInventory(row, inventory, backup)
  await writeJson(path.join(backup.dir, 'inventory.json'), summary)

  if (mode === 'inventory' || mode === 'dry-run') {
    printJson({
      mode,
      workspaceId,
      backup,
      inventory: summary.inventory,
      planned: mode === 'dry-run' ? selectTargets(inventory).map(summarizeImage) : [],
      writesPerformed: false,
    })
    return
  }

  requireYes(mode)
  await ensurePublicBucket(bucketName)

  const targets = selectTargets(inventory)
  if (targets.length === 0) {
    printJson({ mode, workspaceId, backup, writesPerformed: false, reason: 'no_data_images_found' })
    return
  }

  const migration = await migrateTargets(row.state, targets)
  const verificationBeforePatch = verifyMigrationShape(row.state, migration.nextState, targets)
  if (!verificationBeforePatch.ok) {
    throw new Error(`Refusing to patch workspace_state: ${verificationBeforePatch.error}`)
  }

  await writeJson(path.join(backup.dir, `${mode}-plan.json`), {
    mode,
    targets: targets.map(summarizeImage),
    uploads: migration.uploads,
    verificationBeforePatch,
  })

  const patchResult = await patchWorkspaceState(row.updated_at, migration.nextState)
  const refreshed = await fetchWorkspaceState()
  const refreshedInventory = buildInventory(refreshed.state)
  const verificationAfterPatch = verifyPatchedState(row.state, refreshed.state, targets, migration.uploads)

  await writeJson(path.join(backup.dir, `${mode}-result.json`), {
    mode,
    backup,
    patchResult,
    before: summary.inventory,
    after: summarizeInventory(refreshed, refreshedInventory, backup).inventory,
    uploads: migration.uploads,
    verificationAfterPatch,
  })

  if (!verificationAfterPatch.ok) {
    throw new Error(`Patch verification failed: ${verificationAfterPatch.error}`)
  }

  printJson({
    mode,
    workspaceId,
    backup,
    patchResult,
    before: summary.inventory,
    after: summarizeInventory(refreshed, refreshedInventory, backup).inventory,
    targets: targets.map(summarizeImage),
    uploads: migration.uploads,
    verification: verificationAfterPatch,
    writesPerformed: true,
  })
}

async function runRollback() {
  const backupFile = values['backup-file']
  if (!backupFile) {
    throw new Error(`${mode} requires --backup-file pointing to a workspace_state backup JSON file.`)
  }

  const backup = JSON.parse(await readFile(backupFile, 'utf8'))
  if (!backup?.state || !backup?.workspaceId) {
    throw new Error('Backup file does not look like a workspace_state backup.')
  }
  if (backup.workspaceId !== workspaceId) {
    throw new Error(`Backup workspace_id ${backup.workspaceId} does not match requested ${workspaceId}.`)
  }

  const current = await fetchWorkspaceState()
  const currentSha256 = sha256(stableJson(current.state))
  const backupSha256 = sha256(stableJson(backup.state))

  if (mode === 'rollback-check') {
    printJson({
      mode,
      workspaceId,
      backupFile,
      currentUpdatedAt: current.updated_at,
      backupUpdatedAt: backup.updatedAt,
      currentSha256,
      backupSha256,
      currentEmbeddedImages: buildInventory(current.state).length,
      backupEmbeddedImages: buildInventory(backup.state).length,
      canRestoreBackup: true,
      writesPerformed: false,
    })
    return
  }

  requireYes(mode)
  const patchResult = await patchWorkspaceState(current.updated_at, backup.state)
  const restored = await fetchWorkspaceState()
  const restoredSha256 = sha256(stableJson(restored.state))

  if (restoredSha256 !== backupSha256) {
    throw new Error('Rollback verification failed: restored state hash does not match backup hash.')
  }

  printJson({
    mode,
    workspaceId,
    backupFile,
    patchResult,
    restoredSha256,
    writesPerformed: true,
  })
}

async function fetchWorkspaceState() {
  const { data, error } = await supabase
    .from('workspace_state')
    .select('state, updated_at')
    .eq('workspace_id', workspaceId)
    .single()

  if (error) {
    throw new Error(`workspace_state read failed: ${error.message}`)
  }
  if (!data?.state || !data.updated_at) {
    throw new Error(`workspace_state row not found for workspace_id=${workspaceId}`)
  }

  return {
    workspaceId,
    updated_at: data.updated_at,
    state: data.state,
  }
}

async function patchWorkspaceState(expectedUpdatedAt, nextState) {
  const { data, error } = await supabase
    .from('workspace_state')
    .update({ state: nextState })
    .eq('workspace_id', workspaceId)
    .eq('updated_at', expectedUpdatedAt)
    .select('updated_at')
    .single()

  if (error) {
    throw new Error(`workspace_state patch failed: ${error.message}`)
  }
  if (!data?.updated_at) {
    throw new Error('workspace_state patch failed: no row was updated, likely due to a concurrent edit.')
  }

  return {
    previousUpdatedAt: expectedUpdatedAt,
    updatedAt: data.updated_at,
  }
}

async function writeBackup(row) {
  const fetchedAt = new Date().toISOString()
  const dir = path.join(backupRoot, fetchedAt.replace(/[:.]/g, '-'))
  await mkdir(dir, { recursive: true })

  const payload = {
    workspaceId: row.workspaceId,
    updatedAt: row.updated_at,
    fetchedAt,
    state: row.state,
  }
  const json = stableJson(payload)
  const file = path.join(dir, `workspace_state-${row.workspaceId}.json`)
  await writeFile(file, json)

  return {
    dir,
    file,
    bytes: Buffer.byteLength(json),
    sha256: sha256(json),
    updatedAt: row.updated_at,
  }
}

function buildInventory(state) {
  const images = []

  for (const portfolio of state.portfolios ?? []) {
    for (const card of portfolio.cards ?? []) {
      if (typeof card.brief !== 'string' || !card.brief.includes('data:image')) {
        continue
      }

      const matches = findDataImages(card.brief)
      for (const match of matches) {
        const buffer = decodeBase64(match.base64)
        const bytes = buffer.byteLength
        const hash = sha256Buffer(buffer)
        const ext = extensionForMime(match.mime)
        images.push({
          key: `${portfolio.id}/${card.id}/brief/${match.index}`,
          portfolioId: portfolio.id,
          cardId: card.id,
          title: card.title,
          brand: card.brand,
          imageIndex: match.index,
          mime: match.mime,
          extension: ext,
          bytes,
          dataUrlBytes: Buffer.byteLength(match.dataUrl),
          sha256: hash,
          objectPath: buildObjectPath(portfolio.id, card.id, match.index, hash, ext),
        })
      }
    }
  }

  return images
}

function findDataImages(brief) {
  const matches = []
  DATA_IMAGE_RE.lastIndex = 0
  let match
  while ((match = DATA_IMAGE_RE.exec(brief))) {
    matches.push({
      index: matches.length,
      tag: match[0],
      quote: match[1],
      dataUrl: match[2],
      mime: `image/${match[3].toLowerCase()}`,
      base64: match[4].replace(/\s+/g, ''),
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return matches
}

function summarizeInventory(row, images, backup) {
  const stateJson = stableJson(row.state)
  const cards = new Set(images.map((image) => `${image.portfolioId}/${image.cardId}`))
  const totalRawImageBytes = images.reduce((total, image) => total + image.bytes, 0)
  const totalDataUrlBytes = images.reduce((total, image) => total + image.dataUrlBytes, 0)

  return {
    workspaceId,
    rowUpdatedAt: row.updated_at,
    backupFile: backup.file,
    inventory: {
      stateBytes: Buffer.byteLength(stateJson),
      stateSha256: sha256(stateJson),
      affectedCards: cards.size,
      embeddedImages: images.length,
      totalRawImageBytes,
      totalDataUrlBytes,
      largestImages: [...images].sort((a, b) => b.bytes - a.bytes).slice(0, 10).map(summarizeImage),
      smallestImages: [...images].sort((a, b) => a.bytes - b.bytes).slice(0, 10).map(summarizeImage),
    },
  }
}

function selectTargets(images) {
  if (mode === 'bulk') {
    return images
  }

  if (values['image-key']) {
    const target = images.find((image) => image.key === values['image-key'])
    if (!target) {
      throw new Error(`No embedded image found for --image-key ${values['image-key']}`)
    }
    return [target]
  }

  if (images.length === 0) {
    return []
  }

  const sorted = [...images]
  if (values.strategy === 'largest') {
    sorted.sort((a, b) => b.bytes - a.bytes)
  } else if (values.strategy === 'first') {
    sorted.sort((a, b) => a.key.localeCompare(b.key))
  } else {
    sorted.sort((a, b) => a.bytes - b.bytes)
  }

  return sorted.slice(0, 1)
}

async function migrateTargets(state, targets) {
  const targetKeys = new Set(targets.map((target) => target.key))
  const nextState = structuredClone(state)
  const uploads = []

  for (const portfolio of nextState.portfolios ?? []) {
    for (const card of portfolio.cards ?? []) {
      if (typeof card.brief !== 'string' || !card.brief.includes('data:image')) {
        continue
      }

      const matches = findDataImages(card.brief)
      const selectedMatches = matches.filter((match) =>
        targetKeys.has(`${portfolio.id}/${card.id}/brief/${match.index}`),
      )
      if (selectedMatches.length === 0) {
        continue
      }

      let nextBrief = card.brief
      for (const match of selectedMatches.reverse()) {
        const buffer = decodeBase64(match.base64)
        const hash = sha256Buffer(buffer)
        const ext = extensionForMime(match.mime)
        const objectPath = buildObjectPath(portfolio.id, card.id, match.index, hash, ext)
        const publicUrl = await uploadImage(objectPath, buffer, match.mime)
        const nextTag = match.tag.replace(match.dataUrl, publicUrl)
        nextBrief = `${nextBrief.slice(0, match.start)}${nextTag}${nextBrief.slice(match.end)}`
        uploads.push({
          key: `${portfolio.id}/${card.id}/brief/${match.index}`,
          portfolioId: portfolio.id,
          cardId: card.id,
          imageIndex: match.index,
          mime: match.mime,
          bytes: buffer.byteLength,
          sha256: hash,
          objectPath,
          publicUrl,
        })
      }
      card.brief = nextBrief
    }
  }

  return { nextState, uploads }
}

async function ensurePublicBucket(bucket) {
  const { data, error } = await supabase.storage.getBucket(bucket)
  if (!error && data) {
    if (!data.public) {
      throw new Error(`Storage bucket "${bucket}" exists but is private. Use a public bucket for stable <img> URLs.`)
    }
    return
  }

  const { error: createError } = await supabase.storage.createBucket(bucket, {
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
    fileSizeLimit: '30MB',
  })

  if (createError) {
    throw new Error(`Storage bucket create failed: ${createError.message}`)
  }
}

async function uploadImage(objectPath, buffer, contentType) {
  const { error } = await supabase.storage.from(bucketName).upload(objectPath, buffer, {
    cacheControl: '31536000',
    contentType,
    upsert: false,
  })

  if (error && !/already exists|resource already exists|duplicate/i.test(error.message)) {
    throw new Error(`Storage upload failed for ${objectPath}: ${error.message}`)
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(objectPath)
  if (!data?.publicUrl) {
    throw new Error(`Could not create public URL for ${objectPath}`)
  }

  const response = await fetch(data.publicUrl, { method: 'HEAD' })
  if (!response.ok) {
    throw new Error(`Uploaded image did not render over HTTP (${response.status}) for ${objectPath}`)
  }

  return data.publicUrl
}

function verifyMigrationShape(beforeState, afterState, targets) {
  if (targets.length === 0) {
    return { ok: false, error: 'no_targets_selected' }
  }

  const before = buildInventory(beforeState)
  const after = buildInventory(afterState)
  const expectedRemaining = before.length - targets.length
  if (after.length !== expectedRemaining) {
    return {
      ok: false,
      error: `expected ${expectedRemaining} embedded images after migration, found ${after.length}`,
    }
  }

  const changedBriefs = getChangedBriefs(beforeState, afterState)
  if (mode === 'canary' && changedBriefs.length !== 1) {
    return { ok: false, error: `canary should change exactly one card brief, changed ${changedBriefs.length}` }
  }

  return {
    ok: true,
    changedBriefs,
    embeddedImagesBefore: before.length,
    embeddedImagesAfter: after.length,
  }
}

function verifyPatchedState(beforeState, afterState, targets, uploads) {
  const shape = verifyMigrationShape(beforeState, afterState, targets)
  if (!shape.ok) {
    return shape
  }

  const stateJson = stableJson(afterState)
  for (const upload of uploads) {
    if (!stateJson.includes(upload.publicUrl)) {
      return { ok: false, error: `patched state does not contain uploaded URL for ${upload.key}` }
    }
  }

  return {
    ...shape,
    stateBytesBefore: Buffer.byteLength(stableJson(beforeState)),
    stateBytesAfter: Buffer.byteLength(stateJson),
    bytesReduced: Buffer.byteLength(stableJson(beforeState)) - Buffer.byteLength(stateJson),
  }
}

function getChangedBriefs(beforeState, afterState) {
  const beforeBriefs = new Map()
  for (const portfolio of beforeState.portfolios ?? []) {
    for (const card of portfolio.cards ?? []) {
      beforeBriefs.set(`${portfolio.id}/${card.id}`, card.brief ?? '')
    }
  }

  const changed = []
  for (const portfolio of afterState.portfolios ?? []) {
    for (const card of portfolio.cards ?? []) {
      const key = `${portfolio.id}/${card.id}`
      if (beforeBriefs.get(key) !== (card.brief ?? '')) {
        changed.push({ portfolioId: portfolio.id, cardId: card.id, title: card.title })
      }
    }
  }
  return changed
}

function buildObjectPath(portfolioId, cardId, imageIndex, hash, ext) {
  return [
    `workspace-${workspaceId}`,
    sanitizePathPart(portfolioId),
    sanitizePathPart(cardId),
    `brief-image-${hash.slice(0, 16)}.${ext}`,
  ].join('/')
}

function summarizeImage(image) {
  return {
    key: image.key,
    cardId: image.cardId,
    title: image.title,
    brand: image.brand,
    mime: image.mime,
    bytes: image.bytes,
    sha256: image.sha256,
    objectPath: image.objectPath,
  }
}

function extensionForMime(mime) {
  switch (mime) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    default:
      return 'bin'
  }
}

function sanitizePathPart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'
}

function decodeBase64(base64) {
  return Buffer.from(base64, 'base64')
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function sha256Buffer(value) {
  return createHash('sha256').update(value).digest('hex')
}

function stableJson(value) {
  return JSON.stringify(value, null, 2)
}

async function writeJson(file, value) {
  await writeFile(file, `${stableJson(value)}\n`)
}

function printJson(value) {
  console.log(stableJson(value))
}

function requireYes(writeMode) {
  if (!values.yes) {
    throw new Error(`${writeMode} performs live writes. Re-run with --yes after reviewing inventory and backup.`)
  }
}

async function loadEnvFile(file) {
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match || process.env[match[1]] !== undefined) {
      continue
    }

    process.env[match[1]] = unquoteEnvValue(match[2])
  }
}

function unquoteEnvValue(value) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}
