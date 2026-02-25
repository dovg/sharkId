import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { getValidationQueueCount, logout } from '../api'
import { useAuth } from '../auth'

export function Sidebar() {
  const { clearAuth, role } = useAuth()
  const navigate = useNavigate()
  const [queueCount, setQueueCount] = useState(0)

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
      <div className="sidebar-logo">🦈 SharkID</div>
      <nav className="sidebar-nav">
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
          to="/sharks"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          Shark Catalog
        </NavLink>
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
