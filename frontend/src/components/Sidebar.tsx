import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { getValidationQueueCount, logout } from '../api'
import { useAuth } from '../auth'

export function Sidebar() {
  const { setToken } = useAuth()
  const navigate = useNavigate()
  const [queueCount, setQueueCount] = useState(0)

  useEffect(() => {
    getValidationQueueCount()
      .then(r => setQueueCount(r.count))
      .catch(() => {})
  }, [])

  const handleLogout = async () => {
    await logout().catch(() => {})
    setToken(null)
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
        <NavLink
          to="/validation-queue"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span>Validation Queue</span>
          {queueCount > 0 && <span className="badge">{queueCount}</span>}
        </NavLink>
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
        <NavLink
          to="/audit-log"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          Audit Log
        </NavLink>
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
