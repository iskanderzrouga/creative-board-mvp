import { useState } from 'react'
import { formatDateTime, type RoleMode } from '../board'
import { ButtonSpinner } from './ButtonSpinner'
import { ConfirmDialog } from './ConfirmDialog'
import type { WorkspaceAccessEntry } from '../supabase'

type WorkspaceDirectoryStatus = 'idle' | 'loading' | 'ready' | 'error'

interface WorkspaceAccessManagerProps {
  entries: WorkspaceAccessEntry[]
  editorOptions: string[]
  status: WorkspaceDirectoryStatus
  errorMessage: string | null
  pendingEmail: string | null
  onSave: (entry: {
    email: string
    roleMode: RoleMode
    editorName: string | null
    previousEmail?: string
  }) => Promise<void>
  onDelete: (email: string) => Promise<void>
}

interface AccessDraft {
  email: string
  roleMode: RoleMode
  editorName: string
}

const WORKSPACE_ROLE_OPTIONS: Array<{
  value: RoleMode
  label: string
  description: string
}> = [
  {
    value: 'manager',
    label: 'Manager',
    description: 'Can manage cards, settings, and team access.',
  },
  {
    value: 'editor',
    label: 'Editor',
    description: 'Works their assigned cards and moves them forward.',
  },
  {
    value: 'observer',
    label: 'Observer',
    description: 'Can view the workspace without editing cards.',
  },
]

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))
}

function getEmailValidationMessage(
  value: string,
  entries: WorkspaceAccessEntry[],
  currentEmail?: string,
) {
  const normalizedValue = normalizeEmail(value)

  if (!normalizedValue) {
    return null
  }

  if (!isValidEmail(normalizedValue)) {
    return 'Enter a valid work email.'
  }

  const normalizedCurrentEmail = currentEmail ? normalizeEmail(currentEmail) : null
  const duplicate = entries.some(
    (entry) =>
      normalizeEmail(entry.email) === normalizedValue &&
      normalizeEmail(entry.email) !== normalizedCurrentEmail,
  )

  if (duplicate) {
    return 'That email already has login access.'
  }

  return null
}

function isDirty(entry: WorkspaceAccessEntry, draft: AccessDraft) {
  return (
    normalizeEmail(entry.email) !== normalizeEmail(draft.email) ||
    entry.roleMode !== draft.roleMode ||
    (entry.editorName ?? '') !== draft.editorName
  )
}

function getRoleOption(roleMode: RoleMode) {
  return WORKSPACE_ROLE_OPTIONS.find((option) => option.value === roleMode) ?? WORKSPACE_ROLE_OPTIONS[0]!
}

function getBoardIdentityHint(roleMode: RoleMode, editorName: string, hasBoardPeople: boolean) {
  if (roleMode === 'manager') {
    return 'No board identity needed. Managers work as managers in the app.'
  }

  if (roleMode === 'observer') {
    return 'No board identity needed. Observers can sign in without owning cards.'
  }

  if (!hasBoardPeople) {
    return 'Add a board teammate above first, then come back and assign this editor.'
  }

  if (editorName) {
    return `This person will open the board as ${editorName}.`
  }

  return 'Choose the board teammate this editor should work as.'
}

