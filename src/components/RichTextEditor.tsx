import DOMPurify from 'dompurify'
import { useEffect, useRef, type ClipboardEvent } from 'react'

interface RichTextEditorProps {
  value: string
  onChange: (nextValue: string) => void
  onBlur?: () => void
  readOnly?: boolean
}

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
      }
    })
    html = template.innerHTML
  }

  return DOMPurify.sanitize(html, {
    FORBID_ATTR: ['style', 'class', 'id', 'srcset'],
  })
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  readOnly = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const isFocusedRef = useRef(false)

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

  function handleInput() {
    const rawValue = editorRef.current?.innerHTML ?? ''
    const shouldClean =
      rawValue.includes('<img') ||
      rawValue.includes('data:image') ||
      rawValue.includes('style=') ||
      rawValue.includes('class=') ||
      rawValue.includes('id=')
    const nextValue = shouldClean ? sanitizeRichTextHtml(rawValue) : rawValue
    if (shouldClean && editorRef.current && editorRef.current.innerHTML !== nextValue) {
      editorRef.current.innerHTML = nextValue
    }
    onChange(nextValue)
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

  function insertHtml(html: string) {
    focusEditor()
    runCommand('insertHTML', html)
    handleInput()
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (readOnly) {
      return
    }

    const html = event.clipboardData.getData('text/html')
    if (html) {
      event.preventDefault()
      const sanitizedHtml = sanitizeRichTextHtml(html)
      if (sanitizedHtml) {
        insertHtml(sanitizedHtml)
      }
      return
    }

    const items = Array.from(event.clipboardData.items)
    const imageItem = items.find((item) => item.type.startsWith('image/'))

    if (!imageItem) {
      return
    }

    event.preventDefault()
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
        </div>
      ) : null}

      <div
        ref={editorRef}
        className="rich-text-surface"
        style={{ overflowX: 'hidden', maxWidth: '100%', wordBreak: 'break-word' }}
        data-placeholder="Write brief here…"
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onFocus={() => {
          isFocusedRef.current = true
        }}
        onInput={handleInput}
        onBlur={() => {
          isFocusedRef.current = false
          onBlur?.()
        }}
        onPaste={handlePaste}
      />
    </div>
  )
}
