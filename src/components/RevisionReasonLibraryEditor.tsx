import { useState } from 'react'
import { type GlobalSettings, type RevisionReason } from '../board'
import { ConfirmDialog } from './ConfirmDialog'

type ToastTone = 'green' | 'amber' | 'red' | 'blue'

interface RevisionReasonLibraryEditorProps {
  settings: GlobalSettings
  onRevisionReasonChange: (updater: (reasons: RevisionReason[]) => RevisionReason[]) => void
  onDeleteRevisionReason: (revisionReasonId: string) => void
  showToast: (message: string, tone: ToastTone) => void
}

function getSortedRevisionReasons(settings: GlobalSettings) {
  return settings.revisionReasons.slice().sort((left, right) => left.order - right.order)
}

export function RevisionReasonLibraryEditor({
  settings,
  onRevisionReasonChange,
  onDeleteRevisionReason,
  showToast,
}: RevisionReasonLibraryEditorProps) {
  const [draggingReasonId, setDraggingReasonId] = useState<string | null>(null)
  const [reasonToDelete, setReasonToDelete] = useState<RevisionReason | null>(null)

  function handleDelete(reason: RevisionReason) {
    if (reason.locked) {
      showToast('Other reason cannot be deleted', 'red')
      return
    }

    setReasonToDelete(reason)
  }

  function reorderReasons(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      return
    }

    onRevisionReasonChange((current) => {
      const sorted = current.slice().sort((left, right) => left.order - right.order)
      const sourceIndex = sorted.findIndex((reason) => reason.id === sourceId)
      const targetIndex = sorted.findIndex((reason) => reason.id === targetId)

      if (sourceIndex === -1 || targetIndex === -1) {
        return current
      }

      const reordered = sorted.slice()
      const [moved] = reordered.splice(sourceIndex, 1)
      reordered.splice(targetIndex, 0, moved)

      return reordered.map((reason, order) => ({
        ...reason,
        order,
      }))
    })
  }

  const sortedReasons = getSortedRevisionReasons(settings)

  return (
    <div className="settings-block">
      <div className="nested-settings-title">Revision Reasons</div>
      <div className="settings-table full-table">
        <div className="settings-row settings-head revision-reason-head">
          <span>Reason</span>
          <span>Default Hours</span>
          <span>Order</span>
          <span />
        </div>
        {sortedReasons.map((reason) => (
          <div
            key={reason.id}
            className={`task-type-entry ${draggingReasonId === reason.id ? 'is-dragging' : ''}`}
            draggable
            onDragStart={() => setDraggingReasonId(reason.id)}
            onDragEnd={() => setDraggingReasonId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              if (draggingReasonId) {
                reorderReasons(draggingReasonId, reason.id)
              }
              setDraggingReasonId(null)
            }}
          >
            <div className="settings-row revision-reason-row">
              <input
                aria-label={`Revision reason name for ${reason.name}`}
                value={reason.name}
                disabled={reason.locked}
                onChange={(event) =>
                  onRevisionReasonChange((current) =>
                    current.map((item) => (item.id === reason.id ? { ...item, name: event.target.value } : item)),
                  )
                }
              />
              <input
                type="number"
                min={1}
                step={0.5}
                aria-label={`Revision reason hours for ${reason.name}`}
                value={reason.estimatedHours}
                onChange={(event) =>
                  onRevisionReasonChange((current) =>
                    current.map((item) =>
                      item.id === reason.id ? { ...item, estimatedHours: Number(event.target.value) || 1 } : item,
                    ),
                  )
                }
              />
              <div className="task-type-drag-handle" title="Drag to reorder">
                ⋮⋮
              </div>
              <div className="task-type-actions">
                <button type="button" className="clear-link danger-link" onClick={() => handleDelete(reason)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="ghost-button"
        onClick={() =>
          onRevisionReasonChange((current) => [
            ...current,
            {
              id: `revision-reason-${Date.now()}`,
              name: 'New reason',
              estimatedHours: 4,
              order: current.length,
            },
          ])
        }
      >
        + Add revision reason
      </button>

      {reasonToDelete ? (
        <ConfirmDialog
          title={`Delete ${reasonToDelete.name}?`}
          message={<p>This revision reason will be removed from the shared library.</p>}
          confirmLabel="Delete reason"
          onCancel={() => setReasonToDelete(null)}
          onConfirm={() => {
            onDeleteRevisionReason(reasonToDelete.id)
            setReasonToDelete(null)
          }}
        />
      ) : null}
    </div>
  )
}
