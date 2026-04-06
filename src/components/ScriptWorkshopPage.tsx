import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { PageHeader } from './PageHeader'
import { ScriptDetailPanel } from './ScriptDetailPanel'
import {
  SCRIPT_REVIEWERS,
  getLatestScriptReview,
  isScriptReadyToLaunch,
  type ScriptConfidenceLevel,
  type ScriptReviewStatus,
  type ScriptReviewerId,
  type ScriptWorkshopItem,
} from '../board'

interface AddScriptInput {
  title: string
  brand: string
  googleDocUrl: string
}

interface ScriptWorkshopPageProps {
  scripts: ScriptWorkshopItem[]
  brandOptions: string[]
  brandStyles: Record<string, { background: string; color: string }>
  canManageScripts: boolean
  currentReviewerId: ScriptReviewerId | null
  currentAuthorName: string
  headerUtilityContent?: ReactNode
  onAddScript: (input: AddScriptInput) => void
  onUpdateScript: (
    scriptId: string,
    updates: { title?: string; brand?: string; googleDocUrl?: string; reviewStatus?: ScriptReviewStatus },
  ) => void
  onSubmitReview: (scriptId: string, reviewerId: ScriptReviewerId, confidence: ScriptConfidenceLevel, comment: string) => void
  onAddComment: (scriptId: string, text: string) => void
}

function getScriptRound(script: ScriptWorkshopItem) {
  const counts = SCRIPT_REVIEWERS.map((reviewer) => script.reviews[reviewer.id]?.length ?? 0)
  const completedRounds = Math.min(...counts)
  const hasInProgressRound = counts.some((count) => count > completedRounds)
  return Math.max(1, completedRounds + (hasInProgressRound ? 1 : 0))
}

