import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { getSupabaseClient } from '../supabase'

interface ImageAttachmentsProps {
  cardId: string
  attachments: string[]
  canEdit: boolean
  enabled: boolean
  onChange: (nextAttachments: string[]) => void
}

function extractStoragePathFromPublicUrl(publicUrl: string) {
  const marker = '/card-attachments/'
  const markerIndex = publicUrl.indexOf(marker)
  if (markerIndex === -1) {
    return null
  }
  const encodedPath = publicUrl.slice(markerIndex + marker.length)
  if (!encodedPath) {
    return null
  }
  return decodeURIComponent(encodedPath)
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '-')
}

export function ImageAttachments({
  cardId,
  attachments,
  canEdit,
  enabled,
  onChange,
}: ImageAttachmentsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const pathByUrl = useMemo(() => {
    const map = new Map<string, string>()
    for (const url of attachments) {
      const path = extractStoragePathFromPublicUrl(url)
      if (path) {
        map.set(url, path)
      }
    }
    return map
  }, [attachments])

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !enabled || attachments.length >= 3) {
      return
    }

    const supabase = getSupabaseClient()
    if (!supabase) {
      return
    }

    setIsUploading(true)
    setErrorMessage(null)
    try {
      const path = `${cardId}/${Date.now()}-${sanitizeFileName(file.name)}`
      const uploadResult = await supabase.storage.from('card-attachments').upload(path, file)
      if (uploadResult.error) {
        throw uploadResult.error
      }
      const { data } = supabase.storage.from('card-attachments').getPublicUrl(path)
      if (!data.publicUrl) {
        throw new Error('Unable to generate public URL for uploaded file.')
      }
      onChange([...attachments, data.publicUrl])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to upload image.')
    } finally {
      setIsUploading(false)
    }
  }

  async function handleRemoveAttachment(url: string) {
    const supabase = getSupabaseClient()
    if (supabase) {
      const path = pathByUrl.get(url)
      if (path) {
        await supabase.storage.from('card-attachments').remove([path])
      }
    }
    onChange(attachments.filter((item) => item !== url))
  }

  if (!enabled) {
    return null
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {attachments.map((url, index) => (
          <button
            key={`${url}-${index}`}
            type="button"
            onClick={() => setPreviewUrl(url)}
            style={{
              position: 'relative',
              width: 80,
              height: 80,
              borderRadius: 8,
              overflow: 'hidden',
              border: '1px solid rgba(148, 163, 184, 0.4)',
              padding: 0,
              cursor: 'pointer',
              background: '#0f172a',
            }}
            aria-label={`Open attachment ${index + 1}`}
          >
            <img
              src={url}
              alt={`Card attachment ${index + 1}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            {canEdit ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation()
                  void handleRemoveAttachment(url)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    void handleRemoveAttachment(url)
                  }
                }}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'rgba(15, 23, 42, 0.86)',
                  color: '#fff',
                  fontSize: 12,
                  lineHeight: '18px',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
                aria-label={`Delete attachment ${index + 1}`}
              >
                ×
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {canEdit && attachments.length < 3 ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(event) => {
              void handleFileChange(event)
            }}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            style={{ justifySelf: 'start' }}
          >
            {isUploading ? 'Uploading image…' : 'Add image'}
          </button>
        </>
      ) : null}

      {errorMessage ? (
        <p role="alert" style={{ margin: 0, color: '#fca5a5', fontSize: 12 }}>
          {errorMessage}
        </p>
      ) : null}

      {previewUrl ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Close image preview"
          onClick={() => setPreviewUrl(null)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setPreviewUrl(null)
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.84)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={(event) => {
              event.stopPropagation()
              setPreviewUrl(null)
            }}
            style={{
              position: 'fixed',
              top: 16,
              right: 16,
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              background: 'rgba(15, 23, 42, 0.9)',
              color: '#fff',
              fontSize: 24,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
          <img
            src={previewUrl}
            alt="Attachment preview"
            onClick={(event) => event.stopPropagation()}
            style={{
              maxWidth: 'min(96vw, 1400px)',
              maxHeight: '92vh',
              width: 'auto',
              height: 'auto',
              borderRadius: 12,
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
