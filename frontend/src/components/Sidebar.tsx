import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { getValidationQueueCount, logout } from '../api'
import { useAuth } from '../auth'
import { useTheme } from '../hooks'

export function Sidebar() {
  const { clearAuth, role } = useAuth()
  const navigate = useNavigate()
  const [queueCount, setQueueCount] = useState(0)
  const { dark, toggle } = useTheme()

  useEffect(() => {
    if (role === 'viewer') return
    getValidationQueueCount()
      .then(r => setQueueCount(r.count))
      .catch(() => {})
  }, [role])

  const handleLogout = async () => {
    await logout().catch(() => {})
    clearAuth()
    navigate('/login')
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">🦈 sharkId.tech</div>
      <nav className="sidebar-nav">
        <NavLink
          to="/sharks"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          Shark Catalog
        </NavLink>
        <NavLink
          to="/dive-sessions"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          Dive Sessions
        </NavLink>
        {role !== 'viewer' && (
          <NavLink
            to="/validation-queue"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span>Validation Queue</span>
            {queueCount > 0 && <span className="badge">{queueCount}</span>}
          </NavLink>
        )}
        <NavLink
          to="/locations"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          Locations
        </NavLink>
        {role !== 'viewer' && (
          <NavLink
            to="/audit-log"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            Audit Log
          </NavLink>
        )}
        {role !== 'viewer' && (
          <NavLink
            to="/ml-model"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            ML Model
          </NavLink>
        )}
        {role === 'admin' && (
          <NavLink
            to="/users"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            Users
          </NavLink>
        )}
      </nav>
      <div className="sidebar-footer">
        <div className="theme-switch-wrap">
          <span>{dark ? '🌙 Dark' : '☀️ Light'}</span>
          <label className="theme-switch" aria-label="Toggle theme">
            <input type="checkbox" checked={dark} onChange={toggle} />
            <span className="theme-switch-track">
              <span className="theme-switch-thumb" />
            </span>
          </label>
        </div>
        <button
          className="nav-item"
          onClick={handleLogout}
          style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left' }}
        >
          Log Out
        </button>
      </div>
    </aside>
  )
}
