import { useState, type ReactElement } from 'react'

import {
  STAGES,
  STAGE_LABELS,
  USER_MAP,
  WORKER_IDS,
  canCommentOnTask,
  formatDateTimeLabel,
  formatDurationShort,
  getAgeToneFromMs,
  getStageHistorySegments,
  getTaskTimeInStageMs,
  type Attachment,
  type BrandId,
  type CommentItem,
  type Task,
  type TaskType,
  type UserId,
} from '../board'
import { RichTextEditor } from './RichTextEditor'

interface TaskDrawerProps {
  task: Task | null
  isNew: boolean
  viewerId: UserId
  nowMs: number
  onClose: () => void
  onSaveNewTask: () => void
  onFieldChange: (
    field: 'testId' | 'title' | 'brand' | 'type' | 'briefHtml',
    value: string,
  ) => void
  onAssigneeChange: (assigneeId: UserId | null) => void
  onAttachmentsChange: (attachments: Attachment[]) => void
  onAddComment: (body: string, parentId: string | null) => void
}

interface CommentNode {
  item: CommentItem
  children: CommentNode[]
}

function buildCommentTree(comments: CommentItem[]) {
  const nodes = new Map<string, CommentNode>()
  const roots: CommentNode[] = []

  for (const comment of comments) {
    nodes.set(comment.id, {
      item: comment,
      children: [],
    })
  }

  for (const comment of comments) {
    const node = nodes.get(comment.id)
    if (!node) {
      continue
    }

    if (comment.parentId && nodes.has(comment.parentId)) {
      nodes.get(comment.parentId)?.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

function formatMetaDate(isoString: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(isoString))
}

function getTypeClassName(task: Task) {
  return `type-${task.type.toLowerCase().replace(/\s+/g, '-')}`
}

export function TaskDrawer({
  task,
  isNew,
  viewerId,
  nowMs,
  onClose,
  onSaveNewTask,
  onFieldChange,
  onAssigneeChange,
  onAttachmentsChange,
  onAddComment,
}: TaskDrawerProps) {
  const [commentBody, setCommentBody] = useState('')
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [addLinkOpen, setAddLinkOpen] = useState(false)
  const [attachmentLabel, setAttachmentLabel] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState('')

  if (!task) {
    return null
  }

  const currentTask = task
  const canEdit = viewerId === 'naomi'
  const canComment = canCommentOnTask(currentTask, viewerId) && !isNew
  const commentTree = buildCommentTree(currentTask.comments)
  const timeInStageMs = getTaskTimeInStageMs(currentTask, nowMs)
  const timeTone = getAgeToneFromMs(timeInStageMs)
  const historySegments = getStageHistorySegments(currentTask, nowMs)
  const assignmentOptions =
    isNew || currentTask.stage === 'backlog' ? [null, ...WORKER_IDS] : WORKER_IDS
  const currentStageIndex = STAGES.indexOf(currentTask.stage)

  function handleCommentSubmit() {
    if (!commentBody.trim()) {
      return
    }

    onAddComment(commentBody.trim(), replyToId)
    setCommentBody('')
    setReplyToId(null)
  }

  function handleAttachmentAdd() {
    if (!attachmentLabel.trim() || !attachmentUrl.trim()) {
      return
    }

    onAttachmentsChange([
      ...currentTask.attachments,
      {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `attachment-${Date.now()}`,
        label: attachmentLabel.trim(),
        url: attachmentUrl.trim(),
      },
    ])
    setAttachmentLabel('')
    setAttachmentUrl('')
    setAddLinkOpen(false)
  }

  function handleAttachmentRemove(attachmentId: string) {
    onAttachmentsChange(
      currentTask.attachments.filter((attachment) => attachment.id !== attachmentId),
    )
  }

  function renderCommentNode(node: CommentNode, depth = 0): ReactElement {
    const author = USER_MAP[node.item.authorId]

    return (
      <div
        key={node.item.id}
        className="drawer-comment-thread"
        style={{ marginLeft: `${depth * 16}px` }}
      >
        <div className="drawer-comment-card">
          <div className="drawer-comment-meta">
            <strong>{author.name}</strong>
            <span>{formatDateTimeLabel(node.item.createdAt)}</span>
          </div>
          <p>{node.item.body}</p>
          {canComment ? (
            <button
              type="button"
              className="drawer-inline-action"
              onClick={() => setReplyToId(node.item.id)}
            >
              Reply
            </button>
          ) : null}
        </div>
        {node.children.map((child) => renderCommentNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="task-drawer" aria-label="Task details">
        <div className="task-drawer-header">
          <div className="task-drawer-title-block">
            {canEdit ? (
              <input
                className="task-drawer-test-id-input"
                value={currentTask.testId}
                onChange={(event) => onFieldChange('testId', event.target.value)}
                placeholder="T-000"
              />
            ) : (
              <span className="task-drawer-test-id">{currentTask.testId}</span>
            )}
            {canEdit ? (
              <input
                className="task-drawer-title-input"
                value={currentTask.title}
                onChange={(event) => onFieldChange('title', event.target.value)}
                placeholder="Title"
              />
            ) : (
              <h2>{currentTask.title}</h2>
            )}
            <div className="task-drawer-tags">
              {canEdit ? (
                <>
                  <select
                    value={currentTask.brand}
                    onChange={(event) =>
                      onFieldChange('brand', event.target.value as BrandId)
                    }
                  >
                    <option value="Pluxy">Pluxy</option>
                    <option value="Vivi">Vivi</option>
                  </select>
                  <select
                    value={currentTask.type}
                    onChange={(event) =>
                      onFieldChange('type', event.target.value as TaskType)
                    }
                  >
                    <option value="Creative">Creative</option>
                    <option value="Landing Page">Landing Page</option>
                    <option value="Offer">Offer</option>
                    <option value="Other">Other</option>
                  </select>
                </>
              ) : (
                <>
                  <span className={`brand-pill brand-${currentTask.brand.toLowerCase()}`}>
                    {currentTask.brand}
                  </span>
                  <span className={`type-pill ${getTypeClassName(currentTask)}`}>
                    {currentTask.type}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="task-drawer-actions">
            {isNew && canEdit ? (
              <button
                type="button"
                className="drawer-primary-button"
                onClick={onSaveNewTask}
                disabled={!currentTask.testId.trim() || !currentTask.title.trim()}
              >
                Create
              </button>
            ) : null}
            <button
              type="button"
              className="close-icon-button"
              aria-label="Close panel"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        <section className="drawer-section is-stage-history">
          <div className="drawer-stage-dots">
            {STAGES.map((stage, index) => {
              const isPast = index < currentStageIndex
              const isCurrent = index === currentStageIndex

              return (
                <div key={stage} className="drawer-stage-node">
                  <span
                    className={`drawer-stage-dot ${isPast ? 'is-past' : ''} ${
                      isCurrent ? `is-current tone-${timeTone}` : ''
                    }`}
                  />
                  {index < STAGES.length - 1 ? <span className="drawer-stage-line" /> : null}
                </div>
              )
            })}
          </div>
          <div className="drawer-stage-history-row">
            {historySegments.map((segment, index) => (
              <span key={`${segment.stage}-${index}`} className="drawer-history-piece">
                <span className={`drawer-history-text tone-${segment.tone}`}>
                  {STAGE_LABELS[segment.stage]}
                </span>
                <span className={`drawer-history-time tone-${segment.tone}`}>
                  {segment.durationLabel}
                </span>
                {segment.movedBack ? (
                  <span className="drawer-history-moved-back">moved back</span>
                ) : null}
                {index < historySegments.length - 1 ? (
                  <span className="drawer-history-arrow">→</span>
                ) : null}
              </span>
            ))}
          </div>
          <div className="drawer-meta-row">
            {canEdit ? (
              <select
                value={currentTask.assigneeId ?? ''}
                onChange={(event) =>
                  onAssigneeChange((event.target.value || null) as UserId | null)
                }
              >
                {assignmentOptions.map((option) => (
                  <option key={option ?? 'unassigned'} value={option ?? ''}>
                    {option ? USER_MAP[option].name : 'Unassigned'}
                  </option>
                ))}
              </select>
            ) : (
              <span>
                Assigned to:{' '}
                {currentTask.assigneeId ? USER_MAP[currentTask.assigneeId].name : 'Unassigned'}
              </span>
            )}
            <span>·</span>
            <span>Created: {formatMetaDate(currentTask.createdAt)}</span>
            <span>·</span>
            <span className={`tone-${timeTone}`}>In stage: {formatDurationShort(timeInStageMs)}</span>
          </div>
        </section>

        <section className="drawer-section">
          <div className="drawer-section-label">Brief</div>
          <RichTextEditor
            value={currentTask.briefHtml}
            onChange={(nextValue) => onFieldChange('briefHtml', nextValue)}
            readOnly={!canEdit}
          />
        </section>

        <section className="drawer-section">
          <div className="drawer-section-header">
            <div className="drawer-section-label">Links</div>
            {canEdit ? (
              <button
                type="button"
                className="drawer-inline-action"
                onClick={() => setAddLinkOpen((open) => !open)}
              >
                + Add link
              </button>
            ) : null}
          </div>
          <div className="drawer-links-list">
            {currentTask.attachments.length === 0 ? (
              <div className="drawer-empty-state">No links added yet.</div>
            ) : null}
            {currentTask.attachments.map((attachment) => (
              <div key={attachment.id} className="drawer-link-row">
                <a href={attachment.url} target="_blank" rel="noreferrer">
                  <span className="drawer-link-icon">🔗</span>
                  <span className="drawer-link-label">{attachment.label}</span>
                  <span className="drawer-link-url">{attachment.url}</span>
                </a>
                {canEdit ? (
                  <button
                    type="button"
                    className="drawer-inline-action"
                    onClick={() => handleAttachmentRemove(attachment.id)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {canEdit && addLinkOpen ? (
            <div className="drawer-add-link-form">
              <input
                value={attachmentLabel}
                onChange={(event) => setAttachmentLabel(event.target.value)}
                placeholder="Link label"
              />
              <input
                value={attachmentUrl}
                onChange={(event) => setAttachmentUrl(event.target.value)}
                placeholder="https://"
              />
              <button type="button" className="drawer-primary-button" onClick={handleAttachmentAdd}>
                Add
              </button>
            </div>
          ) : null}
        </section>

        <section className="drawer-section">
          <div className="drawer-section-label">Comments</div>
          <div className="drawer-comments-list">
            {commentTree.length === 0 ? (
              <div className="drawer-empty-state">No comments yet.</div>
            ) : (
              commentTree.map((node) => renderCommentNode(node))
            )}
          </div>
          {canComment ? (
            <div className="drawer-comment-composer">
              {replyToId ? (
                <div className="drawer-reply-pill">
                  Replying in thread
                  <button
                    type="button"
                    className="drawer-inline-action"
                    onClick={() => setReplyToId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
              <div className="drawer-comment-input-row">
                <input
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Leave feedback or an update..."
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleCommentSubmit()
                    }
                  }}
                />
                <button
                  type="button"
                  className="drawer-primary-button"
                  onClick={handleCommentSubmit}
                >
                  Post
                </button>
              </div>
            </div>
          ) : viewerId === 'iskander' ? (
            <div className="drawer-empty-state">
              Comments are read-only in Observer view.
            </div>
          ) : null}
        </section>
      </aside>
    </>
  )
}
