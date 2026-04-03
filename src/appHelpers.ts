import {
  getTeamMemberById,
  type ActiveRole,
  type AppPage,
  type AppState,
  type GlobalSettings,
  type Portfolio,
  type RoleMode,
  type StageId,
} from './board'
import type { WorkspaceAccessState } from './supabase'

export interface BackwardMoveFormState {
  reasonId: string
  otherReason: string
  estimatedHours: number | ''
  feedback: string
}

export interface BackwardMoveReasonOption {
  id: string
  name: string
  estimatedHours: number
}

const REVIEW_BACKWARD_MOVE_REASONS: BackwardMoveReasonOption[] = [
  { id: 'backward-review-poor-editing-quality', name: 'Poor editing quality', estimatedHours: 4 },
  { id: 'backward-review-bad-pacing-flow', name: 'Bad pacing / flow', estimatedHours: 4 },
  {
    id: 'backward-review-grammar-text-overlay-errors',
    name: 'Grammar / text overlay errors',
    estimatedHours: 3,
  },
  { id: 'backward-review-wrong-format-specs', name: 'Wrong format / specs', estimatedHours: 6 },
  {
    id: 'backward-review-audio-issues',
    name: 'Audio issues (music, VO, sync)',
    estimatedHours: 4,
  },
  {
    id: 'backward-review-color-grading-visual-quality',
    name: 'Color grading / visual quality',
    estimatedHours: 3,
  },
  { id: 'backward-review-missing-or-wrong-assets', name: 'Missing or wrong assets', estimatedHours: 2 },
  { id: 'backward-review-doesnt-match-brief', name: "Doesn't match brief", estimatedHours: 8 },
  { id: 'backward-review-other', name: 'Other', estimatedHours: 4 },
]

const IN_PRODUCTION_BACKWARD_MOVE_REASONS: BackwardMoveReasonOption[] = [
  {
    id: 'backward-in-production-brief-unclear-or-incomplete',
    name: 'Brief is unclear or incomplete',
    estimatedHours: 8,
  },
  {
    id: 'backward-in-production-missing-reference-links-swipe-files',
    name: 'Missing reference links / swipe files',
    estimatedHours: 2,
  },
  {
    id: 'backward-in-production-missing-raw-footage-assets',
    name: 'Missing raw footage / assets',
    estimatedHours: 2,
  },
  {
    id: 'backward-in-production-wrong-product-brand-info',
    name: 'Wrong product / brand info',
    estimatedHours: 3,
  },
  {
    id: 'backward-in-production-script-copy-not-provided',
    name: 'Script / copy not provided',
    estimatedHours: 4,
  },
  { id: 'backward-in-production-landing-page-not-ready', name: 'Landing page not ready', estimatedHours: 2 },
  {
    id: 'backward-in-production-creative-direction-needs-revision',
    name: 'Creative direction needs revision',
    estimatedHours: 6,
  },
  { id: 'backward-in-production-other', name: 'Other', estimatedHours: 4 },
]

const BRIEFED_BACKWARD_MOVE_REASONS: BackwardMoveReasonOption[] = [
  { id: 'backward-briefed-not-a-priority-anymore', name: 'Not a priority anymore', estimatedHours: 0 },
  { id: 'backward-briefed-strategy-changed', name: 'Strategy changed', estimatedHours: 0 },
  {
    id: 'backward-briefed-waiting-on-other-dependencies',
    name: 'Waiting on other dependencies',
    estimatedHours: 0,
  },
  {
    id: 'backward-briefed-budget-resource-constraints',
    name: 'Budget / resource constraints',
    estimatedHours: 0,
  },
  { id: 'backward-briefed-duplicate-of-another-card', name: 'Duplicate of another card', estimatedHours: 0 },
  { id: 'backward-briefed-other', name: 'Other', estimatedHours: 0 },
]

