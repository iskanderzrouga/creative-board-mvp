import DOMPurify from 'dompurify'
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'

interface RichTextEditorProps {
  value: string
  onChange: (nextValue: string) => void
  onCommit?: (nextValue: string) => void
  onBlur?: () => void
  readOnly?: boolean
  onImageUpload?: (imageDataUrl: string, purpose?: string) => Promise<string>
  placeholder?: string
}

const DEFAULT_IMAGE_WIDTH = 520
const MIN_IMAGE_WIDTH = 160
const MAX_IMAGE_WIDTH = 960
const MAX_BRIEF_IMAGES_PER_PASTE = 12
const CHECKLIST_TOGGLE_ZONE_PX = 26
const TRANSPARENT_BACKGROUND_VALUES = new Set(['', 'transparent', 'initial', 'inherit', 'unset', 'none'])
const PLAIN_BACKGROUND_VALUES = new Set(['white', '#fff', '#ffffff', 'rgb(255, 255, 255)', 'rgba(255, 255, 255, 1)'])

type BlockCommandId =
  | 'text'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'numbered'
  | 'todo'
  | 'quote'
  | 'code'
  | 'divider'

interface SlashMenuItem {
  id: BlockCommandId
  label: string
  hint: string
  keywords: string[]
  glyph: string
}

const SLASH_MENU_ITEMS: SlashMenuItem[] = [
  { id: 'text', label: 'Text', hint: 'Plain paragraph', keywords: ['paragraph', 'plain', 'text'], glyph: 'T' },
  { id: 'h1', label: 'Heading 1', hint: 'Large section heading', keywords: ['h1', 'title', 'heading'], glyph: 'H1' },
  { id: 'h2', label: 'Heading 2', hint: 'Medium section heading', keywords: ['h2', 'heading'], glyph: 'H2' },
  { id: 'h3', label: 'Heading 3', hint: 'Small section heading', keywords: ['h3', 'heading'], glyph: 'H3' },
  { id: 'bullet', label: 'Bullet list', hint: 'Simple bulleted list', keywords: ['ul', 'list', 'bullet'], glyph: '•' },
  { id: 'numbered', label: 'Numbered list', hint: 'List with numbers', keywords: ['ol', 'ordered', 'numbered'], glyph: '1.' },
  { id: 'todo', label: 'To-do list', hint: 'Checklist with checkboxes', keywords: ['todo', 'check', 'task', 'checkbox'], glyph: '✓' },
  { id: 'quote', label: 'Quote', hint: 'Highlighted quote block', keywords: ['blockquote', 'quote', 'callout'], glyph: '❝' },
  { id: 'code', label: 'Code block', hint: 'Monospaced block', keywords: ['pre', 'code', 'mono'], glyph: '<>' },
  { id: 'divider', label: 'Divider', hint: 'Horizontal rule', keywords: ['hr', 'rule', 'line', 'separator'], glyph: '—' },
]

const MARKDOWN_BLOCK_SHORTCUTS: Record<string, BlockCommandId> = {
  '#': 'h1',
  '##': 'h2',
  '###': 'h3',
  '-': 'bullet',
  '*': 'bullet',
  '1.': 'numbered',
  '[]': 'todo',
  '[ ]': 'todo',
  '>': 'quote',
}

interface FormatState {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  block: string
  list: '' | 'bullet' | 'numbered' | 'todo'
}

const EMPTY_FORMAT_STATE: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  block: 'p',
  list: '',
}

function runCommand(command: string, value?: string) {
  if (typeof document === 'undefined') {
    return
  }

  document.execCommand(command, false, value)
}

function isBoldWeight(value: string) {
  const normalizedValue = value.trim().toLowerCase()
  if (normalizedValue === 'bold' || normalizedValue === 'bolder') {
    return true
  }

  const numericWeight = Number.parseInt(normalizedValue, 10)
  return Number.isFinite(numericWeight) && numericWeight >= 600
}

function isHighlightedBackground(value: string) {
  const normalizedValue = value.trim().toLowerCase()
  if (TRANSPARENT_BACKGROUND_VALUES.has(normalizedValue) || PLAIN_BACKGROUND_VALUES.has(normalizedValue)) {
    return false
  }

  const rgbaMatch = normalizedValue.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*(0(?:\.0+)?)\)$/)
  return !rgbaMatch
}

