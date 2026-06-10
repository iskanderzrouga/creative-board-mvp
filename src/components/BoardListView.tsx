import { memo } from 'react'
import {
  formatDateShort,
  getAgeToneFromMs,
  getBrandSurface,
  getBrandTextColor,
  getCardAgeMs,
  getChecklistProgress,
  getDueDateStatus,
  getP1DeadlineStatus,
  getRevisionCount,
  getTaskTypeById,
  getTypePillLabel,
  isCreativeTaskTypeId,
  type Card,
  type ColumnModel,
  type GlobalSettings,
  type Portfolio,
} from '../board'
import { BlockedIcon } from './icons/AppIcons'

interface BoardListViewProps {
  columns: ColumnModel[]
  portfolio: Portfolio
  settings: GlobalSettings
  nowMs: number
  onOpenCard: (portfolioId: string, cardId: string) => void
}

function getStageClassName(stage: ColumnModel['id']) {
  return `stage-${stage.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

interface BoardListRowProps {
  card: Card
  portfolio: Portfolio
  settings: GlobalSettings
  nowMs: number
  onOpen: () => void
}

function BoardListRowComponent({ card, portfolio, settings, nowMs, onOpen }: BoardListRowProps) {
  const taskType = getTaskTypeById(settings, card.taskTypeId)
  const ageMs = getCardAgeMs(card, nowMs)
  const tone = getAgeToneFromMs(ageMs, settings)
  const revisionCount = getRevisionCount(card)
  const showFunnelStage = isCreativeTaskTypeId(taskType.id)
  const p1DeadlineStatus = getP1DeadlineStatus(card, nowMs)
  const dueDateStatus = getDueDateStatus(card, nowMs)
  const checklistProgress = getChecklistProgress(card)
  const commentCount = card.comments.length
  const owner = card.stage === 'Backlog' ? 'Unassigned' : card.owner ?? 'Unassigned'

  return (
    <button
      type="button"
      className={`board-list-row ${getStageClassName(card.stage)} tone-${tone} ${
        card.blocked ? 'is-flagged' : ''
      }`}
      aria-label={`Open card ${card.id}: ${card.title}`}
      onClick={onOpen}
    >
      <span className="board-list-cell board-list-id">
        {card.blocked ? (
          <span className="board-list-flag" aria-hidden="true">
            <BlockedIcon />
          </span>
        ) : null}
        {card.id}
      </span>
      <span className="board-list-cell board-list-title">
        <span className="board-list-title-text">{card.title}</span>
        {revisionCount > 0 ? <span className="revision-badge">R{revisionCount}</span> : null}
        {dueDateStatus ? (
          <span className={`card-meta-chip is-due tone-${dueDateStatus.tone}`} title="Due date">
            {dueDateStatus.label}
          </span>
        ) : null}
        {checklistProgress ? (
          <span
            className={`card-meta-chip is-checklist ${
              checklistProgress.done === checklistProgress.total ? 'is-complete' : ''
            }`}
            title="Subtasks"
          >
            {`✓ ${checklistProgress.done}/${checklistProgress.total}`}
          </span>
        ) : null}
        {commentCount > 0 ? (
          <span className="card-meta-chip is-comments" title="Comments">
            {`💬 ${commentCount}`}
          </span>
        ) : null}
      </span>
      <span className="board-list-cell board-list-tags">
        <span
          className="brand-pill"
          style={{
            background: getBrandSurface(portfolio, card.brand),
            color: getBrandTextColor(portfolio, card.brand),
          }}
        >
          {card.brand}
        </span>
        <span
          className="task-type-pill"
          style={{ background: taskType.color, color: taskType.textColor }}
        >
          {getTypePillLabel(taskType)}
        </span>
        {showFunnelStage ? (
          <span className={`funnel-pill funnel-${card.funnelStage.toLowerCase().replace(/\s+/g, '-')}`}>
            {card.funnelStage}
          </span>
        ) : null}
      </span>
      <span
        className={`board-list-cell board-list-owner ${
          card.stage === 'Backlog' ? 'is-unassigned' : ''
        }`}
      >
        {owner}
      </span>
      <span className="board-list-cell board-list-age">
        {p1DeadlineStatus ? (
          <span className={`p1-deadline-chip tone-${p1DeadlineStatus.tone}`}>
            {p1DeadlineStatus.label}
          </span>
        ) : (
          <span className={`card-age tone-${tone}`}>{formatDateShort(card.dateCreated)}</span>
        )}
      </span>
    </button>
  )
}

const BoardListRow = memo(BoardListRowComponent)

export function BoardListView({
  columns,
  portfolio,
  settings,
  nowMs,
  onOpenCard,
}: BoardListViewProps) {
  const sections = columns
    .map((column) => ({
      column,
      cards: column.lanes.flatMap((lane) => lane.cards),
    }))
    .filter((section) => section.cards.length > 0)

  return (
    <div className="board-list">
      {sections.map(({ column, cards }) => (
        <section
          key={column.id}
          className={`board-list-section ${getStageClassName(column.id)} ${
            column.id === 'Archived' ? 'is-archived-section' : ''
          }`}
        >
          <header className="board-list-section-header">
            <h2>
              {column.label} <span>· {cards.length}</span>
            </h2>
          </header>
          <div className="board-list-rows" role="table" aria-label={`${column.label} cards`}>
            <div className="board-list-row board-list-row-head" role="row" aria-hidden="true">
              <span className="board-list-cell board-list-id">Card</span>
              <span className="board-list-cell board-list-title">Title</span>
              <span className="board-list-cell board-list-tags">Labels</span>
              <span className="board-list-cell board-list-owner">Owner</span>
              <span className="board-list-cell board-list-age">Status</span>
            </div>
            {cards.map((card) => (
              <BoardListRow
                key={card.id}
                card={card}
                portfolio={portfolio}
                settings={settings}
                nowMs={nowMs}
                onOpen={() => onOpenCard(portfolio.id, card.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
