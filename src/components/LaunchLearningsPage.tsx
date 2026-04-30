import {
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  formatDateShort,
  getTaskTypeById,
  type Card,
  type GlobalSettings,
  type Portfolio,
} from '../board'
import { PageHeader } from './PageHeader'

interface LaunchLearningsPageProps {
  portfolios: Portfolio[]
  settings: GlobalSettings
  headerUtilityContent?: ReactNode
  onOpenCard: (portfolioId: string, cardId: string) => void
  onSaveLearning: (portfolioId: string, cardId: string, learning: string) => void
}

interface LaunchLearningRowModel {
  portfolioId: string
  portfolioName: string
  card: Card
  taskTypeName: string
  liveAt: string | null
  liveAtMs: number
}

interface LaunchLearningRowProps {
  row: LaunchLearningRowModel
  onOpenCard: (portfolioId: string, cardId: string) => void
  onSaveLearning: (portfolioId: string, cardId: string, learning: string) => void
}

function getLastLiveEnteredAt(card: Card) {
  for (let index = card.stageHistory.length - 1; index >= 0; index -= 1) {
    const entry = card.stageHistory[index]
    if (entry.stage === 'Live') {
      return entry.enteredAt
    }
  }

  return card.stage === 'Live' ? card.stageEnteredAt : null
}

function getLaunchSearchText(row: LaunchLearningRowModel) {
  return [
    row.portfolioName,
    row.card.id,
    row.card.title,
    row.card.brand,
    row.card.product,
    row.card.angle,
    row.card.hook,
    row.card.landingPage,
    row.taskTypeName,
    row.card.launchLearning,
  ]
    .join(' ')
    .toLowerCase()
}

function buildLaunchRows(portfolios: Portfolio[], settings: GlobalSettings) {
  return portfolios
    .flatMap((portfolio) =>
      portfolio.cards
        .filter((card) => card.stage === 'Live')
        .map((card) => {
          const liveAt = getLastLiveEnteredAt(card)
          const liveAtMs = liveAt ? new Date(liveAt).getTime() : 0

          return {
            portfolioId: portfolio.id,
            portfolioName: portfolio.name,
            card,
            taskTypeName: getTaskTypeById(settings, card.taskTypeId).name,
            liveAt,
            liveAtMs: Number.isFinite(liveAtMs) ? liveAtMs : 0,
          } satisfies LaunchLearningRowModel
        }),
    )
    .sort((left, right) => right.liveAtMs - left.liveAtMs || right.card.updatedAt.localeCompare(left.card.updatedAt))
}

function LaunchLearningRow({ row, onOpenCard, onSaveLearning }: LaunchLearningRowProps) {
  const initialLearning = row.card.launchLearning
  const [savedLearning, setSavedLearning] = useState(initialLearning)
  const [draft, setDraft] = useState(initialLearning)

  const hasLearning = savedLearning.trim().length > 0
  const isDirty = draft !== savedLearning

  function saveLearning(nextLearning: string) {
    if (nextLearning === savedLearning) {
      return
    }

    setSavedLearning(nextLearning)
    onSaveLearning(row.portfolioId, row.card.id, nextLearning)
  }

  function handleLearningChange(nextLearning: string) {
    setDraft(nextLearning)
    saveLearning(nextLearning)
  }

  function commitDraft() {
    saveLearning(draft)
  }

  return (
    <article className="launch-learning-row">
      <div className="launch-learning-main">
        <div className="launch-learning-meta-row">
          <span className="launch-learning-id">{row.card.id}</span>
          <span className="launch-learning-pill">{row.portfolioName}</span>
          <span className="launch-learning-pill">{row.card.brand}</span>
          {row.card.archivedAt ? <span className="launch-learning-pill is-muted">Archived</span> : null}
        </div>

        <button
          type="button"
          className="launch-learning-title"
          onClick={() => onOpenCard(row.portfolioId, row.card.id)}
        >
          {row.card.title}
        </button>

        <div className="launch-learning-detail-grid">
          <span>
            <strong>Type</strong>
            {row.taskTypeName}
          </span>
          <span>
            <strong>Theme</strong>
            {row.card.angle || row.card.hook || 'No theme set'}
          </span>
          <span>
            <strong>Product</strong>
            {row.card.product || 'No product set'}
          </span>
          <span>
            <strong>Live</strong>
            {row.liveAt ? formatDateShort(row.liveAt) : 'Unknown'}
          </span>
        </div>

        {row.card.landingPage ? (
          <a
            className="launch-learning-link"
            href={row.card.landingPage}
            target="_blank"
            rel="noreferrer"
          >
            {row.card.landingPage}
          </a>
        ) : null}
      </div>

      <div className="launch-learning-notes">
        <div className="launch-learning-notes-head">
          <span>Learnings</span>
          <span className={`launch-learning-save-state ${hasLearning ? 'is-filled' : ''}`}>
            {isDirty ? 'Unsaved' : hasLearning ? 'Saved' : 'Empty'}
          </span>
        </div>
        <textarea
          value={draft}
          aria-label={`Learnings for ${row.card.id}`}
          placeholder="What did this teach us about the creative, page, angle, audience, or CRO test?"
          onChange={(event) => handleLearningChange(event.target.value)}
          onBlur={commitDraft}
        />
        <div className="launch-learning-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={!isDirty}
            onMouseDown={(event) => event.preventDefault()}
            onClick={commitDraft}
          >
            Save
          </button>
          <button
            type="button"
            className="clear-link"
            onClick={() => onOpenCard(row.portfolioId, row.card.id)}
          >
            Open card
          </button>
        </div>
      </div>
    </article>
  )
}

