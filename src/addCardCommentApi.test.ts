/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import commentHandler from '../api/workspace/add-card-comment'
import uploadImageHandler from '../api/workspace/upload-card-image'
import { createSeedState, type AppState } from './board'

const ORIGINAL_ENV = { ...process.env }
const PNG_ONE = 'data:image/png;base64,aGVsbG8='
const PNG_TWO = 'data:image/png;base64,d29ybGQ='
const PNG_THREE = 'data:image/png;base64,Y3JvcA=='

function managerAccess(portfolioId: string) {
  return {
    email: 'naomi@bluebrands.co',
    role_mode: 'manager',
    editor_name: 'Naomi',
    scope_mode: 'selected-portfolios',
    scope_assignments: [{ portfolioId, brandNames: [] }],
  }
}

function installWorkspaceFetchMock(options: {
  state: AppState
  updatedAt?: string
  onPatch?: (state: AppState) => void
  onStorageUpload?: (url: string, init?: RequestInit) => void
}) {
  let workspaceState = options.state
  let updatedAt = options.updatedAt ?? '2026-05-25T05:00:00.000Z'
  const portfolio = workspaceState.portfolios[0]!
  const storageUploads: string[] = []
  const patchBodies: AppState[] = []

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ email: 'naomi@bluebrands.co' }), { status: 200 })
    }

    if (url.includes('/rest/v1/workspace_access?')) {
      return new Response(JSON.stringify([managerAccess(portfolio.id)]), { status: 200 })
    }

    if (url.includes('/rest/v1/workspace_state?select=state')) {
      return new Response(JSON.stringify([{ state: workspaceState, updated_at: updatedAt }]), { status: 200 })
    }

    if (url.includes('/rest/v1/workspace_state?workspace_id=') && init?.method === 'PATCH') {
      const nextState = JSON.parse(String(init.body)).state as AppState
      workspaceState = nextState
      updatedAt = '2026-05-25T05:00:01.000Z'
      patchBodies.push(nextState)
      options.onPatch?.(nextState)
      return new Response(JSON.stringify([{ updated_at: updatedAt }]), { status: 200 })
    }

    if (url.includes('/storage/v1/object/editors-board-brief-images/') && init?.method === 'POST') {
      storageUploads.push(url)
      options.onStorageUpload?.(url, init)
      return new Response('', { status: 200 })
    }

    return new Response(JSON.stringify({ error: 'unexpected fetch', url }), { status: 500 })
  })

  return {
    get state() {
      return workspaceState
    },
    storageUploads,
    patchBodies,
  }
}

