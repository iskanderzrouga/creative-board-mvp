import DOMPurify from 'dompurify'
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
} from 'react'

interface RichTextEditorProps {
  value: string
  onChange: (nextValue: string) => void
  onCommit?: (nextValue: string) => void
  onBlur?: () => void
  readOnly?: boolean
  onImageUpload?: (imageDataUrl: string, purpose?: string) => Promise<string>
}

const DEFAULT_IMAGE_WIDTH = 520
const MIN_IMAGE_WIDTH = 160
const MAX_IMAGE_WIDTH = 960
const MAX_BRIEF_IMAGES_PER_PASTE = 12

function runCommand(command: string, value?: string) {
  if (typeof document === 'undefined') {
    return
  }

  document.execCommand(command, false, value)
}

function sanitizeRichTextHtml(html: string) {
  if (typeof document !== 'undefined') {
    const template = document.createElement('template')
    template.innerHTML = html
    template.content.querySelectorAll('img').forEach((image) => {
      const source = image.getAttribute('src')?.trim().toLowerCase() ?? ''
      if (!source || source.startsWith('data:') || source.startsWith('blob:') || source.startsWith('file:')) {
        image.remove()
        return
      }

      const width = Number(image.getAttribute('width') ?? '')
      if (Number.isFinite(width) && width > 0) {
        image.setAttribute('width', String(Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, Math.round(width)))))
      } else {
        image.removeAttribute('width')
      }
      image.removeAttribute('height')
    })
    html = template.innerHTML
  }

  return DOMPurify.sanitize(html, {
    FORBID_ATTR: ['style', 'class', 'id', 'srcset'],
  })
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Unable to read image.'))
      }
    }
    reader.onerror = () => reject(new Error('Unable to read image.'))
    reader.readAsDataURL(file)
  })
}

