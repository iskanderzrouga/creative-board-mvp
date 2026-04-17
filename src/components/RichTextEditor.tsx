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

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  readOnly = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!editorRef.current) {
      return
    }

    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = DOMPurify.sanitize(value)
    }
  }, [value])

  function handleInput() {
    onChange(editorRef.current?.innerHTML ?? '')
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

  function insertImage(dataUrl: string) {
    focusEditor()
    runCommand('insertImage', dataUrl)
    handleInput()
  }

  function handleFiles(files: FileList | null) {
    if (!files?.length) {
      return
    }

    const file = files[0]
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        insertImage(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (readOnly) {
      return
    }

    const items = Array.from(event.clipboardData.items)
    const imageItem = items.find((item) => item.type.startsWith('image/'))

    if (!imageItem) {
      return
    }

    event.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        insertImage(reader.result)
      }
    }
    reader.readAsDataURL(file)
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
          <button
            type="button"
            className="toolbar-button"
            onClick={() => fileInputRef.current?.click()}
          >
            Image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => handleFiles(event.target.files)}
          />
        </div>
      ) : null}

      <div
        ref={editorRef}
        className="rich-text-surface"
        style={{ overflowX: 'hidden', maxWidth: '100%', wordBreak: 'break-word' }}
        data-placeholder="Write brief here…"
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={onBlur}
        onPaste={handlePaste}
      />
    </div>
  )
}
