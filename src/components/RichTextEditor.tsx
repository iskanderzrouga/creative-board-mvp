import DOMPurify from 'dompurify'
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type MouseEvent,
} from 'react'

interface RichTextEditorProps {
  value: string
  onChange: (nextValue: string) => void
  onCommit?: (nextValue: string) => void
  onBlur?: () => void
  readOnly?: boolean
  onImageUpload?: (imageDataUrl: string, purpose?: string) => Promise<string>
}

interface SelectedImageState {
  src: string
  width: number
}

interface ImageEditorState {
  src: string
  width: number
  cropLeft: number
  cropTop: number
  cropRight: number
  cropBottom: number
  isSaving: boolean
  error: string | null
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

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Unable to prepare cropped image.'))
      }
    }
    reader.onerror = () => reject(new Error('Unable to prepare cropped image.'))
    reader.readAsDataURL(blob)
  })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load image for editing.'))
    image.src = src
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
  const selectedImageRef = useRef<HTMLImageElement | null>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [selectedImage, setSelectedImage] = useState<SelectedImageState | null>(null)
  const [imageEditor, setImageEditor] = useState<ImageEditorState | null>(null)
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

  function selectImage(image: HTMLImageElement) {
    selectedImageRef.current = image
    setSelectedImage({
      src: image.currentSrc || image.src,
      width: Number(image.getAttribute('width') ?? image.clientWidth) || DEFAULT_IMAGE_WIDTH,
    })
  }

  function handleSurfaceClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target
    if (target instanceof HTMLImageElement) {
      event.preventDefault()
      selectImage(target)
      if (readOnly) {
        setImageEditor({
          src: target.currentSrc || target.src,
          width: Number(target.getAttribute('width') ?? target.clientWidth) || DEFAULT_IMAGE_WIDTH,
          cropLeft: 0,
          cropTop: 0,
          cropRight: 0,
          cropBottom: 0,
          isSaving: false,
          error: null,
        })
      }
    }
  }

  function commitEditorValue() {
    handleInput({ commit: true })
  }

  function updateSelectedImageWidth(width: number, options: { commit?: boolean } = {}) {
    const image = selectedImageRef.current
    const nextWidth = Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, Math.round(width)))
    if (!image) {
      return
    }

    image.setAttribute('width', String(nextWidth))
    image.removeAttribute('height')
    setSelectedImage({
      src: image.currentSrc || image.src,
      width: nextWidth,
    })
    handleInput({ commit: options.commit })
  }

  function removeSelectedImage() {
    selectedImageRef.current?.remove()
    selectedImageRef.current = null
    setSelectedImage(null)
    handleInput({ commit: true })
  }

  function openImageEditor() {
    const image = selectedImageRef.current
    if (!image || !selectedImage) {
      return
    }

    setImageEditor({
      src: image.currentSrc || image.src,
      width: selectedImage.width,
      cropLeft: 0,
      cropTop: 0,
      cropRight: 0,
      cropBottom: 0,
      isSaving: false,
      error: null,
    })
  }

  async function saveImageEditor() {
    const image = selectedImageRef.current
    if (!imageEditor || (!readOnly && !image)) {
      return
    }

    if (readOnly) {
      setImageEditor(null)
      return
    }

    setImageEditor({ ...imageEditor, isSaving: true, error: null })
    try {
      const cropChanged =
        imageEditor.cropLeft > 0 ||
        imageEditor.cropTop > 0 ||
        imageEditor.cropRight > 0 ||
        imageEditor.cropBottom > 0

      let nextSrc = imageEditor.src
      if (cropChanged) {
        const loadedImage = await loadImage(imageEditor.src)
        const sourceWidth = loadedImage.naturalWidth || loadedImage.width
        const sourceHeight = loadedImage.naturalHeight || loadedImage.height
        const left = Math.floor(sourceWidth * (imageEditor.cropLeft / 100))
        const top = Math.floor(sourceHeight * (imageEditor.cropTop / 100))
        const right = Math.floor(sourceWidth * (imageEditor.cropRight / 100))
        const bottom = Math.floor(sourceHeight * (imageEditor.cropBottom / 100))
        const cropWidth = Math.max(1, sourceWidth - left - right)
        const cropHeight = Math.max(1, sourceHeight - top - bottom)
        const canvas = document.createElement('canvas')
        canvas.width = cropWidth
        canvas.height = cropHeight
        const context = canvas.getContext('2d')
        if (!context) {
          throw new Error('Image editor is not available.')
        }

        context.drawImage(loadedImage, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((nextBlob) => {
            if (nextBlob) {
              resolve(nextBlob)
            } else {
              reject(new Error('Unable to crop image.'))
            }
          }, 'image/png')
        })
        nextSrc = await uploadDataUrl(await blobToDataUrl(blob), 'brief-crop')
      }

      image?.setAttribute('src', nextSrc)
      image?.setAttribute('width', String(imageEditor.width))
      image?.removeAttribute('height')
      setSelectedImage({ src: nextSrc, width: imageEditor.width })
      setImageEditor(null)
      handleInput({ commit: true })
    } catch (error) {
      setImageEditor({
        ...imageEditor,
        isSaving: false,
        error: error instanceof Error ? error.message : 'Unable to save image.',
      })
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

      {selectedImage && !readOnly ? (
        <div className="rich-text-image-toolbar" role="toolbar" aria-label="Selected image">
          <input
            type="range"
            min={MIN_IMAGE_WIDTH}
            max={MAX_IMAGE_WIDTH}
            value={selectedImage.width}
            onChange={(event) => updateSelectedImageWidth(Number(event.target.value))}
            onMouseUp={commitEditorValue}
            onKeyUp={commitEditorValue}
            onBlur={commitEditorValue}
            aria-label="Image width"
          />
          <button type="button" className="toolbar-button" onClick={openImageEditor}>
            Crop
          </button>
          <button type="button" className="toolbar-button" onClick={removeSelectedImage}>
            Remove
          </button>
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
        onClick={handleSurfaceClick}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
      />

      {imageEditor ? (
        <div className="rich-text-image-modal" role="dialog" aria-modal="true" aria-label="Image editor">
          <div className="rich-text-image-dialog">
            <div className="rich-text-image-preview">
              <img
                src={imageEditor.src}
                alt=""
                style={{
                  clipPath: `inset(${imageEditor.cropTop}% ${imageEditor.cropRight}% ${imageEditor.cropBottom}% ${imageEditor.cropLeft}%)`,
                }}
              />
            </div>
            {!readOnly ? (
              <div className="rich-text-crop-grid">
                <label>
                  <span>Left</span>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    value={imageEditor.cropLeft}
                    onChange={(event) => setImageEditor({ ...imageEditor, cropLeft: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Top</span>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    value={imageEditor.cropTop}
                    onChange={(event) => setImageEditor({ ...imageEditor, cropTop: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Right</span>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    value={imageEditor.cropRight}
                    onChange={(event) => setImageEditor({ ...imageEditor, cropRight: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Bottom</span>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    value={imageEditor.cropBottom}
                    onChange={(event) => setImageEditor({ ...imageEditor, cropBottom: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Width</span>
                  <input
                    type="range"
                    min={MIN_IMAGE_WIDTH}
                    max={MAX_IMAGE_WIDTH}
                    value={imageEditor.width}
                    onChange={(event) => setImageEditor({ ...imageEditor, width: Number(event.target.value) })}
                  />
                </label>
              </div>
            ) : null}
            {imageEditor.error ? (
              <p className="rich-text-error" role="alert">
                {imageEditor.error}
              </p>
            ) : null}
            <div className="rich-text-image-actions">
              <button type="button" className="ghost-button" onClick={() => setImageEditor(null)}>
                Close
              </button>
              {!readOnly ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    void saveImageEditor()
                  }}
                  disabled={imageEditor.isSaving}
                >
                  {imageEditor.isSaving ? 'Saving...' : 'Save'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