export function RichTextEditor({
  value,
  onChange,
  onCommit,
  onBlur,
  readOnly = false,
  onImageUpload,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const isFocusedRef = useRef(false)
  const savedRangeRef = useRef<Range | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  useEffect(() => {
    if (!editorRef.current) {
      return
    }

    if (isFocusedRef.current) {
      return
    }

    const sanitizedValue = sanitizeRichTextHtml(value)
    if (editorRef.current.innerHTML !== sanitizedValue) {
      editorRef.current.innerHTML = sanitizedValue
    }
  }, [value])

  function saveSelection() {
    if (typeof window === 'undefined') {
      return
    }

    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange()
    }
  }

  function restoreSelection() {
    if (typeof window === 'undefined' || !savedRangeRef.current) {
      return
    }

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(savedRangeRef.current)
  }

  function handleInput(options: { commit?: boolean } = {}) {
    const rawValue = editorRef.current?.innerHTML ?? ''
    const shouldClean =
      rawValue.includes('<img') ||
      rawValue.includes('data:image') ||
      rawValue.includes('blob:') ||
      rawValue.includes('file:') ||
      rawValue.includes('style=') ||
      rawValue.includes('class=') ||
      rawValue.includes('id=')
    const nextValue = shouldClean ? sanitizeRichTextHtml(rawValue) : rawValue
    if (shouldClean && editorRef.current && editorRef.current.innerHTML !== nextValue) {
      editorRef.current.innerHTML = nextValue
    }
    onChange(nextValue)
    if (options.commit) {
      onCommit?.(nextValue)
    }
  }

  function focusEditor() {
    editorRef.current?.focus()
  }

  function handleLinkInsert() {
    const url = window.prompt('Paste a URL')?.trim()
    if (!url) {
      return
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return
    }

    focusEditor()
    runCommand('createLink', url)
    handleInput()
  }

  function insertHtml(html: string, options: { commit?: boolean } = {}) {
    focusEditor()
    restoreSelection()
    runCommand('insertHTML', html)
    handleInput(options)
  }

  async function uploadDataUrl(dataUrl: string, purpose = 'brief-image') {
    if (!onImageUpload) {
      throw new Error('Image upload is not available.')
    }

    return onImageUpload(dataUrl, purpose)
  }

  async function uploadImagesFromHtml(html: string) {
    if (!onImageUpload || !html.includes('data:image')) {
      return sanitizeRichTextHtml(html)
    }

    const template = document.createElement('template')
    template.innerHTML = html
    const images = Array.from(template.content.querySelectorAll('img')).slice(0, MAX_BRIEF_IMAGES_PER_PASTE)
    for (const image of images) {
      const source = image.getAttribute('src') ?? ''
      if (!source.startsWith('data:image')) {
        continue
      }

      const imageUrl = await uploadDataUrl(source)
      image.setAttribute('src', imageUrl)
      image.setAttribute('width', image.getAttribute('width') || String(DEFAULT_IMAGE_WIDTH))
      image.removeAttribute('height')
    }

    return sanitizeRichTextHtml(template.innerHTML)
  }

  async function handleImageFiles(files: File[]) {
    if (files.length === 0) {
      return
    }

    saveSelection()
    setUploadError(null)
    setIsUploadingImage(true)
    try {
      const snippets: string[] = []
      for (const file of files.slice(0, MAX_BRIEF_IMAGES_PER_PASTE)) {
        const dataUrl = await fileToDataUrl(file)
        const imageUrl = await uploadDataUrl(dataUrl)
        snippets.push(`<p><img src="${imageUrl}" width="${DEFAULT_IMAGE_WIDTH}" alt="" /></p>`)
      }
      insertHtml(snippets.join(''), { commit: true })
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Image upload failed.')
    } finally {
      setIsUploadingImage(false)
    }
  }

  async function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (readOnly) {
      return
    }

    const items = Array.from(event.clipboardData.items)
    const imageFiles = items
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))

    if (imageFiles.length > 0) {
      event.preventDefault()
      await handleImageFiles(imageFiles)
      return
    }

    const html = event.clipboardData.getData('text/html')
    if (html) {
      event.preventDefault()
      saveSelection()
      setUploadError(null)
      setIsUploadingImage(html.includes('data:image'))
      try {
        const sanitizedHtml = await uploadImagesFromHtml(html)
        if (sanitizedHtml) {
          insertHtml(sanitizedHtml, { commit: sanitizedHtml.includes('<img') })
        }
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Image upload failed.')
      } finally {
        setIsUploadingImage(false)
      }
    }
  }

  return (
    <div
      className={`rich-text-editor ${readOnly ? 'is-readonly' : ''}`}
      style={{ overflowX: 'hidden', maxWidth: '100%', wordBreak: 'break-word' }}
    >
      {!readOnly ? (
        <div className="rich-text-toolbar" role="toolbar" aria-label="Brief formatting">
          <button
            type="button"
            className="toolbar-button"
            onClick={() => {
              focusEditor()
              runCommand('bold')
              handleInput()
            }}
          >
            Bold
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => {
              focusEditor()
              runCommand('italic')
              handleInput()
            }}
          >
            Italic
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => {
              focusEditor()
              runCommand('insertUnorderedList')
              handleInput()
            }}
          >
            Bullets
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={handleLinkInsert}
          >
            Link
          </button>
          {isUploadingImage ? <span className="rich-text-upload-status">Uploading...</span> : null}
        </div>
      ) : null}

      {uploadError ? (
        <p className="rich-text-error" role="alert">
          {uploadError}
        </p>
      ) : null}

      <div
        ref={editorRef}
        className="rich-text-surface"
        style={{ overflowX: 'hidden', maxWidth: '100%', wordBreak: 'break-word' }}
        data-placeholder="Write brief here..."
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onFocus={() => {
          isFocusedRef.current = true
        }}
        onInput={() => handleInput()}
        onBlur={() => {
          isFocusedRef.current = false
          onBlur?.()
        }}
        onPaste={(event) => {
          void handlePaste(event)
        }}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
      />
    </div>
  )
}
