import { createContext, useContext, useState, type ReactNode } from 'react'

interface AuthCtx {
  token: string | null
  setToken: (t: string | null) => void
  isAuthenticated: boolean
}

const Ctx = createContext<AuthCtx>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(
    () => localStorage.getItem('token'),
  )

  const setToken = (t: string | null) => {
    if (t) localStorage.setItem('token', t)
    else localStorage.removeItem('token')
    setTokenState(t)
  }

  return (
    <Ctx.Provider value={{ token, setToken, isAuthenticated: !!token }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
