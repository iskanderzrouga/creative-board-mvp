import type {
  ComponentProps,
  Dispatch,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  STAGES,
  formatHours,
  getEditorOptions,
  getStageLabel,
  type BoardFilters,
  type BoardStats,
  type Card,
  type ColumnModel,
  type EditorSummary,
  type GlobalSettings,
  type Portfolio,
  type StageId,
} from '../board'
import { BoardCardSurface } from './BoardCardSurface'
import { LaneDropZone } from './LaneDropZone'
import { PageHeader } from './PageHeader'
import { SortableBoardCard } from './SortableBoardCard'

type BoardSensors = ComponentProps<typeof DndContext>['sensors']

interface BoardPageProps {
  title: string
  portfolio: Portfolio
  settings: GlobalSettings
  boardFilters: BoardFilters
  setBoardFilters: Dispatch<SetStateAction<BoardFilters>>
  hasActiveFilters: boolean
  stats: BoardStats | null
  summary: EditorSummary | null
  columns: ColumnModel[]
  expandedStages: StageId[]
  setExpandedStages: Dispatch<SetStateAction<StageId[]>>
  showOnboarding: boolean
  searchCountLabel?: string
  searchRef: RefObject<HTMLInputElement | null>
  headerUtilityContent?: ReactNode
  activeRoleMode: 'owner' | 'manager' | 'contributor' | 'viewer'
  activeViewerName: string | null
  dragCardId: string | null
  dragOverLaneId: string | null
  blockedLaneId: string | null
  activeDragCard: Card | null
  nowMs: number
  sensors: BoardSensors
  canDragCard: (card: Card) => boolean
  onOpenCard: (portfolioId: string, cardId: string) => void
  onCycleProductionPriority: (portfolioId: string, cardId: string) => void
  onQuickCreateOpen: () => void
  onOpenSettings: () => void
  onResetFilters: () => void
  onDismissOnboarding: () => void
  onDragStart: (event: DragStartEvent) => void
  onDragOver: (event: DragOverEvent) => void
  onDragCancel: () => void
  onDragEnd: (event: DragEndEvent) => void
  onStartEditorTimer: (portfolioId: string, cardId: string) => void
}