describe('workspace comment image API', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      REMOTE_WORKSPACE_ID: 'primary',
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...ORIGINAL_ENV }
  })

  it('stores multiple pasted comment images as Storage URLs instead of data URLs', async () => {
    const seed = createSeedState()
    const portfolio = seed.portfolios[0]!
    const card = portfolio.cards[0]!
    const mock = installWorkspaceFetchMock({ state: seed })

    const response = await commentHandler(
      new Request('https://app.example/api/workspace/add-card-comment', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'add',
          portfolioId: portfolio.id,
          cardId: card.id,
          comment: {
            id: 'comment-multi-image',
            author: 'Naomi',
            text: 'Compare both frames',
            timestamp: '2026-05-25T05:00:00.000Z',
            imageUrls: [PNG_ONE, PNG_TWO],
          },
        }),
      }),
    ) as Response

    const payload = (await response.json()) as { success: boolean; state?: AppState }
    const savedComment = payload.state?.portfolios[0]?.cards[0]?.comments[0]

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(mock.storageUploads).toHaveLength(2)
    expect(savedComment?.imageUrls).toHaveLength(2)
    expect(savedComment?.imageDataUrl).toBeUndefined()
    expect(JSON.stringify(payload.state)).not.toContain('data:image')
  })

  it('rejects unsupported comment image sources before patching workspace_state', async () => {
    const seed = createSeedState()
    const portfolio = seed.portfolios[0]!
    const card = portfolio.cards[0]!
    const mock = installWorkspaceFetchMock({ state: seed })

    const response = await commentHandler(
      new Request('https://app.example/api/workspace/add-card-comment', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'add',
          portfolioId: portfolio.id,
          cardId: card.id,
          comment: {
            id: 'comment-bad-image-source',
            author: 'Naomi',
            text: 'This should not persist',
            timestamp: '2026-05-25T05:00:00.000Z',
            imageUrls: ['data:image/png,this-is-not-base64'],
          },
        }),
      }),
    ) as Response
    const payload = (await response.json()) as { success: boolean; error?: string }

    expect(response.status).toBe(400)
    expect(payload.success).toBe(false)
    expect(payload.error).toBe('unsupported_comment_image_url')
    expect(mock.storageUploads).toHaveLength(0)
    expect(mock.patchBodies).toHaveLength(0)
  })

  it('edits and deletes comments through the same durable workspace_state route', async () => {
    const seed = createSeedState()
    const portfolio = seed.portfolios[0]!
    const card = portfolio.cards[0]!
    const seededComment = {
      id: 'comment-editable',
      author: 'Naomi',
      text: 'Original note',
      timestamp: '2026-05-25T05:00:00.000Z',
      imageUrls: [
        'https://supabase.example/storage/v1/object/public/editors-board-brief-images/workspace-primary/card/comment.png',
      ],
    }
    const stateWithComment = {
      ...seed,
      portfolios: seed.portfolios.map((item) =>
        item.id === portfolio.id
          ? {
              ...item,
              cards: item.cards.map((candidate) =>
                candidate.id === card.id
                  ? { ...candidate, comments: [seededComment], updatedAt: seededComment.timestamp }
                  : candidate,
              ),
            }
          : item,
      ),
    }
    const mock = installWorkspaceFetchMock({ state: stateWithComment })

    const editResponse = await commentHandler(
      new Request('https://app.example/api/workspace/add-card-comment', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'edit',
          portfolioId: portfolio.id,
          cardId: card.id,
          commentId: seededComment.id,
          comment: {
            ...seededComment,
            text: 'Updated note',
            editedAt: '2026-05-25T05:10:00.000Z',
            imageUrls: [...seededComment.imageUrls, PNG_THREE],
          },
        }),
      }),
    ) as Response
    const editPayload = (await editResponse.json()) as { success: boolean; state?: AppState }
    const editedComment = editPayload.state?.portfolios[0]?.cards[0]?.comments[0]

    expect(editResponse.status).toBe(200)
    expect(editPayload.success).toBe(true)
    expect(editedComment?.text).toBe('Updated note')
    expect(editedComment?.editedAt).toBe('2026-05-25T05:10:00.000Z')
    expect(editedComment?.imageUrls).toHaveLength(2)
    expect(JSON.stringify(editPayload.state)).not.toContain('data:image')

    const deleteResponse = await commentHandler(
      new Request('https://app.example/api/workspace/add-card-comment', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'delete',
          portfolioId: portfolio.id,
          cardId: card.id,
          commentId: seededComment.id,
        }),
      }),
    ) as Response
    const deletePayload = (await deleteResponse.json()) as { success: boolean; state?: AppState }

    expect(deleteResponse.status).toBe(200)
    expect(deletePayload.success).toBe(true)
    expect(deletePayload.state?.portfolios[0]?.cards[0]?.comments).toEqual([])
    expect(mock.patchBodies).toHaveLength(2)
  })

  it('preserves comment images on text-only edits and clears them when explicitly emptied', async () => {
    const seed = createSeedState()
    const portfolio = seed.portfolios[0]!
    const card = portfolio.cards[0]!
    const seededComment = {
      id: 'comment-image-preserve',
      author: 'Naomi',
      text: 'Original note',
      timestamp: '2026-05-25T05:00:00.000Z',
      imageUrls: [
        'https://supabase.example/storage/v1/object/public/editors-board-brief-images/workspace-primary/card/comment.png',
      ],
    }
    const stateWithComment = {
      ...seed,
      portfolios: seed.portfolios.map((item) =>
        item.id === portfolio.id
          ? {
              ...item,
              cards: item.cards.map((candidate) =>
                candidate.id === card.id
                  ? { ...candidate, comments: [seededComment], updatedAt: seededComment.timestamp }
                  : candidate,
              ),
            }
          : item,
      ),
    }
    const mock = installWorkspaceFetchMock({ state: stateWithComment })

    const textOnlyResponse = await commentHandler(
      new Request('https://app.example/api/workspace/add-card-comment', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'edit',
          portfolioId: portfolio.id,
          cardId: card.id,
          commentId: seededComment.id,
          comment: {
            id: seededComment.id,
            author: seededComment.author,
            text: 'Text-only update',
            timestamp: seededComment.timestamp,
            editedAt: '2026-05-25T05:10:00.000Z',
          },
        }),
      }),
    ) as Response
    const textOnlyPayload = (await textOnlyResponse.json()) as { success: boolean; state?: AppState }
    const preservedComment = textOnlyPayload.state?.portfolios[0]?.cards[0]?.comments[0]

    expect(textOnlyResponse.status).toBe(200)
    expect(preservedComment?.text).toBe('Text-only update')
    expect(preservedComment?.imageUrls).toEqual(seededComment.imageUrls)

    const clearImagesResponse = await commentHandler(
      new Request('https://app.example/api/workspace/add-card-comment', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'edit',
          portfolioId: portfolio.id,
          cardId: card.id,
          commentId: seededComment.id,
          comment: {
            id: seededComment.id,
            author: seededComment.author,
            text: 'Images cleared',
            timestamp: seededComment.timestamp,
            editedAt: '2026-05-25T05:20:00.000Z',
            imageUrls: [],
          },
        }),
      }),
    ) as Response
    const clearImagesPayload = (await clearImagesResponse.json()) as { success: boolean; state?: AppState }
    const clearedComment = clearImagesPayload.state?.portfolios[0]?.cards[0]?.comments[0]

    expect(clearImagesResponse.status).toBe(200)
    expect(clearedComment?.text).toBe('Images cleared')
    expect(clearedComment?.imageUrls).toEqual([])
    expect(mock.patchBodies).toHaveLength(2)
  })
})

describe('workspace brief image upload API', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      VITE_SUPABASE_ANON_KEY: 'anon-key',
      REMOTE_WORKSPACE_ID: 'primary',
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = { ...ORIGINAL_ENV }
  })

  it('uploads brief editor image bytes without patching workspace_state', async () => {
    const seed = createSeedState()
    const portfolio = seed.portfolios[0]!
    const card = portfolio.cards[0]!
    const mock = installWorkspaceFetchMock({ state: seed })

    const response = await uploadImageHandler(
      new Request('https://app.example/api/workspace/upload-card-image', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          portfolioId: portfolio.id,
          cardId: card.id,
          imageDataUrl: PNG_ONE,
          purpose: 'brief-image',
        }),
      }),
    ) as Response
    const payload = (await response.json()) as { success: boolean; imageUrl?: string }

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.imageUrl).toContain('/storage/v1/object/public/editors-board-brief-images/')
    expect(mock.storageUploads).toHaveLength(1)
    expect(mock.patchBodies).toHaveLength(0)
  })
})