export function LaunchLearningsPage({
  portfolios,
  settings,
  headerUtilityContent,
  onOpenCard,
  onSaveLearning,
}: LaunchLearningsPageProps) {
  const [query, setQuery] = useState('')
  const [portfolioFilter, setPortfolioFilter] = useState('all')
  const launchRows = useMemo(() => buildLaunchRows(portfolios, settings), [portfolios, settings])
  const portfolioOptions = useMemo(
    () => portfolios.map((portfolio) => ({ id: portfolio.id, name: portfolio.name })),
    [portfolios],
  )
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return launchRows.filter((row) => {
      if (portfolioFilter !== 'all' && row.portfolioId !== portfolioFilter) {
        return false
      }

      return normalizedQuery ? getLaunchSearchText(row).includes(normalizedQuery) : true
    })
  }, [launchRows, portfolioFilter, query])
  const cardsWithLearning = launchRows.filter((row) => row.card.launchLearning.trim()).length
  const emptyCount = Math.max(0, launchRows.length - cardsWithLearning)

  return (
    <div className="page-shell launch-learnings-page">
      <PageHeader
        title="Launch Learnings"
        searchValue={query}
        searchCountLabel={query ? `Showing ${filteredRows.length} of ${launchRows.length}` : undefined}
        onSearchChange={setQuery}
        onSearchClear={() => setQuery('')}
        rightContent={headerUtilityContent}
      />

      <section className="launch-learning-toolbar" aria-label="Launch learning filters">
        <div className="launch-learning-summary">
          <span>
            <strong>{launchRows.length}</strong>
            Live cards
          </span>
          <span>
            <strong>{cardsWithLearning}</strong>
            With learnings
          </span>
          <span>
            <strong>{emptyCount}</strong>
            Still empty
          </span>
        </div>

        <label className="launch-learning-filter">
          <span>Portfolio</span>
          <select value={portfolioFilter} onChange={(event) => setPortfolioFilter(event.target.value)}>
            <option value="all">All visible portfolios</option>
            {portfolioOptions.map((portfolio) => (
              <option key={portfolio.id} value={portfolio.id}>
                {portfolio.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {filteredRows.length === 0 ? (
        <section className="board-empty-state launch-learning-empty" aria-live="polite">
          <strong>No live cards found</strong>
          <p>
            Cards will appear here after they reach Live in any portfolio this account can see.
          </p>
        </section>
      ) : (
        <section className="launch-learning-list" aria-label="Live launch cards">
          {filteredRows.map((row) => (
            <LaunchLearningRow
              key={`${row.portfolioId}-${row.card.id}`}
              row={row}
              onOpenCard={onOpenCard}
              onSaveLearning={onSaveLearning}
            />
          ))}
        </section>
      )}
    </div>
  )
}
