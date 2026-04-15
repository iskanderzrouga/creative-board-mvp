import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, GlobalSettings, Portfolio } from '../board'
import { BoardCardSurface } from './BoardCardSurface'

interface SortableBoardCardProps {
  card: Card
  portfolio: Portfolio
  settings: GlobalSettings
  nowMs: number
  canDrag: boolean
  cursorMode: 'drag' | 'pointer'
  isInvalid: boolean
  onOpen: () => void
  onCyclePriority?: () => void
  showEditorStartButton?: boolean
  showEditorInProgress?: boolean
  canStartEditorTimer?: boolean
  onStartEditorTimer?: () => void
  canEditTitle?: boolean
  onSaveTitle?: (title: string) => void
}

function SortableBoardCardComponent({
  card,
  portfolio,
  settings,
  nowMs,
  canDrag,
  cursorMode,
  isInvalid,
  onOpen,
  onCyclePriority,
  showEditorStartButton,
  showEditorInProgress,
  canStartEditorTimer,
  onStartEditorTimer,
  canEditTitle,
  onSaveTitle,
}: SortableBoardCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    disabled: !canDrag,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className="sortable-card"
    >
      {isDragging ? (
        <div
          className={`sortable-card-placeholder ${isInvalid ? 'is-invalid' : ''}`}
          aria-hidden="true"
        />
      ) : (
        <BoardCardSurface
          card={card}
          portfolio={portfolio}
          settings={settings}
          nowMs={nowMs}
          onOpen={() => {
            if (!isDragging) {
              onOpen()
            }
          }}
          onCyclePriority={onCyclePriority}
          showEditorStartButton={showEditorStartButton}
          showEditorInProgress={showEditorInProgress}
          canStartEditorTimer={canStartEditorTimer}
          onStartEditorTimer={onStartEditorTimer}
          canEditTitle={canEditTitle}
          onSaveTitle={onSaveTitle}
          cursorMode={cursorMode}
          isDragging={isDragging}
          isInvalid={isInvalid && isDragging}
          attributes={attributes}
          listeners={listeners}
        />
      )}
    </div>
  )
}

export const SortableBoardCard = memo(SortableBoardCardComponent)