export function BoardPage({
  title,
  portfolio,
  settings,
  boardFilters,
  setBoardFilters,
  hasActiveFilters,
  stats,
  summary,
  columns,
  expandedStages,
  setExpandedStages,
  showOnboarding,
  searchCountLabel,
  searchRef,
  headerUtilityContent,
  activeRoleMode,
  activeViewerName,
  dragCardId,
  dragOverLaneId,
  blockedLaneId,
  activeDragCard,
  nowMs,
  sensors,
  canDragCard,
  onOpenCard,
  onCycleProductionPriority,
  onQuickCreateOpen,
  onOpenSettings,
  onResetFilters,
  onDismissOnboarding,
  onDragStart,
  onDragOver,
  onDragCancel,
  onDragEnd,
  onStartEditorTimer,
}: BoardPageProps) {
  const allBrandsSelected = boardFilters.brandNames.length === portfolio.brands.length
  const hasVisibleCards = columns.some((column) => column.count > 0)
  const hasBoardCards = portfolio.cards.some((card) => !card.archivedAt)

  return (
    <div className="page-shell">
      <PageHeader
        title={title}
        searchValue={boardFilters.searchQuery}
        searchCountLabel={searchCountLabel}
        onSearchChange={(value) =>
          setBoardFilters((current) => ({
            ...current,
            searchQuery: value,
          }))
        }
        onSearchClear={() =>
          setBoardFilters((current) => ({
            ...current,
            searchQuery: '',
          }))
        }
        searchRef={searchRef}
        rightContent={
          <>
            {activeRoleMode !== 'viewer' ? (
              <button type="button" className="primary-button" onClick={onQuickCreateOpen}>
                + Add card
              </button>
            ) : null}
            {headerUtilityContent}
          </>
        }
      />

      {showOnboarding ? (
        <section className="onboarding-banner" aria-label="Getting started">
          <div className="onboarding-copy">
            <strong>Start with the shared workspace basics</strong>
            <p>
              Set up your structure, people, and access in Settings, then add the first backlog
              cards so contributors, analytics, and workload stay aligned from day one.
            </p>
          </div>
          <div className="onboarding-actions">
            <button type="button" className="primary-button" onClick={onOpenSettings}>
              Open settings
            </button>
            <button type="button" className="ghost-button" onClick={onDismissOnboarding}>
              Dismiss
            </button>
          </div>
        </section>
      ) : null}

      {stats ? (
        <section className="stats-bar" aria-label="Board statistics">
          <div className="stat-inline-item">
            <span className="stat-inline-label">Total</span>
            <strong>{stats.total}</strong>
            <span className="stat-divider">·</span>
          </div>
          {STAGES.map((stage) => (
            <div key={stage} className="stat-inline-item">
              <span className="stat-inline-label">{getStageLabel(stage)}</span>
              <strong>{stats.byStage[stage]}</strong>
              <span className="stat-divider">·</span>
            </div>
          ))}
          <div className="stat-inline-item">
            <span className="stat-inline-label">{`Stuck ${settings.general.timeInStageThresholds.redStart}+d`}</span>
            <strong className={stats.stuck > 0 ? 'is-highlight' : ''}>{stats.stuck}</strong>
          </div>
        </section>
      ) : null}

      {activeRoleMode !== 'viewer' ? (
        <section className="manager-filter-bar">
          <div className="manager-filter-cluster">
            <span className="filter-group-label">Brand</span>
            <div className="manager-filter-group">
              <button
                type="button"
                className={`filter-pill ${allBrandsSelected ? 'is-active is-all' : ''}`}
                onClick={() =>
                  setBoardFilters((current) => ({
                    ...current,
                    brandNames: portfolio.brands.map((brand) => brand.name),
                  }))
                }
              >
                All
              </button>
              {portfolio.brands.map((brand) => (
                <button
                  key={brand.name}
                  type="button"
                  className={`filter-pill ${
                    boardFilters.brandNames.includes(brand.name) ? 'is-active' : ''
                  }`}
                  style={
                    boardFilters.brandNames.includes(brand.name)
                      ? {
                          background: brand.color,
                          borderColor: brand.color,
                          color: '#fff',
                        }
                      : undefined
                  }
                  onClick={() =>
                    setBoardFilters((current) => ({
                      ...current,
                      brandNames: current.brandNames.includes(brand.name)
                        ? current.brandNames.filter((item) => item !== brand.name).length > 0
                          ? current.brandNames.filter((item) => item !== brand.name)
                          : []
                        : [...current.brandNames, brand.name],
                    }))
                  }
                >
                  {brand.name}
                </button>
              ))}
            </div>
          </div>

          {activeRoleMode !== 'contributor' ? (
            <>
              <span className="filter-group-divider" aria-hidden="true" />
              <div className="manager-filter-cluster">
                <span className="filter-group-label">Teammate</span>
                <div className="manager-editor-pills">
                  {getEditorOptions(portfolio).map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      className={`editor-pill ${
                        boardFilters.ownerNames.includes(member.name) ? 'is-active' : ''
                      }`}
                      onClick={() =>
                        setBoardFilters((current) => ({
                          ...current,
                          ownerNames: current.ownerNames.includes(member.name)
                            ? current.ownerNames.filter((item) => item !== member.name)
                            : [...current.ownerNames, member.name],
                        }))
                      }
                    >
                      {member.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          <span className="filter-group-divider" aria-hidden="true" />

          <div className="manager-filter-cluster">
            <span className="filter-group-label">Flags</span>
            <div className="manager-flag-pills">
              <button
                type="button"
                className={`filter-pill ${boardFilters.stuckOnly ? 'is-active is-warning' : ''}`}
                onClick={() =>
                  setBoardFilters((current) => ({
                    ...current,
                    stuckOnly: !current.stuckOnly,
                  }))
                }
              >
                Stuck
              </button>
              <button
                type="button"
                className={`filter-pill ${boardFilters.blockedOnly ? 'is-active is-danger' : ''}`}
                onClick={() =>
                  setBoardFilters((current) => ({
                    ...current,
                    blockedOnly: !current.blockedOnly,
                  }))
                }
              >
                Blocked
              </button>
              {hasActiveFilters ? (
                <button type="button" className="clear-link filter-reset-link" onClick={onResetFilters}>
                  Reset filters
                </button>
              ) : null}
            </div>
          </div>

          <label className="archive-toggle">
            <input
              type="checkbox"
              checked={boardFilters.showArchived}
              onChange={(event) =>
                setBoardFilters((current) => ({
                  ...current,
                  showArchived: event.target.checked,
                }))
              }
            />
            <span>Show archived</span>
          </label>
        </section>
      ) : null}

      {boardFilters.brandNames.length === 0 && portfolio.brands.length > 0 ? (
        <section className="empty-filter-notice">
          <p className="muted-copy">No brands selected. Click a brand above to filter, or click &ldquo;All&rdquo; to see everything.</p>
        </section>
      ) : null}

      {summary ? (
        <section className="editor-summary-bar">
          <div className="editor-summary-name">
            {summary.owner} · {formatHours(
              summary.briefedHours +
                summary.inProductionHours +
                summary.reviewHours +
                summary.readyHours,
            )}{' '}
            scheduled · {formatHours(summary.availableHours)} available
          </div>
          <div className="editor-summary-stages">
            <span>{`Briefed: ${summary.briefedCount} (${formatHours(summary.briefedHours)})`}</span>
            <span>
              {`In Production: ${summary.inProductionCount} (${formatHours(summary.inProductionHours)})`}
            </span>
            <span>{`Review: ${summary.reviewCount} (${formatHours(summary.reviewHours)})`}</span>
            <span>{`Ready: ${summary.readyCount} (${formatHours(summary.readyHours)})`}</span>
          </div>
        </section>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
      >
        <main className="board-scroll">
          {!hasVisibleCards ? (
            <div className="board-empty-centered">
              <section className="board-empty-state" aria-live="polite">
                <strong>
                  {hasActiveFilters
                    ? 'No cards match the current filters'
                    : activeRoleMode === 'contributor' && !hasBoardCards
                      ? 'Welcome! You\'re all set up'
                      : hasBoardCards
                        ? 'Nothing is visible in this board view yet'
                        : 'This board is ready for its first card'}
                </strong>
                <p>
                  {hasActiveFilters
                    ? 'Clear the current filters or search to bring cards back into view.'
                    : activeRoleMode === 'contributor' && !hasBoardCards
                      ? 'Once cards are assigned to you or you create new ones, they\'ll appear here. You can also create cards yourself using the + Add card button.'
                      : hasBoardCards
                        ? 'Adjust the current role or filters, or open an existing card from another view.'
                        : activeRoleMode === 'owner' || activeRoleMode === 'manager'
                          ? 'Add a first card to the backlog so the shared workflow has something to track.'
                          : 'An owner or manager can add the first backlog card to start the shared workflow.'}
                </p>
                <div className="board-empty-actions">
                  {hasActiveFilters ? (
                    <button type="button" className="primary-button" onClick={onResetFilters}>
                      Reset filters
                    </button>
                  ) : activeRoleMode !== 'viewer' ? (
                    <button type="button" className="primary-button" onClick={onQuickCreateOpen}>
                      {activeRoleMode === 'contributor' ? '+ Add card' : 'Add first card'}
                    </button>
                  ) : null}
                </div>
              </section>
            </div>
          ) : (
            <div className="board-grid">
              {columns.map((column) => (
                <section
                  key={column.id}
                  className={`stage-column ${column.id === 'Archived' ? 'is-archived-column' : ''}`}
                >
                  <div className="stage-column-header">
                    <h2>
                      {column.label} <span>· {column.count}</span>
                    </h2>
                  </div>

                  <div className="stage-column-content">
                    {column.lanes.map((lane) => {
                      const hovered = dragOverLaneId === lane.id
                      const isBlocked = blockedLaneId === lane.id
                      const isWipFull =
                        lane.wipCap !== null && lane.wipCount !== null && lane.wipCount >= lane.wipCap

                      return (
                        <div key={lane.id} className={`lane-shell ${isWipFull ? 'is-hot' : ''}`}>
                          {column.grouped ? (
                            <div className="lane-header rich">
                              <div className="lane-header-left">
                                <span>{lane.label}</span>
                                <span className="queue-inline">
                                  {column.id === 'In Production'
                                    ? `${lane.activeCount} active`
                                    : `${lane.activeCount} queued`}
                                  {lane.showTotalWorkload && lane.totalWorkDays !== null
                                    ? ` · ~${lane.totalWorkDays} days total`
                                    : ''}
                                </span>
                              </div>
                              {lane.wipCap !== null ? (
                                <span className={`wip-badge ${isWipFull ? 'is-full' : ''}`}>
                                  {lane.wipCount}/{lane.wipCap}
                                </span>
                              ) : null}
                            </div>
                          ) : null}

                          <LaneDropZone
                            lane={lane}
                            isHovered={hovered}
                            isBlocked={isBlocked}
                            dragActive={dragCardId !== null}
                            allowEmptyHint={
                              activeRoleMode === 'owner' || activeRoleMode === 'manager'
                            }
                          >
                            <SortableContext
                              items={lane.cards.map((card) => card.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {lane.cards.map((card) => {
                                const isAssignedEditor =
                                  activeRoleMode === 'contributor' &&
                                  activeViewerName !== null &&
                                  activeViewerName === card.owner
                                const canStartEditorTimer =
                                  card.stage === 'In Production' && isAssignedEditor && card.editorTimer === null
                                const showEditorStartButton =
                                  card.stage === 'In Production' && card.editorTimer === null
                                const isEditorTimerInProgress =
                                  card.stage === 'In Production' &&
                                  Boolean(card.editorTimer?.startedAt) &&
                                  card.editorTimer?.stoppedAt === null

                                return (
                                  <SortableBoardCard
                                    key={card.id}
                                    card={card}
                                    portfolio={portfolio}
                                    settings={settings}
                                    nowMs={nowMs}
                                    canDrag={canDragCard(card)}
                                    cursorMode={canDragCard(card) ? 'drag' : 'pointer'}
                                    isInvalid={isBlocked}
                                    onOpen={() => onOpenCard(portfolio.id, card.id)}
                                    onCyclePriority={() => onCycleProductionPriority(portfolio.id, card.id)}
                                    showEditorStartButton={showEditorStartButton}
                                    showEditorInProgress={isEditorTimerInProgress}
                                    canStartEditorTimer={canStartEditorTimer}
                                    onStartEditorTimer={() => onStartEditorTimer(portfolio.id, card.id)}
                                  />
                                )
                              })}
                            </SortableContext>
                          </LaneDropZone>
                        </div>
                      )
                    })}

                    {column.grouped && column.hiddenEditorCount > 0 ? (
                      <button
                        type="button"
                        className="clear-link hidden-editors-toggle"
                        onClick={() =>
                          setExpandedStages((current) =>
                            current.includes(column.id as StageId)
                              ? current.filter((item) => item !== column.id)
                              : [...current, column.id as StageId],
                          )
                        }
                      >
                        {expandedStages.includes(column.id as StageId)
                          ? 'Hide empty teammates'
                          : `+${column.hiddenEditorCount} teammates`}
                      </button>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>

        <DragOverlay>
          {activeDragCard ? (
            <BoardCardSurface
              card={activeDragCard}
              portfolio={portfolio}
              settings={settings}
              nowMs={nowMs}
              onOpen={() => undefined}
              onCyclePriority={undefined}
              cursorMode="drag"
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
