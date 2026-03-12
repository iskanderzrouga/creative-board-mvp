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
}

export function getRoleActorName(role: ActiveRole, portfolio: Portfolio | null) {
  if (role.mode === 'manager') {
    return 'Workspace manager'
  }
  if (role.mode === 'observer') {
    return 'Observer'
  }

  return portfolio ? getTeamMemberById(portfolio, role.editorId)?.name ?? 'Editor' : 'Editor'
}

export function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function getAllowedPageForRole(page: AppPage, roleMode: RoleMode) {
  if (page === 'analytics' && roleMode === 'editor') {
    return 'board' as AppPage
  }
  if (page === 'settings' && roleMode !== 'manager') {
    return 'board' as AppPage
  }
  if (page === 'workload' && roleMode !== 'manager' && roleMode !== 'observer') {
    return 'board' as AppPage
  }

  return page
}

export function getRoleFromWorkspaceAccess(
  access: WorkspaceAccessState | null,
  currentRole: ActiveRole,
) {
  if (!access) {
    return currentRole
  }

  if (access.roleMode === 'editor') {
    return {
      mode: 'editor' as const,
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

function getSortedRevisionReasons(settings: GlobalSettings) {
  return settings.revisionReasons.slice().sort((left, right) => left.order - right.order)
}

export function getDefaultBackwardMoveForm(
  settings: GlobalSettings,
): BackwardMoveFormState {
  const defaultReason = getSortedRevisionReasons(settings)[0] ?? null

  return {
    reasonId: defaultReason?.id ?? '',
    otherReason: '',
    estimatedHours: defaultReason?.estimatedHours ?? '',
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
