import { useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react'

interface UseResizablePanelOptions {
  defaultWidth: number
  minWidth?: number
}

interface UseResizablePanelResult {
  panelWidth: number
  dragHandleProps: HTMLAttributes<HTMLDivElement>
  dragHandleStyle: CSSProperties
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function useResizablePanel({
  defaultWidth,
  minWidth = 400,
}: UseResizablePanelOptions): UseResizablePanelResult {
  const [panelWidth, setPanelWidth] = useState(defaultWidth)
  const [isDragging, setIsDragging] = useState(false)
  const [isHoveringHandle, setIsHoveringHandle] = useState(false)
  const dragStartXRef = useRef(0)
  const dragStartWidthRef = useRef(defaultWidth)

  useEffect(() => {
    if (!isDragging) {
      return
    }

    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'

    function handleMouseMove(event: MouseEvent) {
      const dragDelta = dragStartXRef.current - event.clientX
      const maxWidth = window.innerWidth * 0.85
      const nextWidth = clamp(dragStartWidthRef.current + dragDelta, minWidth, maxWidth)
      setPanelWidth(nextWidth)
    }

    function stopDragging() {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopDragging)

    return () => {
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', stopDragging)
    }
  }, [isDragging, minWidth])

  const dragHandleProps = useMemo<HTMLAttributes<HTMLDivElement>>(
    () => ({
      onMouseDown: (event) => {
        event.preventDefault()
        dragStartXRef.current = event.clientX
        dragStartWidthRef.current = panelWidth
        setIsDragging(true)
      },
      onMouseEnter: () => setIsHoveringHandle(true),
      onMouseLeave: () => setIsHoveringHandle(false),
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-label': 'Resize detail panel',
    }),
    [panelWidth],
  )

  const dragHandleStyle = useMemo<CSSProperties>(
    () => ({
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 6,
      cursor: 'col-resize',
      zIndex: 10,
      background: isDragging || isHoveringHandle ? 'rgba(255,255,255,0.1)' : 'transparent',
    }),
    [isDragging, isHoveringHandle],
  )

  return {
    panelWidth,
    dragHandleProps,
    dragHandleStyle,
  }
}
