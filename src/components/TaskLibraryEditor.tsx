import { useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import {
  CARD_FIELDS,
  TASK_TYPE_CATEGORIES,
  type CardFieldKey,
  type GlobalSettings,
  type Portfolio,
  type TaskType,
  type TaskTypeCategory,
} from '../board'

type ToastTone = 'green' | 'amber' | 'red' | 'blue'

interface TaskLibraryEditorProps {
  settings: GlobalSettings
  portfolios: Portfolio[]
  onTaskTypeChange: (updater: (taskLibrary: TaskType[]) => TaskType[]) => void
  onDeleteTaskType: (taskTypeId: string) => void
  showToast: (message: string, tone: ToastTone) => void
}

export function TaskLibraryEditor({
  settings,
  portfolios,
  onTaskTypeChange,
  onDeleteTaskType,
  showToast,
}: TaskLibraryEditorProps) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [taskTypeToDelete, setTaskTypeToDelete] = useState<{ id: string; name: string; usageCount: number } | null>(null)

  function handleDelete(taskType: TaskType) {
    if (taskType.locked) {
      showToast('Custom task type cannot be deleted', 'red')
      return
    }

    const usageCount = portfolios.reduce(
      (sum, portfolio) => sum + portfolio.cards.filter((card) => card.taskTypeId === taskType.id).length,
      0,
    )
    setTaskTypeToDelete({
      id: taskType.id,
      name: taskType.name,
      usageCount,
    })
  }

  function reorderTaskTypes(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      return
    }

    onTaskTypeChange((current) => {
      const sorted = current.slice().sort((left, right) => left.order - right.order)
      const sourceIndex = sorted.findIndex((taskType) => taskType.id === sourceId)
      const targetIndex = sorted.findIndex((taskType) => taskType.id === targetId)

      if (sourceIndex === -1 || targetIndex === -1) {
        return current
      }

      const reordered = sorted.slice()
      const [moved] = reordered.splice(sourceIndex, 1)
      reordered.splice(targetIndex, 0, moved)

      return reordered.map((taskType, order) => ({
        ...taskType,
        order,
      }))
    })
  }

  const sortedTaskTypes = settings.taskLibrary.slice().sort((left, right) => left.order - right.order)

  return (
    <div className="settings-block">
      <div className="nested-settings-title">Task Types</div>
      <div className="settings-table full-table">
        <div className="settings-row settings-head task-library-head">
          <span>Type</span>
          <span>Category</span>
          <span>Color</span>
          <span>Hours</span>
          <span>Order</span>
          <span />
        </div>
        {sortedTaskTypes.map((taskType) => (
          <div
            key={taskType.id}
            className={`task-type-entry ${draggingTaskId === taskType.id ? 'is-dragging' : ''}`}
            draggable
            onDragStart={() => setDraggingTaskId(taskType.id)}
            onDragEnd={() => setDraggingTaskId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              if (draggingTaskId) {
                reorderTaskTypes(draggingTaskId, taskType.id)
              }
              setDraggingTaskId(null)
            }}
          >
            <div className="settings-row task-library-row">
              <input
                aria-label={`Task type name for ${taskType.name}`}
                value={taskType.name}
                onChange={(event) =>
                  onTaskTypeChange((current) =>
                    current.map((item) => (item.id === taskType.id ? { ...item, name: event.target.value } : item)),
                  )
                }
              />
              <select
                value={taskType.category}
                onChange={(event) =>
                  onTaskTypeChange((current) =>
                    current.map((item) =>
                      item.id === taskType.id ? { ...item, category: event.target.value as TaskTypeCategory } : item,
                    ),
                  )
                }
              >
                {TASK_TYPE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <div className="task-type-color-inputs">
                <input
                  type="color"
                  aria-label={`Task type color for ${taskType.name}`}
                  value={taskType.color}
                  onChange={(event) =>
                    onTaskTypeChange((current) =>
                      current.map((item) => (item.id === taskType.id ? { ...item, color: event.target.value } : item)),
                    )
                  }
                />
                <input
                  type="text"
                  aria-label={`Task type icon for ${taskType.name}`}
                  value={taskType.icon}
                  onChange={(event) =>
                    onTaskTypeChange((current) =>
                      current.map((item) => (item.id === taskType.id ? { ...item, icon: event.target.value } : item)),
                    )
                  }
                />
              </div>
              <input
                type="number"
                min={1}
                aria-label={`Task type hours for ${taskType.name}`}
                value={taskType.estimatedHours}
                onChange={(event) =>
                  onTaskTypeChange((current) =>
                    current.map((item) =>
                      item.id === taskType.id ? { ...item, estimatedHours: Number(event.target.value) || 1 } : item,
                    ),
                  )
                }
              />
              <div className="task-type-drag-handle" title="Drag to reorder">
                ⋮⋮
              </div>
              <div className="task-type-actions">
                <button
                  type="button"
                  className="clear-link"
                  onClick={() => setExpandedTaskId((current) => (current === taskType.id ? null : taskType.id))}
                >
                  {expandedTaskId === taskType.id ? 'Collapse' : 'Edit'}
                </button>
                <button type="button" className="clear-link danger-link" onClick={() => handleDelete(taskType)}>
                  Delete
                </button>
              </div>
            </div>
            {expandedTaskId === taskType.id ? (
              <div className="task-type-expanded">
                <label>
                  <span>Text color</span>
                  <input
                    type="color"
                    value={taskType.textColor}
                    onChange={(event) =>
                      onTaskTypeChange((current) =>
                        current.map((item) =>
                          item.id === taskType.id ? { ...item, textColor: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  <span>Required fields</span>
                  <input
                    value={taskType.requiredFields.join(', ')}
                    onChange={(event) =>
                      onTaskTypeChange((current) =>
                        current.map((item) =>
                          item.id === taskType.id
                            ? {
                                ...item,
                                requiredFields: event.target.value
                                  .split(',')
                                  .map((field) => field.trim())
                                  .filter((field): field is CardFieldKey => CARD_FIELDS.includes(field as CardFieldKey)),
                              }
                            : item,
                        ),
                      )
                    }
                    placeholder={CARD_FIELDS.join(', ')}
                  />
                </label>
                <label>
                  <span>Optional fields</span>
                  <input
                    value={taskType.optionalFields.join(', ')}
                    onChange={(event) =>
                      onTaskTypeChange((current) =>
                        current.map((item) =>
                          item.id === taskType.id
                            ? {
                                ...item,
                                optionalFields: event.target.value
                                  .split(',')
                                  .map((field) => field.trim())
                                  .filter((field): field is CardFieldKey => CARD_FIELDS.includes(field as CardFieldKey)),
                              }
                            : item,
                        ),
                      )
                    }
                    placeholder={CARD_FIELDS.join(', ')}
                  />
                </label>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="ghost-button"
        onClick={() =>
          onTaskTypeChange((current) => [
            ...current,
            {
              id: `task-type-${Date.now()}`,
              name: 'New Task Type',
              category: 'Other',
              icon: '⚡',
              color: '#e5e7eb',
              textColor: '#4b5563',
              estimatedHours: 5,
              requiredFields: [],
              optionalFields: [],
              isDefault: false,
              order: current.length,
            },
          ])
        }
      >
        + Add task type
      </button>

      {taskTypeToDelete ? (
        <ConfirmDialog
          title={`Delete ${taskTypeToDelete.name}?`}
          message={
            taskTypeToDelete.usageCount > 0 ? (
              <>
                <p>
                  <strong>{taskTypeToDelete.usageCount} cards</strong> currently use this type.
                </p>
                <p>Those cards will be reassigned to Custom after the task type is removed.</p>
              </>
            ) : (
              <p>This task type will be removed from the shared library.</p>
            )
          }
          confirmLabel="Delete task type"
          onCancel={() => setTaskTypeToDelete(null)}
          onConfirm={() => {
            onDeleteTaskType(taskTypeToDelete.id)
            setTaskTypeToDelete(null)
          }}
        />
      ) : null}
    </div>
  )
}
