import { useState } from 'react'
import { formatDateTime, type RoleMode } from '../board'
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

export function WorkspaceAccessManager({
  entries,
  editorOptions,
  status,
  errorMessage,
  pendingEmail,
  onSave,
  onDelete,
}: WorkspaceAccessManagerProps) {
  const [drafts, setDrafts] = useState<Record<string, { email: string; roleMode: RoleMode; editorName: string }>>({})
  const [newEntry, setNewEntry] = useState({
    email: '',
    roleMode: 'observer' as RoleMode,
    editorName: '',
  })

  return (
    <div className="settings-stack">
      <div className="settings-block">
        <div className="settings-block-header">
          <div>
            <strong>Workspace Access</strong>
            <p className="muted-copy">
              Add approved work emails here. Once saved, teammates can use the app login page
              to create their account on first sign-in.
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

            return (
              <div key={entry.email} className="settings-row workspace-access-row">
                <input
                  type="email"
                  value={draft.email}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [entry.email]: { ...draft, email: event.target.value },
                    }))
                  }
                />
                <select
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
                  <option value="manager">Manager</option>
                  <option value="editor">Editor</option>
                  <option value="observer">Observer</option>
                </select>
                <select
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
                <span className="muted-copy">{entry.updatedAt ? formatDateTime(entry.updatedAt) : '—'}</span>
                <div className="task-type-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={pendingEmail === entry.email}
                    onClick={() =>
                      void onSave({
                        email: draft.email,
                        roleMode: draft.roleMode,
                        editorName: draft.roleMode === 'editor' ? draft.editorName : null,
                        previousEmail: entry.email,
                      })
                    }
                  >
                    {pendingEmail === entry.email ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="clear-link danger-link"
                    disabled={pendingEmail === entry.email}
                    onClick={() => void onDelete(entry.email)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}

          <div className="settings-row workspace-access-row is-new">
            <input
              type="email"
              value={newEntry.email}
              placeholder="teammate@company.com"
              onChange={(event) =>
                setNewEntry((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
            <select
              value={newEntry.roleMode}
              onChange={(event) =>
                setNewEntry((current) => ({
                  ...current,
                  roleMode: event.target.value as RoleMode,
                  editorName: event.target.value === 'editor' ? current.editorName : '',
                }))
              }
            >
              <option value="manager">Manager</option>
              <option value="editor">Editor</option>
              <option value="observer">Observer</option>
            </select>
            <select
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
            <span className="muted-copy">New</span>
            <div className="task-type-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!newEntry.email.trim() || pendingEmail === '__new__'}
                onClick={() =>
                  void onSave({
                    email: newEntry.email,
                    roleMode: newEntry.roleMode,
                    editorName: newEntry.roleMode === 'editor' ? newEntry.editorName : null,
                  }).then(() =>
                    setNewEntry({
                      email: '',
                      roleMode: 'observer',
                      editorName: '',
                    }),
                  )
                }
              >
                {pendingEmail === '__new__' ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
