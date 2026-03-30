import { useMemo, useState, type ReactNode } from 'react'
import { PageHeader } from './PageHeader'

const DEV_COLUMNS = [
  { id: 'to-brief', label: 'To Brief' },
  { id: 'up-next', label: 'Up Next' },
  { id: 'for-review', label: 'For Review' },
  { id: 'qa-testing', label: 'QA/Testing' },
  { id: 'live', label: 'Live' },
] as const

type DevColumnId = (typeof DEV_COLUMNS)[number]['id']

export interface DevBoardCard {
  id: string
  title: string
  columnId: DevColumnId
}

interface DevBoardPageProps {
  cards: DevBoardCard[]
  headerUtilityContent?: ReactNode
  onAddCard: () => void
}

export function DevBoardPage({ cards, headerUtilityContent, onAddCard }: DevBoardPageProps) {
  const [activeFilter, setActiveFilter] = useState<DevColumnId | 'all'>('all')

  const filteredCards = useMemo(
    () => (activeFilter === 'all' ? cards : cards.filter((card) => card.columnId === activeFilter)),
    [activeFilter, cards],
  )

  const countsByColumn = useMemo(
    () =>
      DEV_COLUMNS.reduce<Record<DevColumnId, number>>((accumulator, column) => {
        accumulator[column.id] = filteredCards.filter((card) => card.columnId === column.id).length
        return accumulator
      }, {} as Record<DevColumnId, number>),
    [filteredCards],
  )

  const totalCount = filteredCards.length

  return (
    <div className="page-shell">
      <PageHeader
        title="Development Board"
        rightContent={
          <>
            <button type="button" className="primary-button" onClick={onAddCard}>
              + Add card
            </button>
            {headerUtilityContent}
          </>
        }
      />

      <section className="onboarding-banner dev-board-subtitle" aria-label="Development board overview">
        <div className="onboarding-copy">
          <p>
            Track development tasks from briefing through QA to launch. Dev/CRO cards from the
            Backlog board land here automatically.
          </p>
        </div>
      </section>

      <section className="stats-bar" aria-label="Development board statistics">
        <div className="stat-inline-item">
          <span className="stat-inline-label">Total</span>
          <strong>{totalCount}</strong>
          <span className="stat-divider">·</span>
        </div>
        {DEV_COLUMNS.map((column, index) => (
          <div key={column.id} className="stat-inline-item">
            <span className="stat-inline-label">{column.label}</span>
            <strong>{countsByColumn[column.id]}</strong>
            {index < DEV_COLUMNS.length - 1 ? <span className="stat-divider">·</span> : null}
          </div>
        ))}
      </section>

      <section className="manager-filter-bar" aria-label="Development board filters">
        <div className="manager-filter-cluster">
          <span className="filter-group-label">Stage</span>
          <div className="manager-filter-group">
            <button
              type="button"
              className={`filter-pill ${activeFilter === 'all' ? 'is-active is-all' : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              All
            </button>
            {DEV_COLUMNS.map((column) => (
              <button
                key={column.id}
                type="button"
                className={`filter-pill ${activeFilter === column.id ? 'is-active is-all' : ''}`}
                onClick={() => setActiveFilter(column.id)}
              >
                {column.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="board-scroll">
        <div className="board-grid dev-board-grid">
          {DEV_COLUMNS.map((column) => {
            const columnCards = filteredCards.filter((card) => card.columnId === column.id)

            return (
              <section key={column.id} className="stage-column">
                <div className="stage-column-header">
                  <h2>
                    {column.label} <span>· {columnCards.length}</span>
                  </h2>
                </div>

                <div className="stage-column-content">
                  <div className="lane-shell">
                    {columnCards.length === 0 ? (
                      <div className="lane-empty-state">Drop tasks here</div>
                    ) : (
                      columnCards.map((card) => (
                        <article key={card.id} className="board-card">
                          <p className="board-card-title">{card.title}</p>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      </main>
    </div>
  )
}
