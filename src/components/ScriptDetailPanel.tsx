import { useId, useMemo, useRef, useState } from 'react'
import { useModalAccessibility } from '../hooks/useModalAccessibility'
import {
  SCRIPT_REVIEWERS,
  getLatestScriptReview,
  type ScriptConfidenceLevel,
  type ScriptReviewerId,
  type ScriptReviewEntry,
  type ScriptWorkshopItem,
} from '../board'

interface ScriptDetailPanelProps {
  script: ScriptWorkshopItem
  isOpen: boolean
  brandOptions: string[]
  currentReviewerId: ScriptReviewerId | null
  currentAuthorName: string
  canManageScripts: boolean
  onClose: () => void
  onUpdateScript: (scriptId: string, updates: { title?: string; brand?: string; googleDocUrl?: string }) => void
  onSubmitReview: (scriptId: string, reviewerId: ScriptReviewerId, confidence: ScriptConfidenceLevel, comment: string) => void
  onAddComment: (scriptId: string, text: string) => void
}

const CONFIDENCE_OPTIONS: Array<{ value: ScriptConfidenceLevel; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString()
}

function getCurrentRound(script: ScriptWorkshopItem) {
  const counts = SCRIPT_REVIEWERS.map((reviewer) => script.reviews[reviewer.id]?.length ?? 0)
  const completedRounds = Math.min(...counts)
  const hasInProgressRound = counts.some((count) => count > completedRounds)
  return Math.max(1, completedRounds + (hasInProgressRound ? 1 : 0))
}

function getReviewForRound(
  history: ScriptReviewEntry[],
  round: number,
): ScriptReviewEntry | null {
  return history[round - 1] ?? null
}

