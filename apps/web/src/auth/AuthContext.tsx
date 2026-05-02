import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'

// T-21: access_token stored in memory (Context) only — persistent storage forbidden
type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface AuthState {
  status: AuthStatus
  accessToken: string | null
  userId: string | null
  role: string | null
}

type AuthAction =
  | { type: 'BOOT_SUCCESS'; accessToken: string; userId: string; role: string }
  | { type: 'BOOT_FAIL' }
  | { type: 'LOGIN'; accessToken: string; userId: string; role: string }
  | { type: 'LOGOUT' }
  | { type: 'TOKEN_REFRESH'; accessToken: string }

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'BOOT_SUCCESS':
    case 'LOGIN':
      return {
        status: 'authenticated',
        accessToken: action.accessToken,
        userId: action.userId,
        role: action.role,
      }
    case 'BOOT_FAIL':
    case 'LOGOUT':
      return { status: 'anonymous', accessToken: null, userId: null, role: null }
    case 'TOKEN_REFRESH':
      return { ...state, accessToken: action.accessToken }
    default:
      return state
  }
}

interface AuthContextValue {
  state: AuthState
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    status: 'loading',
    accessToken: null,
    userId: null,
    role: null,
  })

  // Boot: attempt silent refresh to restore session
  useEffect(() => {
    const boot = async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        })
        if (!res.ok) throw new Error('refresh failed')
        const body = (await res.json()) as {
          access_token: string
          user: { id: string; role: string }
        }
        dispatch({
          type: 'BOOT_SUCCESS',
          accessToken: body.access_token,
          userId: body.user.id,
          role: body.user.role,
        })
      } catch {
        dispatch({ type: 'BOOT_FAIL' })
      }
    }
    void boot()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const err = (await res.json()) as { error: { message: string } }
      throw new Error(err.error.message)
    }
    const body = (await res.json()) as {
      access_token: string
      user: { id: string; role: string }
    }
    dispatch({
      type: 'LOGIN',
      accessToken: body.access_token,
      userId: body.user.id,
      role: body.user.role,
    })
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {})
    dispatch({ type: 'LOGOUT' })
  }, [])

  const refreshToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        dispatch({ type: 'LOGOUT' })
        return null
      }
      const body = (await res.json()) as { access_token: string }
      dispatch({ type: 'TOKEN_REFRESH', accessToken: body.access_token })
      return body.access_token
    } catch {
      dispatch({ type: 'LOGOUT' })
      return null
    }
  }, [])

  return (
    <AuthContext.Provider value={{ state, login, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
