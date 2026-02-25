import { useEffect, useState } from 'react'
import { createUser, deleteUser, getUsers, updateUser } from '../api'
import { Modal } from '../components/Modal'
import { Sidebar } from '../components/Sidebar'
import { useAuth } from '../auth'
import { usePageTitle } from '../hooks'
import type { Role, UserRecord } from '../types'

export default function Users() {
  usePageTitle('Users')
  const { email: currentEmail } = useAuth()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ email: '', password: '', role: 'viewer' as Role })
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false))
  }, [])

  const handleRoleChange = async (userId: string, role: Role) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
    try {
      await updateUser(userId, { role })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
      // Reload to get correct state
      getUsers().then(setUsers).catch(() => {})
    }
  }

  const handleDelete = async (userId: string, userEmail: string) => {
    if (!window.confirm(`Delete user "${userEmail}"? This cannot be undone.`)) return
    try {
      await deleteUser(userId)
      setUsers(prev => prev.filter(u => u.id !== userId))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')
    setAdding(true)
    try {
      const user = await createUser(addForm)
      setUsers(prev => [...prev, user])
      setAddForm({ email: '', password: '', role: 'viewer' })
      setShowAdd(false)
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setAdding(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetUserId || !resetPassword) return
    setResetError('')
    setResetting(true)
    try {
      await updateUser(resetUserId, { password: resetPassword })
      setResetUserId(null)
      setResetPassword('')
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setResetting(false)
    }
  }

  const resetUser = resetUserId ? users.find(u => u.id === resetUserId) : null

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="page-header">
          <div>
            <h1 className="page-title">Users</h1>
            <div className="page-subtitle">{users.length} user{users.length !== 1 ? 's' : ''}</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            + Add User
          </button>
        </div>

        <div className="page-body">
          {error && <div className="alert-error">{error}</div>}

          {loading ? (
            <div className="muted">Loading…</div>
          ) : (
            <div className="card">
              <table className="table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted" style={{ textAlign: 'center' }}>
                        No users found
                      </td>
                    </tr>
                  ) : (
                    users.map(u => (
                      <tr key={u.id}>
                        <td>
                          {u.email}
                          {u.email === currentEmail && (
                            <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>(you)</span>
                          )}
                        </td>
                        <td>
                          <select
                            value={u.role}
                            onChange={e => handleRoleChange(u.id, e.target.value as Role)}
                            style={{ padding: '2px 6px', fontSize: 13 }}
                          >
                            <option value="viewer">viewer</option>
                            <option value="editor">editor</option>
                            <option value="admin">admin</option>
                          </select>
                        </td>
                        <td>{new Date(u.created_at).toLocaleDateString('en')}</td>
                        <td>
                          <div className="flex-gap8">
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => { setResetUserId(u.id); setResetPassword(''); setResetError('') }}
                            >
                              Reset Password
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={u.email === currentEmail}
                              title={u.email === currentEmail ? 'Cannot delete your own account' : undefined}
                              onClick={() => handleDelete(u.id, u.email)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <Modal title="Add User" onClose={() => setShowAdd(false)}>
          {addError && <div className="alert-error mb16">{addError}</div>}
          <form onSubmit={handleAdd}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                value={addForm.email}
                onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                value={addForm.password}
                onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                required
                minLength={6}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select
                value={addForm.role}
                onChange={e => setAddForm(f => ({ ...f, role: e.target.value as Role }))}
              >
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="flex-gap8 mt16">
              <button type="submit" className="btn btn-primary" disabled={adding}>
                {adding ? 'Creating…' : 'Create User'}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {resetUserId && resetUser && (
        <Modal title={`Reset Password — ${resetUser.email}`} onClose={() => setResetUserId(null)}>
          {resetError && <div className="alert-error mb16">{resetError}</div>}
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input
              type="password"
              value={resetPassword}
              onChange={e => setResetPassword(e.target.value)}
              minLength={6}
              autoFocus
            />
          </div>
          <div className="flex-gap8 mt16">
            <button
              className="btn btn-primary"
              disabled={resetting || !resetPassword}
              onClick={handleResetPassword}
            >
              {resetting ? 'Saving…' : 'Save Password'}
            </button>
            <button className="btn btn-outline" onClick={() => setResetUserId(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
