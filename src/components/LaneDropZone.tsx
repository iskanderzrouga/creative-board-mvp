import { memo, type ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { LaneModel } from '../board'

interface LaneDropZoneProps {
  lane: LaneModel
  isHovered: boolean
  isBlocked: boolean
  dragActive: boolean
  allowEmptyHint: boolean
  children: ReactNode
}

function LaneDropZoneComponent({
  lane,
  isHovered,
  isBlocked,
  dragActive,
  allowEmptyHint,
  children,
}: LaneDropZoneProps) {
  const { setNodeRef } = useDroppable({
    id: lane.id,
  })

  const showDropHint = allowEmptyHint && dragActive && isHovered && lane.cards.length === 0

  return (
    <div
      ref={setNodeRef}
      className={`lane-body ${isHovered ? 'is-over' : ''} ${
        isBlocked ? 'is-capacity-blocked' : ''
      } ${lane.cards.length === 0 ? 'is-empty' : ''}`}
    >
      {children}
      {showDropHint ? (
        <div className={`lane-drop-hint ${isBlocked ? 'is-danger' : ''}`}>
          {isBlocked ? 'At capacity — finish or move a task first' : 'Drop here'}
        </div>
      ) : null}
      {isBlocked && lane.cards.length > 0 ? (
        <div className="lane-inline-toast">At capacity — finish or move a task first</div>
      ) : null}
    </div>
  )
}

export const LaneDropZone = memo(LaneDropZoneComponent)