function wrapElementContents(element: Element, tagName: string) {
  if (element.childNodes.length === 0 || element.tagName.toLowerCase() === tagName) {
    return
  }

  const wrapper = document.createElement(tagName)
  while (element.firstChild) {
    wrapper.appendChild(element.firstChild)
  }
  element.appendChild(wrapper)
}

function preservePastedFormatting(root: DocumentFragment) {
  Array.from(root.querySelectorAll<HTMLElement>('[style]')).forEach((element) => {
    const { backgroundColor, fontStyle, fontWeight } = element.style

    if (isHighlightedBackground(backgroundColor)) {
      wrapElementContents(element, 'mark')
    }

    if (fontStyle.trim().toLowerCase() === 'italic' || fontStyle.trim().toLowerCase() === 'oblique') {
      wrapElementContents(element, 'em')
    }

    if (isBoldWeight(fontWeight)) {
      wrapElementContents(element, 'strong')
    }
  })
}

function sanitizeRichTextHtml(html: string) {
  if (typeof document !== 'undefined') {
    const template = document.createElement('template')
    template.innerHTML = html
    preservePastedFormatting(template.content)
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

function closestWithinRoot(node: Node | null, selector: string, root: HTMLElement | null): HTMLElement | null {
  if (!node || !root) {
    return null
  }

  const element = node instanceof HTMLElement ? node : node.parentElement
  const match = element?.closest(selector) ?? null
  return match && match !== root && root.contains(match) ? (match as HTMLElement) : null
}

function setCaretInside(element: HTMLElement, collapseToEnd = true) {
  const selection = window.getSelection()
  if (!selection) {
    return
  }

  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(!collapseToEnd)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function RichTextEditor({
  value,
  onChange,
  onCommit,
  onBlur,
  readOnly = false,
  onImageUpload,
  placeholder = 'Write here... Type "/" for blocks',
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const isFocusedRef = useRef(false)
  const savedRangeRef = useRef<Range | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [formatState, setFormatState] = useState<FormatState>(EMPTY_FORMAT_STATE)
  const [slashMenu, setSlashMenu] = useState<{ query: string; top: number; left: number } | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)

  const filteredSlashItems = slashMenu
    ? SLASH_MENU_ITEMS.filter((item) => {
        const query = slashMenu.query.trim().toLowerCase()
        if (!query) {
          return true
        }
        return (
          item.label.toLowerCase().includes(query) ||
          item.keywords.some((keyword) => keyword.startsWith(query))
        )
      })
    : []

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

  useEffect(() => {
    if (slashMenu && filteredSlashItems.length === 0) {
      setSlashMenu(null)
    }
  }, [slashMenu, filteredSlashItems.length])

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

  function getCaretBlockInfo(): { block: HTMLElement; textBefore: string } | null {
    const root = editorRef.current
    if (typeof window === 'undefined' || !root) {
      return null
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
      return null
    }

    const range = selection.getRangeAt(0)
    if (!root.contains(range.startContainer)) {
      return null
    }

    let block: HTMLElement | null =
      range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement
    while (block && block !== root && block.parentElement !== root) {
      block = block.parentElement
    }
    if (!block) {
      return null
    }

    const probe = range.cloneRange()
    probe.selectNodeContents(block)
    probe.setEnd(range.startContainer, range.startOffset)
    return { block, textBefore: probe.toString() }
  }

  function refreshFormatState() {
    if (readOnly || typeof document === 'undefined' || typeof window === 'undefined') {
      return
    }

    const root = editorRef.current
    const selection = window.getSelection()
    if (!root || !selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) {
      return
    }

    let bold = false
    let italic = false
    let underline = false
    let strike = false
    try {
      bold = document.queryCommandState('bold')
      italic = document.queryCommandState('italic')
      underline = document.queryCommandState('underline')
      strike = document.queryCommandState('strikeThrough')
    } catch {
      // queryCommandState can throw in detached/odd selection states; keep defaults
    }

    const anchor = selection.anchorNode
    const heading = closestWithinRoot(anchor, 'h1, h2, h3', root)
    const blockquote = closestWithinRoot(anchor, 'blockquote', root)
    const pre = closestWithinRoot(anchor, 'pre', root)
    const orderedList = closestWithinRoot(anchor, 'ol', root)
    const unorderedList = closestWithinRoot(anchor, 'ul', root)

    setFormatState({
      bold,
      italic,
      underline,
      strike,
      block: heading ? heading.tagName.toLowerCase() : blockquote ? 'blockquote' : pre ? 'pre' : 'p',
      list: orderedList
        ? 'numbered'
        : unorderedList
          ? unorderedList.getAttribute('data-checklist') === 'true'
            ? 'todo'
            : 'bullet'
          : '',
    })
  }

  function handleInput(options: { commit?: boolean } = {}) {
    normalizeChecklists()
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
    refreshFormatState()
    updateSlashMenuFromCaret()
  }

  function normalizeChecklists() {
    const root = editorRef.current
    if (!root) {
      return
    }

    root.querySelectorAll('ul[data-checklist="true"] > li').forEach((item) => {
      if (!item.hasAttribute('data-checked')) {
        item.setAttribute('data-checked', 'false')
      }
    })
  }

  function updateSlashMenuFromCaret() {
    if (readOnly) {
      return
    }

    const root = editorRef.current
    const wrapper = wrapperRef.current
    if (!root || !wrapper || typeof window === 'undefined') {
      setSlashMenu(null)
      return
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
      setSlashMenu(null)
      return
    }

    const range = selection.getRangeAt(0)
    const caretNode = range.startContainer
    if (!root.contains(caretNode) || caretNode.nodeType !== Node.TEXT_NODE) {
      setSlashMenu(null)
      return
    }

    // Only look at the caret's own text node so list/sibling text never masks the trigger
    const textBefore = (caretNode.textContent ?? '').slice(0, range.startOffset)
    const match = textBefore.match(/(?:^|\s)\/([a-z0-9-]*)$/i)
    if (!match) {
      setSlashMenu(null)
      return
    }

    const caretRect = selection.getRangeAt(0).getBoundingClientRect()
    const wrapperRect = wrapper.getBoundingClientRect()
    const anchorRect = caretRect.width === 0 && caretRect.height === 0 ? wrapperRect : caretRect
    setSlashMenu((previous) => {
      const next = {
        query: match[1],
        top: anchorRect.bottom - wrapperRect.top + 6,
        left: Math.max(0, anchorRect.left - wrapperRect.left),
      }
      if (previous && previous.query === next.query && previous.top === next.top && previous.left === next.left) {
        return previous
      }
      return next
    })
    setSlashIndex(0)
  }

  function focusEditor() {
    editorRef.current?.focus()
  }

  function toggleChecklist() {
    const root = editorRef.current
    if (!root || typeof window === 'undefined') {
      return
    }

    const selection = window.getSelection()
    const currentList = closestWithinRoot(selection?.anchorNode ?? null, 'ul', root)

    if (currentList && currentList.getAttribute('data-checklist') === 'true') {
      runCommand('insertUnorderedList')
      return
    }

    if (currentList) {
      currentList.setAttribute('data-checklist', 'true')
      currentList.querySelectorAll(':scope > li').forEach((item) => {
        if (!item.hasAttribute('data-checked')) {
          item.setAttribute('data-checked', 'false')
        }
      })
      return
    }

    runCommand('insertUnorderedList')
    const nextSelection = window.getSelection()
    const newList = closestWithinRoot(nextSelection?.anchorNode ?? null, 'ul', root)
    if (newList) {
      newList.setAttribute('data-checklist', 'true')
      newList.querySelectorAll(':scope > li').forEach((item) => {
        item.setAttribute('data-checked', 'false')
      })
    }
  }

  function applyBlockCommand(commandId: BlockCommandId) {
    focusEditor()

    switch (commandId) {
      case 'text':
        runCommand('formatBlock', 'p')
        break
      case 'h1':
      case 'h2':
      case 'h3':
        runCommand('formatBlock', commandId)
        break
      case 'quote':
        runCommand('formatBlock', 'blockquote')
        break
      case 'code':
        runCommand('formatBlock', 'pre')
        break
      case 'bullet': {
        const root = editorRef.current
        const selection = window.getSelection()
        const currentList = closestWithinRoot(selection?.anchorNode ?? null, 'ul', root)
        if (currentList && currentList.getAttribute('data-checklist') === 'true') {
          currentList.removeAttribute('data-checklist')
          currentList.querySelectorAll(':scope > li').forEach((item) => item.removeAttribute('data-checked'))
        } else {
          runCommand('insertUnorderedList')
        }
        break
      }
      case 'numbered':
        runCommand('insertOrderedList')
        break
      case 'todo':
        toggleChecklist()
        break
      case 'divider': {
        runCommand('insertHTML', '<hr /><p><br /></p>')
        break
      }
    }

    handleInput()
  }

  function handleToolbarBlock(commandId: BlockCommandId) {
    focusEditor()
    restoreSelection()
    applyBlockCommand(commandId)
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
    restoreSelection()
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

  function applySlashItem(item: SlashMenuItem) {
    const queryLength = (slashMenu?.query.length ?? 0) + 1
    if (typeof window !== 'undefined') {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0 && selection.isCollapsed) {
        const range = selection.getRangeAt(0)
        const node = range.startContainer
        if (node.nodeType === Node.TEXT_NODE && range.startOffset >= queryLength) {
          const deletion = document.createRange()
          deletion.setStart(node, range.startOffset - queryLength)
          deletion.setEnd(node, range.startOffset)
          deletion.deleteContents()
        }
      }
    }

    setSlashMenu(null)
    applyBlockCommand(item.id)
  }

  function tryMarkdownBlockShortcut(event: ReactKeyboardEvent<HTMLDivElement>) {
    const root = editorRef.current
    const info = getCaretBlockInfo()
    if (!root || !info) {
      return
    }

    let { block } = info
    if (block === root) {
      runCommand('formatBlock', 'p')
      const reinfo = getCaretBlockInfo()
      if (!reinfo || reinfo.block === root) {
        return
      }
      block = reinfo.block
    }

    const tag = block.tagName.toLowerCase()
    if (tag !== 'p' && tag !== 'div') {
      return
    }

    const prefix = (block.textContent ?? '').trim()
    const commandId = MARKDOWN_BLOCK_SHORTCUTS[prefix]
    if (!commandId || info.textBefore.trim() !== prefix) {
      return
    }

    event.preventDefault()
    block.textContent = ''
    const lineBreak = document.createElement('br')
    block.appendChild(lineBreak)
    setCaretInside(block)
    applyBlockCommand(commandId)
  }

  function tryDividerShortcut(event: ReactKeyboardEvent<HTMLDivElement>) {
    const root = editorRef.current
    const info = getCaretBlockInfo()
    if (!root || !info || info.block === root) {
      return
    }

    const text = (info.block.textContent ?? '').trim()
    if (text !== '---' && text !== '***') {
      return
    }

    event.preventDefault()
    const divider = document.createElement('hr')
    const paragraph = document.createElement('p')
    paragraph.appendChild(document.createElement('br'))
    info.block.replaceWith(divider)
    divider.after(paragraph)
    setCaretInside(paragraph)
    handleInput()
  }

  function handleChecklistEnter() {
    const root = editorRef.current
    if (!root || typeof window === 'undefined') {
      return
    }

    const selection = window.getSelection()
    const listItem = closestWithinRoot(selection?.anchorNode ?? null, 'ul[data-checklist="true"] > li', root)
    if (!listItem) {
      return
    }

    window.requestAnimationFrame(() => {
      const nextSelection = window.getSelection()
      const nextItem = closestWithinRoot(nextSelection?.anchorNode ?? null, 'li', root)
      if (nextItem && nextItem !== listItem && nextItem.closest('ul')?.getAttribute('data-checklist') === 'true') {
        nextItem.setAttribute('data-checked', 'false')
        handleInput()
      }
    })
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (readOnly) {
      return
    }

    if (slashMenu && filteredSlashItems.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashIndex((index) => (index + 1) % filteredSlashItems.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashIndex((index) => (index - 1 + filteredSlashItems.length) % filteredSlashItems.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        applySlashItem(filteredSlashItems[Math.min(slashIndex, filteredSlashItems.length - 1)])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setSlashMenu(null)
        return
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.shiftKey) {
      if (event.key === '7') {
        event.preventDefault()
        applyBlockCommand('numbered')
        return
      }
      if (event.key === '8') {
        event.preventDefault()
        applyBlockCommand('bullet')
        return
      }
      if (event.key === '9') {
        event.preventDefault()
        applyBlockCommand('todo')
        return
      }
    }

    if (event.key === ' ') {
      tryMarkdownBlockShortcut(event)
      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      tryDividerShortcut(event)
      if (!event.defaultPrevented) {
        handleChecklistEnter()
      }
    }
  }

  function handleSurfaceClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (readOnly) {
      return
    }

    const target = event.target as HTMLElement
    const listItem = target.closest('li')
    if (!listItem || !editorRef.current?.contains(listItem)) {
      return
    }

    const list = listItem.closest('ul')
    if (!list || list.getAttribute('data-checklist') !== 'true') {
      return
    }

    const rect = listItem.getBoundingClientRect()
    if (event.clientX - rect.left > CHECKLIST_TOGGLE_ZONE_PX) {
      return
    }

    event.preventDefault()
    listItem.setAttribute('data-checked', listItem.getAttribute('data-checked') === 'true' ? 'false' : 'true')
    handleInput({ commit: true })
  }

  function renderToolbarButton(options: {
    label: string
    glyph: string
    isActive?: boolean
    onAction: () => void
    className?: string
  }) {
    return (
      <button
        type="button"
        className={`toolbar-button ${options.className ?? ''} ${options.isActive ? 'is-active' : ''}`}
        title={options.label}
        aria-label={options.label}
        aria-pressed={options.isActive ?? false}
        onMouseDown={(event) => {
          // keep editor selection alive while clicking the toolbar
          event.preventDefault()
        }}
        onClick={options.onAction}
      >
        {options.glyph}
      </button>
    )
  }

  function runInlineCommand(command: string) {
    focusEditor()
    restoreSelection()
    runCommand(command)
    handleInput()
  }

  return (
    <div
      ref={wrapperRef}
      className={`rich-text-editor ${readOnly ? 'is-readonly' : ''}`}
      style={{ overflowX: 'hidden', maxWidth: '100%', wordBreak: 'break-word', position: 'relative' }}
    >
      {!readOnly ? (
        <div className="rich-text-toolbar" role="toolbar" aria-label="Text formatting">
          <div className="toolbar-group">
            {renderToolbarButton({
              label: 'Heading 1',
              glyph: 'H1',
              isActive: formatState.block === 'h1',
              onAction: () => handleToolbarBlock(formatState.block === 'h1' ? 'text' : 'h1'),
            })}
            {renderToolbarButton({
              label: 'Heading 2',
              glyph: 'H2',
              isActive: formatState.block === 'h2',
              onAction: () => handleToolbarBlock(formatState.block === 'h2' ? 'text' : 'h2'),
            })}
            {renderToolbarButton({
              label: 'Heading 3',
              glyph: 'H3',
              isActive: formatState.block === 'h3',
              onAction: () => handleToolbarBlock(formatState.block === 'h3' ? 'text' : 'h3'),
            })}
          </div>
          <span className="toolbar-divider" aria-hidden="true" />
          <div className="toolbar-group">
            {renderToolbarButton({
              label: 'Bold',
              glyph: 'B',
              className: 'glyph-bold',
              isActive: formatState.bold,
              onAction: () => runInlineCommand('bold'),
            })}
            {renderToolbarButton({
              label: 'Italic',
              glyph: 'I',
              className: 'glyph-italic',
              isActive: formatState.italic,
              onAction: () => runInlineCommand('italic'),
            })}
            {renderToolbarButton({
              label: 'Underline',
              glyph: 'U',
              className: 'glyph-underline',
              isActive: formatState.underline,
              onAction: () => runInlineCommand('underline'),
            })}
            {renderToolbarButton({
              label: 'Strikethrough',
              glyph: 'S',
              className: 'glyph-strike',
              isActive: formatState.strike,
              onAction: () => runInlineCommand('strikeThrough'),
            })}
            {renderToolbarButton({
              label: 'Highlight',
              glyph: 'HL',
              className: 'glyph-highlight',
              onAction: () => {
                focusEditor()
                restoreSelection()
                runCommand('hiliteColor', '#fff3a3')
                handleInput()
              },
            })}
          </div>
          <span className="toolbar-divider" aria-hidden="true" />
          <div className="toolbar-group">
            {renderToolbarButton({
              label: 'Bullet list',
              glyph: '•≡',
              isActive: formatState.list === 'bullet',
              onAction: () => handleToolbarBlock('bullet'),
            })}
            {renderToolbarButton({
              label: 'Numbered list',
              glyph: '1≡',
              isActive: formatState.list === 'numbered',
              onAction: () => handleToolbarBlock('numbered'),
            })}
            {renderToolbarButton({
              label: 'To-do list',
              glyph: '✓≡',
              isActive: formatState.list === 'todo',
              onAction: () => handleToolbarBlock('todo'),
            })}
          </div>
          <span className="toolbar-divider" aria-hidden="true" />
          <div className="toolbar-group">
            {renderToolbarButton({
              label: 'Quote',
              glyph: '❝',
              isActive: formatState.block === 'blockquote',
              onAction: () => handleToolbarBlock(formatState.block === 'blockquote' ? 'text' : 'quote'),
            })}
            {renderToolbarButton({
              label: 'Code block',
              glyph: '<>',
              isActive: formatState.block === 'pre',
              onAction: () => handleToolbarBlock(formatState.block === 'pre' ? 'text' : 'code'),
            })}
            {renderToolbarButton({
              label: 'Divider',
              glyph: '—',
              onAction: () => handleToolbarBlock('divider'),
            })}
          </div>
          <span className="toolbar-divider" aria-hidden="true" />
          <div className="toolbar-group">
            {renderToolbarButton({
              label: 'Link',
              glyph: '🔗',
              onAction: handleLinkInsert,
            })}
            {onImageUpload
              ? renderToolbarButton({
                  label: 'Image',
                  glyph: '🖼',
                  onAction: () => {
                    saveSelection()
                    imageInputRef.current?.click()
                  },
                })
              : null}
            {renderToolbarButton({
              label: 'Clear formatting',
              glyph: '⌫',
              onAction: () => {
                focusEditor()
                restoreSelection()
                runCommand('removeFormat')
                runCommand('formatBlock', 'p')
                handleInput()
              },
            })}
          </div>
          {isUploadingImage ? <span className="rich-text-upload-status">Uploading...</span> : null}
        </div>
      ) : null}

      {onImageUpload ? (
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            void handleImageFiles(files)
          }}
        />
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
        data-placeholder={placeholder}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onFocus={() => {
          isFocusedRef.current = true
          refreshFormatState()
        }}
        onInput={() => handleInput()}
        onBlur={() => {
          isFocusedRef.current = false
          setSlashMenu(null)
          onBlur?.()
        }}
        onPaste={(event) => {
          void handlePaste(event)
        }}
        onClick={handleSurfaceClick}
        onKeyDown={handleKeyDown}
        onKeyUp={() => {
          saveSelection()
          refreshFormatState()
        }}
        onMouseUp={() => {
          saveSelection()
          refreshFormatState()
        }}
      />

      {slashMenu && filteredSlashItems.length > 0 ? (
        <div
          className="slash-menu"
          role="listbox"
          aria-label="Insert block"
          style={{ top: slashMenu.top, left: slashMenu.left }}
        >
          {filteredSlashItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={index === slashIndex}
              className={`slash-menu-item ${index === slashIndex ? 'is-active' : ''}`}
              onMouseDown={(event) => {
                event.preventDefault()
              }}
              onClick={() => applySlashItem(item)}
              onMouseEnter={() => setSlashIndex(index)}
            >
              <span className="slash-menu-glyph" aria-hidden="true">
                {item.glyph}
              </span>
              <span className="slash-menu-copy">
                <span className="slash-menu-label">{item.label}</span>
                <span className="slash-menu-hint">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
