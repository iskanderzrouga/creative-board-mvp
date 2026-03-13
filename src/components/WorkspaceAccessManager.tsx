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

const WORKSPACE_ROLE_OPTIONS: Array<{
  value: RoleMode
  label: string
}> = [
  { value: 'manager', label: 'Manager — Full access, settings, team management' },
  { value: 'editor', label: 'Editor — Own cards, drag forward, no settings' },
  { value: 'observer', label: 'Observer — Read-only, analytics access' },
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
    (entry) => normalizeEmail(entry.email) === normalizedValue && normalizeEmail(entry.email) !== normalizedCurrentEmail,
  )

  if (duplicate) {
    return 'That email already has workspace access.'
  }

  return null
}

function isDirty(entry: WorkspaceAccessEntry, draft: { email: string; roleMode: RoleMode; editorName: string }) {
  return (
    normalizeEmail(entry.email) !== normalizeEmail(draft.email) ||
    entry.roleMode !== draft.roleMode ||
    (entry.editorName ?? '') !== draft.editorName
  )
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
  const [drafts, setDrafts] = useState<
    Record<string, { email: string; roleMode: RoleMode; editorName: string }>
  >({})
  const [pendingDeleteEmail, setPendingDeleteEmail] = useState<string | null>(null)
  const [newEntry, setNewEntry] = useState({
    email: '',
    roleMode: 'editor' as RoleMode,
    editorName: '',
  })

  const newEntryEmailMessage = getEmailValidationMessage(newEntry.email, entries)
  const canAddNewEntry =
    !newEntryEmailMessage &&
    Boolean(normalizeEmail(newEntry.email)) &&
    (newEntry.roleMode !== 'editor' || Boolean(newEntry.editorName))

  return (
    <div className="settings-stack">
      <div className="settings-block">
        <div className="settings-block-header">
          <div>
            <strong>Workspace Access</strong>
            <p className="muted-copy">
              Add approved work emails here. Once saved, teammates can use the app login page to
              create their account on first sign-in.
            </p>
          </div>
        </div>

        {status === 'loading' ? <p className="muted-copy">Loading workspace access…</p> : null}
        {status === 'error' && errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

        <div className="settings-table full-table">
          <div className="settings-row settings-head workspace-access-head">
            <span>Email</span>
            <span>App Role</span>
            <span>Linked Editor</span>
            <span>Last Updated</span>
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
              (draft.roleMode !== 'editor' || Boolean(draft.editorName))

            return (
              <div
                key={entry.email}
                className={`settings-row workspace-access-row ${rowIsDirty ? 'is-dirty' : ''}`}
              >
                <div className="workspace-access-cell">
                  <input
                    type="email"
                    aria-label="Workspace access email"
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
                    aria-label={`Workspace access role for ${entry.email}`}
                    title={WORKSPACE_ROLE_OPTIONS.find((option) => option.value === draft.roleMode)?.label}
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
                </div>

                <div className="workspace-access-cell">
                  <select
                    aria-label={`Linked editor for ${entry.email}`}
                    value={draft.editorName}
                    disabled={draft.roleMode !== 'editor'}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [entry.email]: { ...draft, editorName: event.target.value },
                      }))
                    }
                  >
                    <option value="">
                      {draft.roleMode === 'editor' ? 'Select editor' : 'Not needed'}
                    </option>
                    {editorOptions.map((editorName) => (
                      <option key={editorName} value={editorName}>
                        {editorName}
                      </option>
                    ))}
                  </select>
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
                    disabled={pendingEmail === entry.email}
                    onClick={() => setPendingDeleteEmail(entry.email)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="workspace-access-new-card">
          <div className="settings-section-header">
            <h3>Add New User</h3>
            <p className="muted-copy">
              Add a work email here before sending someone to the login page.
            </p>
          </div>

          <div className="workspace-access-new-grid workspace-access-row is-new">
            <div className="workspace-access-cell">
              <input
                type="email"
                aria-label="Workspace access email"
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
                aria-label="New workspace access role"
                title={WORKSPACE_ROLE_OPTIONS.find((option) => option.value === newEntry.roleMode)?.label}
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
            </div>

            <div className="workspace-access-cell">
              <select
                aria-label="New linked editor"
                value={newEntry.editorName}
                disabled={newEntry.roleMode !== 'editor'}
                onChange={(event) =>
                  setNewEntry((current) => ({
                    ...current,
                    editorName: event.target.value,
                  }))
                }
              >
                <option value="">
                  {newEntry.roleMode === 'editor' ? 'Select editor' : 'Not needed'}
                </option>
                {editorOptions.map((editorName) => (
                  <option key={editorName} value={editorName}>
                    {editorName}
                  </option>
                ))}
              </select>
            </div>

            <div className="workspace-access-new-actions">
              <button
                type="button"
                className={`primary-button ${pendingEmail === '__new__' ? 'is-loading' : ''}`}
                disabled={!canAddNewEntry || pendingEmail === '__new__'}
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
                  'Add'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {pendingDeleteEmail ? (
        <ConfirmDialog
          title="Remove workspace access?"
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
