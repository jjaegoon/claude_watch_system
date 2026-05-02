import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext.js'
import { initApiClient } from './api/client.js'
import { LoginPage } from './pages/LoginPage.js'
import { CatalogListPage } from './pages/CatalogListPage.js'
import { AssetDetailPage } from './pages/AssetDetailPage.js'
import { AssetCreatePage } from './pages/AssetCreatePage.js'
import { DashboardPage } from './pages/DashboardPage.js'
import { useRef } from 'react'

function AppRoutes() {
  const { state, refreshToken } = useAuth()

  // Use a ref so the token getter always reads the latest token,
  // avoiding a race where CatalogListPage queries fire before useEffect runs.
  const stateRef = useRef(state)
  stateRef.current = state
  initApiClient(() => stateRef.current.accessToken, refreshToken)

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
      <Route path="/catalog/new" element={<PrivateRoute><AssetCreatePage /></PrivateRoute>} />
      <Route path="/catalog/:id" element={<PrivateRoute><AssetDetailPage /></PrivateRoute>} />
      <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
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

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
