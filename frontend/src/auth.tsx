import { createContext, useContext, useState, type ReactNode } from 'react'

type Role = 'admin' | 'editor' | 'viewer'

interface AuthCtx {
  token: string | null
  role: Role | null
  email: string | null
  isAuthenticated: boolean
  setAuth: (token: string, role: string, email: string) => void
  clearAuth: () => void
}

const Ctx = createContext<AuthCtx>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(
    () => localStorage.getItem('token'),
  )
  const [role, setRoleState] = useState<Role | null>(
    () => localStorage.getItem('role') as Role | null,
  )
  const [email, setEmailState] = useState<string | null>(
    () => localStorage.getItem('email'),
  )

  const setAuth = (t: string, r: string, e: string) => {
    localStorage.setItem('token', t)
    localStorage.setItem('role', r)
    localStorage.setItem('email', e)
    setTokenState(t)
    setRoleState(r as Role)
    setEmailState(e)
  }

  const clearAuth = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    localStorage.removeItem('email')
    setTokenState(null)
    setRoleState(null)
    setEmailState(null)
  }

  return (
    <Ctx.Provider value={{ token, role, email, isAuthenticated: !!token, setAuth, clearAuth }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
