import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Candidates from './pages/Candidates'
import Jobs from './pages/Jobs'
import Pipeline from './pages/Pipeline'
import Callbacks from './pages/Callbacks'
import Followups from './pages/Followups'
import Postings from './pages/Postings'
import Directory from './pages/Directory'
import Resubmit from './pages/Resubmit'
import Admin from './pages/Admin'
import Reports from './pages/Reports'
import AICenter from './pages/AICenter'
import TasksPage from './pages/TasksPage'
import OrgSettings from './pages/OrgSettings'
import TeamManagement from './pages/TeamManagement'
import StyleGuide from './pages/StyleGuide'
import AppLayout from './components/layout/AppLayout'
import Copilot from './components/ai/Copilot'
import { AIContextProvider } from './lib/ai/context'
import { db } from './lib/api'
import { ToastProvider } from './components/ui'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'login-spin 0.7s linear infinite' }} />
          <span style={{ color: 'var(--text2)', fontSize: 13, fontWeight: 600 }}>Restoring session...</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

function MainApp() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [callbackAlert, setCallbackAlert] = useState(null)
  const [notifiedCallbacks, setNotifiedCallbacks] = useState(new Set())
  const { profile, user } = useAuth()
  const role = profile?.role || 'recruiter'

  // Global callback time checker
  useEffect(() => {
    if (!user) return
    
    const checkCallbacks = async () => {
      try {
        const { data: callbacks } = await db.from('callbacks').select('*').eq('status', 'pending')
        if (!callbacks || callbacks.length === 0) return

        const now = new Date()

        for (const callback of callbacks) {
          if (!callback.date || !callback.time || notifiedCallbacks.has(callback.id)) continue

          const scheduledAt = new Date(`${callback.date}T${callback.time}:00`)
          const msOverdue = now - scheduledAt

          if (msOverdue >= 0 && msOverdue <= 24 * 60 * 60 * 1000) {
            setCallbackAlert(callback)
            setNotifiedCallbacks(prev => new Set([...prev, callback.id]))
            setTimeout(() => setCallbackAlert(null), 10000)
          }
        }
      } catch (err) {
        console.error('Error checking callbacks:', err)
      }
    }

    const interval = setInterval(checkCallbacks, 60000)
    checkCallbacks()

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkCallbacks()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [user, notifiedCallbacks])

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard onNavigate={setCurrentPage} />
      case 'tasks': return <TasksPage user={profile || user} onNavigate={setCurrentPage} />
      case 'ai_center': return <AICenter />
      case 'candidates': return <Candidates />
      case 'jobs': return <Jobs />
      case 'pipeline': return <Pipeline />
      case 'callbacks': return <Callbacks onNavigate={setCurrentPage} />
      case 'followups': return <Followups onNavigate={setCurrentPage} />
      case 'reports': return <Reports />
      case 'postings': return <Postings />
      case 'directory': return <Directory />
      case 'resubmit': return <Resubmit onNavigate={setCurrentPage} />
      case 'org_settings': return <OrgSettings onNavigate={setCurrentPage} />
      case 'team_management': return <TeamManagement onNavigate={setCurrentPage} />
      case 'admin': return ['admin', 'superadmin', 'owner', 'ADMIN', 'SUPERADMIN', 'OWNER'].includes(role) ? <Admin /> : <Navigate to="/" />
      default: return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)' }}>{currentPage} - Coming soon</div>
          </div>
        </div>
      )
    }
  }

  return (
    <AIContextProvider currentPage={currentPage}>
      <AppLayout currentPage={currentPage} onNavigate={setCurrentPage}>
        {renderPage()}
      </AppLayout>

      <Copilot />

      {/* Global Callback Alert */}
      {callbackAlert && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }} onClick={() => setCallbackAlert(null)}>
          <div className="modal-card-responsive" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', maxWidth: '500px', width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', animation: 'slideIn 0.3s ease-out' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px', animation: 'bounce 0.6s infinite' }}>📞</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text)', marginBottom: '8px' }}>Callback Time!</div>
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'left' }}>
              <div className="modal-grid-2" style={{ gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Candidate</div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text)' }}>{callbackAlert.candidate_name}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Job</div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text)' }}>{callbackAlert.job || '—'}</div>
                </div>
              </div>
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Contact</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--green)', fontFamily: "'Space Mono',monospace" }}>📱 {callbackAlert.phone || 'No phone'}</div>
              </div>
            </div>
            <button onClick={() => setCallbackAlert(null)} style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 16px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>Dismiss</button>
          </div>
        </div>
      )}
    </AIContextProvider>
  )
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/style-guide" element={
              <ProtectedRoute>
                <StyleGuide />
              </ProtectedRoute>
            } />
            <Route path="/*" element={
              <ProtectedRoute>
                <MainApp />
              </ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
