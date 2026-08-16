import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import {
  ApiError,
  clearAuth,
  isAuthenticated,
  refreshSessionUser,
} from '../api'

export function ProtectedRoute() {
  const [sessionReady, setSessionReady] = useState(() => !isAuthenticated())

  useEffect(() => {
    if (sessionReady) return
    let cancelled = false

    async function syncSession() {
      try {
        await refreshSessionUser()
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          clearAuth()
        }
      } finally {
        if (!cancelled) setSessionReady(true)
      }
    }

    void syncSession()
    return () => {
      cancelled = true
    }
  }, [sessionReady])

  if (!sessionReady) return null
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
