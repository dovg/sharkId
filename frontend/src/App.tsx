import { type ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import AuditLog from './pages/AuditLog'
import DiveSessionDetail from './pages/DiveSessionDetail'
import DiveSessions from './pages/DiveSessions'
import Locations from './pages/Locations'
import Login from './pages/Login'
import ObservationDetail from './pages/ObservationDetail'
import PhotoDetail from './pages/PhotoDetail'
import SharkDetail from './pages/SharkDetail'
import Sharks from './pages/Sharks'
import ValidationQueue from './pages/ValidationQueue'

function Guard({ children }: { children: ReactElement }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/dive-sessions" replace />} />
          <Route
            path="/dive-sessions"
            element={<Guard><DiveSessions /></Guard>}
          />
          <Route
            path="/dive-sessions/:id"
            element={<Guard><DiveSessionDetail /></Guard>}
          />
          <Route
            path="/validation-queue"
            element={<Guard><ValidationQueue /></Guard>}
          />
          <Route path="/sharks" element={<Guard><Sharks /></Guard>} />
          <Route path="/sharks/:id" element={<Guard><SharkDetail /></Guard>} />
          <Route path="/photos/:id" element={<Guard><PhotoDetail /></Guard>} />
          <Route
            path="/observations/:id"
            element={<Guard><ObservationDetail /></Guard>}
          />
          <Route path="/locations" element={<Guard><Locations /></Guard>} />
          <Route path="/audit-log" element={<Guard><AuditLog /></Guard>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
