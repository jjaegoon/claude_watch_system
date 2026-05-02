import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext.js'
import { initApiClient } from './api/client.js'
import { useEffect } from 'react'

function AppRoutes() {
  const { state, refreshToken } = useAuth()

  useEffect(() => {
    initApiClient(
      () => state.accessToken,
      refreshToken,
    )
  }, [state.accessToken, refreshToken])

  if (state.status === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <span>Loading…</span>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/catalog" element={<PrivateRoute><CatalogListPage /></PrivateRoute>} />
      <Route path="/catalog/:id" element={<PrivateRoute><AssetDetailPage /></PrivateRoute>} />
      <Route path="/" element={<Navigate to="/catalog" replace />} />
      <Route path="*" element={<Navigate to="/catalog" replace />} />
    </Routes>
  )
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { state } = useAuth()
  const location = useLocation()
  if (state.status === 'anonymous') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <>{children}</>
}

// Placeholder pages — implemented in Step 7
function LoginPage() {
  return <div data-testid="login-page"><h1>Login</h1></div>
}
function CatalogListPage() {
  return <div data-testid="catalog-page"><h1>Catalog</h1></div>
}
function AssetDetailPage() {
  return <div data-testid="asset-detail-page"><h1>Asset Detail</h1></div>
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
