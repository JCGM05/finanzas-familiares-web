import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from '../lib/api'
import type { UserOut } from '../lib/types'

interface AuthState {
  user: UserOut | null
  appName: string
  ready: boolean
  loginWithToken: (accessToken: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  setAppName: (n: string) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null)
  const [appName, setAppName] = useState('Finanzas Familiares')
  const [ready, setReady] = useState(false)

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      setUser(await api.me())
    } catch {
      logout()
    }
  }, [logout])

  const loginWithToken = useCallback(async (accessToken: string) => {
    tokenStore.set(accessToken)
    setUser(await api.me())
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    // Nombre de la app (público) + sesión existente
    api.publicSettings().then((s) => setAppName(s.app_name)).catch(() => {})
    ;(async () => {
      if (tokenStore.get()) {
        try {
          setUser(await api.me())
        } catch {
          tokenStore.clear()
        }
      }
      setReady(true)
    })()
  }, [])

  useEffect(() => {
    document.title = appName
  }, [appName])

  return (
    <AuthContext.Provider value={{ user, appName, ready, loginWithToken, logout, refreshUser, setAppName }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