const READY_OR_LIVE_BACKWARD_MOVE_REASONS: BackwardMoveReasonOption[] = [
  {
    id: 'backward-ready-or-live-performance-issues-not-converting',
    name: 'Performance issues / not converting',
    estimatedHours: 4,
  },
  {
    id: 'backward-ready-or-live-client-stakeholder-feedback',
    name: 'Client/stakeholder feedback',
    estimatedHours: 4,
  },
  {
    id: 'backward-ready-or-live-platform-compliance-rejection',
    name: 'Platform compliance rejection',
    estimatedHours: 6,
  },
  {
    id: 'backward-ready-or-live-needs-creative-refresh',
    name: 'Needs creative refresh',
    estimatedHours: 8,
  },
  { id: 'backward-ready-or-live-other', name: 'Other', estimatedHours: 4 },
]

export function getRoleActorName(role: ActiveRole, portfolio: Portfolio | null) {
  if (role.mode === 'owner') {
    return 'Workspace owner'
  }
  if (role.mode === 'manager') {
    return 'Portfolio manager'
  }
  if (role.mode === 'viewer') {
    return 'Viewer'
  }

  return portfolio ? getTeamMemberById(portfolio, role.editorId)?.name ?? 'Contributor' : 'Contributor'
}

export function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function isDeveloperRole(role: string | null | undefined) {
  return role?.trim().toLowerCase() === 'developer'
}

export function getAllowedPageForRole(page: AppPage, roleMode: RoleMode | 'editor') {
  if (roleMode === 'owner' || roleMode === 'manager') {
    return page
  }

  if (roleMode === 'contributor' || roleMode === 'editor') {
    return page === 'board' || page === 'workload' || page === 'pulse' ? page : ('board' as AppPage)
  }

  return page === 'pulse' ? page : ('board' as AppPage)
}

export function getRoleFromWorkspaceAccess(
  access: WorkspaceAccessState | null,
  currentRole: ActiveRole,
) {
  if (!access) {
    return currentRole
  }

  if (access.roleMode === 'contributor') {
    return {
      mode: 'contributor' as const,
      editorId: currentRole.editorId,
    }
  }

  return {
    mode: access.roleMode,
    editorId: currentRole.editorId,
  }
}

export function getCurrentPage(state: AppState) {
  return getAllowedPageForRole(state.activePage, state.activeRole.mode)
}

export function canEditorDragStage(stage: StageId) {
  return stage === 'Briefed' || stage === 'In Production' || stage === 'Review' || stage === 'Ready'
}

export function getBackwardMoveReasonOptions(sourceStage: StageId | null | undefined) {
  switch (sourceStage) {
    case 'Review':
      return REVIEW_BACKWARD_MOVE_REASONS
    case 'In Production':
      return IN_PRODUCTION_BACKWARD_MOVE_REASONS
    case 'Briefed':
      return BRIEFED_BACKWARD_MOVE_REASONS
    case 'Ready':
    case 'Live':
      return READY_OR_LIVE_BACKWARD_MOVE_REASONS
    default:
      return REVIEW_BACKWARD_MOVE_REASONS
  }
}

export function isBackwardMoveOtherReasonId(reasonId: string | null | undefined) {
  return typeof reasonId === 'string' && reasonId.endsWith('-other')
}

export function getDefaultBackwardMoveForm(
  _settings: GlobalSettings,
  sourceStage?: StageId | null,
): BackwardMoveFormState {
  const defaultReason = getBackwardMoveReasonOptions(sourceStage)[0] ?? null

  return {
    reasonId: defaultReason?.id ?? '',
    otherReason: '',
    estimatedHours: defaultReason?.estimatedHours ?? '',
    feedback: '',
  }
}

export function getSearchCountLabel(filteredCount: number, totalCount: number) {
  return `Showing ${filteredCount} of ${totalCount} cards`
}

export async function copyToClipboard(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const element = document.createElement('textarea')
  element.value = value
  document.body.appendChild(element)
  element.select()
  document.execCommand('copy')
  document.body.removeChild(element)
}