export function WorkspaceAccessManager({
  entries,
  editorOptions,
  status,
  errorMessage,
  pendingEmail,
  onSave,
  onDelete,
}: WorkspaceAccessManagerProps) {
  const [drafts, setDrafts] = useState<Record<string, AccessDraft>>({})
  const [pendingDeleteEmail, setPendingDeleteEmail] = useState<string | null>(null)
  const [newEntry, setNewEntry] = useState<AccessDraft>({
    email: '',
    roleMode: 'editor',
    editorName: '',
  })

  const hasBoardPeople = editorOptions.length > 0
  const newEntryEmailMessage = getEmailValidationMessage(newEntry.email, entries)
  const canAddNewEntry =
    !newEntryEmailMessage &&
    Boolean(normalizeEmail(newEntry.email)) &&
    (newEntry.roleMode !== 'editor' || (hasBoardPeople && Boolean(newEntry.editorName)))

  return (
    <div className="settings-stack">
      <div className="settings-block">
        <div className="settings-block-header">
          <div>
            <strong>Login Access</strong>
            <p className="muted-copy">
              Decide who can sign in to the workspace. Only editor accounts need a board identity,
              because that tells the app whose cards they should work on.
            </p>
          </div>
        </div>

        <div className="workspace-access-explainer">
          <strong>Simple mental model</strong>
          <p>
            Board Team Members are the people shown on the board. Login Access is sign-in
            permission. If someone signs in as an editor, choose which board teammate they work
            as.
          </p>
        </div>

        {status === 'loading' ? <p className="muted-copy">Loading login access…</p> : null}
        {status === 'error' && errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

        <div className="settings-table full-table">
          <div className="settings-row settings-head workspace-access-head">
            <span>Work email</span>
            <span>Access level</span>
            <span>Board identity</span>
            <span>Last updated</span>
            <span />
          </div>

          {entries.map((entry) => {
            const draft = drafts[entry.email] ?? {
              email: entry.email,
              roleMode: entry.roleMode,
              editorName: entry.editorName ?? '',
            }
            const rowIsDirty = isDirty(entry, draft)
            const emailMessage = getEmailValidationMessage(draft.email, entries, entry.email)
            const canSaveRow =
              rowIsDirty &&
              !emailMessage &&
              Boolean(normalizeEmail(draft.email)) &&
              (draft.roleMode !== 'editor' || (hasBoardPeople && Boolean(draft.editorName)))

            return (
              <div
                key={entry.email}
                className={`settings-row workspace-access-row ${rowIsDirty ? 'is-dirty' : ''}`}
              >
                <div className="workspace-access-cell">
                  <input
                    type="email"
                    aria-label="Login access email"
                    aria-invalid={emailMessage ? 'true' : 'false'}
                    value={draft.email}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [entry.email]: { ...draft, email: event.target.value },
                      }))
                    }
                  />
                  {emailMessage ? (
                    <p className="field-error" role="alert">
                      {emailMessage}
                    </p>
                  ) : null}
                </div>

                <div className="workspace-access-cell">
                  <select
                    aria-label={`Login access role for ${entry.email}`}
                    value={draft.roleMode}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [entry.email]: {
                          ...draft,
                          roleMode: event.target.value as RoleMode,
                          editorName: event.target.value === 'editor' ? draft.editorName : '',
                        },
                      }))
                    }
                  >
                    {WORKSPACE_ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">{getRoleOption(draft.roleMode).description}</p>
                </div>

                <div className="workspace-access-cell">
                  {draft.roleMode === 'editor' ? (
                    <>
                      <select
                        aria-label={`Board identity for ${entry.email}`}
                        value={draft.editorName}
                        disabled={!hasBoardPeople}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [entry.email]: { ...draft, editorName: event.target.value },
                          }))
                        }
                      >
                        <option value="">
                          {hasBoardPeople ? 'Choose teammate' : 'Add a board teammate first'}
                        </option>
                        {editorOptions.map((editorName) => (
                          <option key={editorName} value={editorName}>
                            {editorName}
                          </option>
                        ))}
                      </select>
                      <p className="field-hint">
                        {getBoardIdentityHint(draft.roleMode, draft.editorName, hasBoardPeople)}
                      </p>
                    </>
                  ) : (
                    <div className="board-identity-static">
                      <strong>Not needed</strong>
                      <span>{getBoardIdentityHint(draft.roleMode, draft.editorName, hasBoardPeople)}</span>
                    </div>
                  )}
                </div>

                <div className="workspace-access-cell workspace-access-meta">
                  <span className="muted-copy">
                    {entry.updatedAt ? formatDateTime(entry.updatedAt) : '—'}
                  </span>
                  {rowIsDirty ? <span className="dirty-indicator">Unsaved changes</span> : null}
                </div>

                <div className="task-type-actions">
                  <button
                    type="button"
                    className={`${rowIsDirty ? 'primary-button' : 'ghost-button'} compact-button ${
                      pendingEmail === entry.email ? 'is-loading' : ''
                    }`}
                    disabled={!canSaveRow || pendingEmail === entry.email}
                    onClick={() =>
                      void onSave({
                        email: draft.email,
                        roleMode: draft.roleMode,
                        editorName: draft.roleMode === 'editor' ? draft.editorName : null,
                        previousEmail: entry.email,
                      })
                    }
                  >
                    {pendingEmail === entry.email ? (
                      <>
                        <ButtonSpinner />
                        <span>Saving...</span>
                      </>
                    ) : (
                      'Save'
                    )}
                  </button>
                  <button
                    type="button"
                    className="clear-link danger-link"
                    disabled={pendingEmail === entry.email || pendingEmail === '__bulk__'}
                    onClick={() => setPendingDeleteEmail(entry.email)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="workspace-access-new-card">
          <div className="settings-section-header">
            <h3>Add Login Access</h3>
            <p className="muted-copy">
              Add the email first, then send that person to the login page.
            </p>
          </div>

          <div className="workspace-access-new-grid workspace-access-row is-new">
            <div className="workspace-access-cell">
              <input
                type="email"
                aria-label="Login access email"
                aria-invalid={newEntryEmailMessage ? 'true' : 'false'}
                value={newEntry.email}
                placeholder="teammate@company.com"
                onChange={(event) =>
                  setNewEntry((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
              {newEntryEmailMessage ? (
                <p className="field-error" role="alert">
                  {newEntryEmailMessage}
                </p>
              ) : null}
            </div>

            <div className="workspace-access-cell">
              <select
                aria-label="New login access role"
                value={newEntry.roleMode}
                onChange={(event) =>
                  setNewEntry((current) => ({
                    ...current,
                    roleMode: event.target.value as RoleMode,
                    editorName: event.target.value === 'editor' ? current.editorName : '',
                  }))
                }
              >
                {WORKSPACE_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="field-hint">{getRoleOption(newEntry.roleMode).description}</p>
            </div>

            <div className="workspace-access-cell">
              {newEntry.roleMode === 'editor' ? (
                <>
                  <select
                    aria-label="New board identity"
                    value={newEntry.editorName}
                    disabled={!hasBoardPeople}
                    onChange={(event) =>
                      setNewEntry((current) => ({
                        ...current,
                        editorName: event.target.value,
                      }))
                    }
                  >
                    <option value="">
                      {hasBoardPeople ? 'Choose teammate' : 'Add a board teammate first'}
                    </option>
                    {editorOptions.map((editorName) => (
                      <option key={editorName} value={editorName}>
                        {editorName}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">
                    {getBoardIdentityHint(
                      newEntry.roleMode,
                      newEntry.editorName,
                      hasBoardPeople,
                    )}
                  </p>
                </>
              ) : (
                <div className="board-identity-static">
                  <strong>Not needed</strong>
                  <span>
                    {getBoardIdentityHint(newEntry.roleMode, newEntry.editorName, hasBoardPeople)}
                  </span>
                </div>
              )}
            </div>

            <div className="workspace-access-new-actions">
              <button
                type="button"
                className={`primary-button ${pendingEmail === '__new__' ? 'is-loading' : ''}`}
                disabled={!canAddNewEntry || pendingEmail === '__new__' || pendingEmail === '__bulk__'}
                onClick={() =>
                  void onSave({
                    email: newEntry.email,
                    roleMode: newEntry.roleMode,
                    editorName: newEntry.roleMode === 'editor' ? newEntry.editorName : null,
                  }).then(() =>
                    setNewEntry({
                      email: '',
                      roleMode: 'editor',
                      editorName: '',
                    }),
                  )
                }
              >
                {pendingEmail === '__new__' ? (
                  <>
                    <ButtonSpinner />
                    <span>Adding...</span>
                  </>
                ) : (
                  'Add person'
                )}
              </button>
            </div>
          </div>

          <div className="workspace-access-preview">
            <strong>What happens next</strong>
            <span>
              {newEntry.roleMode === 'manager'
                ? 'This person will be able to manage the workspace, settings, and people.'
                : newEntry.roleMode === 'observer'
                  ? 'This person will be able to sign in and view the workspace without editing cards.'
                  : hasBoardPeople
                    ? newEntry.editorName
                      ? `This person will sign in as ${newEntry.editorName}.`
                      : 'Choose the board teammate this editor should work as before saving.'
                    : 'Add a board teammate first, then create editor access.'}
            </span>
          </div>
        </div>
      </div>

      {pendingDeleteEmail ? (
        <ConfirmDialog
          title="Remove login access?"
          message={
            <p>
              <strong>{pendingDeleteEmail}</strong> will no longer be able to sign in to this
              workspace.
            </p>
          }
          confirmLabel="Remove access"
          pending={pendingEmail === pendingDeleteEmail}
          onCancel={() => setPendingDeleteEmail(null)}
          onConfirm={() =>
            void onDelete(pendingDeleteEmail).then(() => {
              setPendingDeleteEmail(null)
            })
          }
        />
      ) : null}
    </div>
  )
}