export function ScriptWorkshopPage({
  scripts,
  brandOptions,
  brandStyles,
  canManageScripts,
  currentReviewerId,
  currentAuthorName,
  headerUtilityContent,
  onAddScript,
  onUpdateScript,
  onSubmitReview,
  onAddComment,
}: ScriptWorkshopPageProps) {
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [brandDraft, setBrandDraft] = useState(brandOptions[0] ?? '')
  const [docDraft, setDocDraft] = useState('')
  const [addAttempted, setAddAttempted] = useState(false)

  const activeScripts = useMemo(
    () => scripts.filter((script) => !isScriptReadyToLaunch(script)),
    [scripts],
  )
  const approvedScripts = useMemo(
    () => scripts.filter((script) => isScriptReadyToLaunch(script)),
    [scripts],
  )

  const selectedScript = scripts.find((script) => script.id === selectedScriptId) ?? null
  const titleError = addAttempted && !titleDraft.trim()
  const docError = addAttempted && !docDraft.trim()

  function resetAddScriptForm() {
    setTitleDraft('')
    setBrandDraft(brandOptions[0] ?? '')
    setDocDraft('')
    setAddAttempted(false)
  }

  function handleAddScriptSubmit() {
    setAddAttempted(true)
    if (!titleDraft.trim() || !docDraft.trim() || !brandDraft) {
      return
    }

    onAddScript({
      title: titleDraft.trim(),
      brand: brandDraft,
      googleDocUrl: docDraft.trim(),
    })
    setIsAddModalOpen(false)
    resetAddScriptForm()
  }

  function handleCardKeyboardOpen(event: KeyboardEvent<HTMLElement>, scriptId: string) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    setSelectedScriptId(scriptId)
  }

  return (
    <div className="page-shell script-workshop-shell">
      <PageHeader title="Script Workshop" rightContent={headerUtilityContent} />

      <section className="script-workshop-header">
        <p className="script-workshop-subtitle">
          Collaborate on 1-2 scripts per week. Score your confidence, leave feedback, and iterate until every script is
          launch-ready.
        </p>
        <p className="script-workshop-counts">Active: {activeScripts.length} · Approved: {approvedScripts.length}</p>
        {canManageScripts ? (
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setIsAddModalOpen(true)
              setBrandDraft(brandOptions[0] ?? '')
            }}
          >
            + Add Script
          </button>
        ) : null}
      </section>

      <section className="script-workshop-section">
        <div className="script-workshop-section-title">
          <h2>Active Workshop</h2>
        </div>
        <div className="script-card-grid">
          {activeScripts.map((script) => {
            const round = getScriptRound(script)
            const brandStyle = brandStyles[script.brand]

            return (
              <article
                key={script.id}
                className="script-card"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedScriptId(script.id)}
                onKeyDown={(event) => handleCardKeyboardOpen(event, script.id)}
              >
                <div className="script-card-header-row">
                  <span className="script-round-badge">Round {round}</span>
                  <button
                    type="button"
                    className="script-doc-button"
                    onClick={(event) => {
                      event.stopPropagation()
                      window.open(script.googleDocUrl, '_blank', 'noopener,noreferrer')
                    }}
                    aria-label={`Open Google Doc for ${script.title}`}
                  >
                    Open Doc ↗
                  </button>
                </div>

                <h3 className="script-card-title">{script.title}</h3>

                <span className="script-brand-pill" style={brandStyle}>
                  {script.brand}
                </span>

                <div className="script-confidence-row">
                  {SCRIPT_REVIEWERS.map((reviewer) => {
                    const latest = getLatestScriptReview(script, reviewer.id)
                    const badgeClass = latest ? `is-${latest.confidence}` : 'is-pending'
                    const label = latest
                      ? latest.confidence.charAt(0).toUpperCase() + latest.confidence.slice(1)
                      : 'Pending'

                    return (
                      <div key={reviewer.id} className="script-confidence-column">
                        <span className="script-reviewer-name">{reviewer.name}</span>
                        <span className={`script-confidence-badge ${badgeClass}`}>{label}</span>
                      </div>
                    )
                  })}
                </div>
              </article>
            )
          })}
          {activeScripts.length === 0 ? <p className="script-workshop-empty-text">No scripts are in active review right now.</p> : null}
        </div>
      </section>

      <section className="script-workshop-section is-approved">
        <div className="script-workshop-section-title">
          <h2>Scripts with High Confidence</h2>
          <span className="script-workshop-section-note">All reviewers currently have High confidence.</span>
        </div>
        <div className="script-card-grid">
          {approvedScripts.map((script) => {
            const round = getScriptRound(script)
            const brandStyle = brandStyles[script.brand]

            return (
              <article
                key={script.id}
                className="script-card is-approved"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedScriptId(script.id)}
                onKeyDown={(event) => handleCardKeyboardOpen(event, script.id)}
              >
                <div className="script-card-header-row">
                  <span className="script-round-badge">Round {round}</span>
                  <span className="script-ready-pill">Ready to Launch</span>
                </div>
                <h3 className="script-card-title">{script.title}</h3>
                <span className="script-brand-pill" style={brandStyle}>
                  {script.brand}
                </span>
                <div className="script-confidence-row">
                  {SCRIPT_REVIEWERS.map((reviewer) => (
                    <div key={reviewer.id} className="script-confidence-column">
                      <span className="script-reviewer-name">{reviewer.name}</span>
                      <span className="script-confidence-badge is-high">High</span>
                    </div>
                  ))}
                </div>
              </article>
            )
          })}
          {approvedScripts.length === 0 ? <p className="script-workshop-empty-text">No scripts approved yet.</p> : null}
        </div>
      </section>

      {isAddModalOpen ? (
        <div className="panel-overlay is-visible" role="presentation" onClick={() => setIsAddModalOpen(false)}>
          <div
            className="script-add-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add script"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Add Script</h3>
            <label className="panel-field">
              <span>Script Title</span>
              <input className="panel-input" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} />
            </label>
            {titleError ? <p className="form-error-text">Script title is required</p> : null}
            <label className="panel-field">
              <span>Brand</span>
              <select className="panel-input" value={brandDraft} onChange={(event) => setBrandDraft(event.target.value)}>
                {brandOptions.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </label>
            <label className="panel-field">
              <span>Google Doc Link</span>
              <input
                type="url"
                className="panel-input"
                value={docDraft}
                onChange={(event) => setDocDraft(event.target.value)}
                placeholder="https://docs.google.com/..."
              />
            </label>
            {docError ? <p className="form-error-text">Google Doc Link is required</p> : null}
            <div className="script-add-modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setIsAddModalOpen(false)
                  resetAddScriptForm()
                }}
              >
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={handleAddScriptSubmit}>
                Add Script
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedScript ? (
        <ScriptDetailPanel
          key={selectedScript.id}
          script={selectedScript}
          isOpen={Boolean(selectedScript)}
          brandOptions={brandOptions}
          currentReviewerId={currentReviewerId}
          currentAuthorName={currentAuthorName}
          canManageScripts={canManageScripts}
          onClose={() => setSelectedScriptId(null)}
          onUpdateScript={onUpdateScript}
          onSubmitReview={onSubmitReview}
          onAddComment={onAddComment}
        />
      ) : null}
    </div>
  )
}