export function ScriptDetailPanel({
  script,
  isOpen,
  brandOptions,
  currentReviewerId,
  currentAuthorName,
  canManageScripts,
  onClose,
  onUpdateScript,
  onSubmitReview,
  onAddComment,
}: ScriptDetailPanelProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement | null>(null)
  const [titleDraft, setTitleDraft] = useState(script.title)
  const [brandDraft, setBrandDraft] = useState(script.brand)
  const [docDraft, setDocDraft] = useState(script.googleDocUrl)
  const [reviewConfidence, setReviewConfidence] = useState<ScriptConfidenceLevel>('medium')
  const [reviewComment, setReviewComment] = useState('')
  const [reviewAttempted, setReviewAttempted] = useState(false)
  const [threadComment, setThreadComment] = useState('')

  useModalAccessibility(panelRef, isOpen)

  const selectedReviewer = useMemo(
    () => SCRIPT_REVIEWERS.find((reviewer) => reviewer.id === currentReviewerId) ?? null,
    [currentReviewerId],
  )

  const reviewValidationMessage = reviewAttempted && !reviewComment.trim()
    ? 'Comment is required with your confidence score'
    : null
  const currentRound = useMemo(() => getCurrentRound(script), [script])
  const maxRoundCount = useMemo(
    () => Math.max(1, ...SCRIPT_REVIEWERS.map((reviewer) => script.reviews[reviewer.id]?.length ?? 0)),
    [script],
  )
  const rounds = useMemo(
    () => Array.from({ length: maxRoundCount }, (_, index) => index + 1),
    [maxRoundCount],
  )

  function handleReviewSubmit() {
    setReviewAttempted(true)
    if (!currentReviewerId || !reviewComment.trim()) {
      return
    }

    onSubmitReview(script.id, currentReviewerId, reviewConfidence, reviewComment.trim())
    setReviewComment('')
    setReviewAttempted(false)
  }

  return (
    <>
      <div className={`panel-overlay ${isOpen ? 'is-visible' : ''}`} aria-hidden="true" onClick={onClose} />
      <aside
        ref={panelRef}
        className={`slide-panel script-workshop-panel ${isOpen ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="slide-panel-header">
          <div className="slide-panel-header-main">
            <div className="panel-card-id">Script</div>
            <h2 id={titleId} className="panel-title">{script.title}</h2>
            <p className="script-panel-meta">Brand: {script.brand} · Current round: Round {currentRound}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close script details">
            ×
          </button>
        </div>

        <div className="slide-panel-content">
          <section className="panel-section panel-grid-2">
            <label className="panel-field">
              <span>Script Title</span>
              <input
                className="panel-input"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => onUpdateScript(script.id, { title: titleDraft.trim() || script.title })}
                disabled={!canManageScripts}
              />
            </label>
            <label className="panel-field">
              <span>Brand</span>
              <select
                className="panel-input"
                value={brandDraft}
                onChange={(event) => {
                  setBrandDraft(event.target.value)
                  onUpdateScript(script.id, { brand: event.target.value })
                }}
                disabled={!canManageScripts}
              >
                {brandOptions.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="panel-section">
            <label className="panel-field">
              <span>Google Doc Link</span>
              <input
                type="url"
                className="panel-input"
                value={docDraft}
                onChange={(event) => setDocDraft(event.target.value)}
                onBlur={() => onUpdateScript(script.id, { googleDocUrl: docDraft.trim() || script.googleDocUrl })}
                disabled={!canManageScripts}
              />
            </label>
            <a href={script.googleDocUrl} target="_blank" rel="noreferrer" className="script-doc-link-inline">
              Open Google Doc ↗
            </a>
          </section>

          <section className="panel-section">
            <h3 className="panel-section-title">Latest Confidence by Reviewer</h3>
            <div className="script-reviewers-stack">
              {SCRIPT_REVIEWERS.map((reviewer) => {
                const latest = getLatestScriptReview(script, reviewer.id)
                return (
                  <article key={reviewer.id} className="script-reviewer-card">
                    <header className="script-reviewer-header">
                      <strong>{reviewer.name}</strong>
                      <span>{reviewer.email}</span>
                    </header>
                    {latest ? (
                      <div className="script-review-latest">
                        <span className={`script-confidence-badge is-${latest.confidence}`}>{latest.confidence}</span>
                        <p>{latest.comment}</p>
                        <time dateTime={latest.timestamp}>{formatTimestamp(latest.timestamp)}</time>
                      </div>
                    ) : (
                      <p className="script-workshop-empty-text">No confidence score submitted yet.</p>
                    )}
                  </article>
                )
              })}
            </div>
          </section>

          <section className="panel-section">
            <h3 className="panel-section-title">Score History by Round</h3>
            <div className="script-round-history-stack">
              {rounds.map((round) => (
                <article key={round} className="script-round-history-card">
                  <header>
                    <strong>Round {round}</strong>
                  </header>
                  <div className="script-round-history-grid">
                    {SCRIPT_REVIEWERS.map((reviewer) => {
                      const history = script.reviews[reviewer.id] ?? []
                      const review = getReviewForRound(history, round)

                      return (
                        <div key={reviewer.id} className="script-round-review-cell">
                          <p className="script-round-reviewer-name">{reviewer.name}</p>
                          {review ? (
                            <>
                              <span className={`script-confidence-badge is-${review.confidence}`}>{review.confidence}</span>
                              <p>{review.comment}</p>
                              <time dateTime={review.timestamp}>{formatTimestamp(review.timestamp)}</time>
                            </>
                          ) : (
                            <span className="script-confidence-badge is-pending">Pending</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel-section">
            <div className="script-review-submit">
              <h4>Submit Review</h4>
              {selectedReviewer ? (
                <p className="script-panel-meta">Submitting as {selectedReviewer.name}.</p>
              ) : (
                <p className="script-panel-meta">Only Naomi, Iskander, or Nicolas can submit confidence scores.</p>
              )}
              <label className="panel-field">
                <span>Confidence</span>
                <select
                  className="panel-input"
                  value={reviewConfidence}
                  onChange={(event) => setReviewConfidence(event.target.value as ScriptConfidenceLevel)}
                  disabled={!selectedReviewer}
                >
                  {CONFIDENCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="panel-field">
                <span>Comment</span>
                <textarea
                  className="panel-textarea"
                  rows={4}
                  value={reviewComment}
                  onChange={(event) => setReviewComment(event.target.value)}
                  placeholder="Why this confidence level?"
                  disabled={!selectedReviewer}
                />
              </label>
              {reviewValidationMessage ? <p className="form-error-text">{reviewValidationMessage}</p> : null}
              <button
                type="button"
                className="primary-button"
                onClick={handleReviewSubmit}
                disabled={!selectedReviewer || !reviewComment.trim()}
                title={!reviewComment.trim() ? 'Comment is required with your confidence score' : undefined}
              >
                Submit Review
              </button>
            </div>
          </section>

          <section className="panel-section">
            <h3 className="panel-section-title">Comment Thread</h3>
            <ul className="script-thread-list">
              {script.comments.map((comment) => (
                <li key={comment.id}>
                  <div>
                    <strong>{comment.author}</strong>
                    <time dateTime={comment.timestamp}>{formatTimestamp(comment.timestamp)}</time>
                  </div>
                  <p>{comment.text}</p>
                </li>
              ))}
              {script.comments.length === 0 ? <li className="script-workshop-empty-text">No comments yet.</li> : null}
            </ul>
            <label className="panel-field">
              <span>Add Comment</span>
              <textarea
                className="panel-textarea"
                rows={3}
                value={threadComment}
                onChange={(event) => setThreadComment(event.target.value)}
                placeholder="Ask a question or share feedback"
              />
            </label>
            <button
              type="button"
              className="secondary-button"
              disabled={!threadComment.trim()}
              onClick={() => {
                if (!threadComment.trim()) {
                  return
                }
                onAddComment(script.id, threadComment.trim())
                setThreadComment('')
              }}
            >
              Comment as {currentAuthorName}
            </button>
          </section>
        </div>

        <div className="slide-panel-footer">
          <button type="button" className="primary-button" onClick={onClose}>
            Done
          </button>
        </div>
      </aside>
    </>
  )
}
