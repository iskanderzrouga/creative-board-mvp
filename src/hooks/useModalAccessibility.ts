import { useEffect, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('disabled') && element.getClientRects().length > 0,
  )
}

export function useModalAccessibility(
  containerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
) {
  useEffect(() => {
    if (!isOpen) {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }
    const modalElement: HTMLElement = container

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    const focusableElements = getFocusableElements(modalElement)
    const initialFocus = focusableElements[0] ?? modalElement
    const focusTimer = window.setTimeout(() => initialFocus.focus(), 0)

    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') {
        return
      }

      const nextFocusableElements = getFocusableElements(modalElement)
      if (nextFocusableElements.length === 0) {
        event.preventDefault()
        modalElement.focus()
        return
      }

      const first = nextFocusableElements[0]
      const last = nextFocusableElements[nextFocusableElements.length - 1]
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null

      if (event.shiftKey) {
        if (!activeElement || activeElement === first || !modalElement.contains(activeElement)) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (!activeElement || activeElement === last || !modalElement.contains(activeElement)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [containerRef, isOpen])
}
