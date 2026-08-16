import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AccessPage } from './pages/AccessPage'
import { HomePage } from './pages/HomePage'
import { ImportPage } from './pages/ImportPage'
import { InviteAcceptPage } from './pages/InviteAcceptPage'
import { LoginPage } from './pages/LoginPage'
import { TreePage } from './pages/TreePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/tree" element={<TreePage />} />
          <Route path="/tree/:rootId" element={<TreePage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/access" element={<AccessPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
