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
import AppLayout from './components/layout/AppLayout'
import { db } from './lib/api'

function ProtectedRoute({ children }) {
  const { user } = useAuth()

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
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        const currentDate = now.toISOString().slice(0, 10)

        for (const callback of callbacks) {
          // Check if callback time has been reached (within the current minute)
          if (callback.date === currentDate && callback.time === currentTime && !notifiedCallbacks.has(callback.id)) {
            setCallbackAlert(callback)
            setNotifiedCallbacks(prev => new Set([...prev, callback.id]))
            // Auto-dismiss after 10 seconds
            setTimeout(() => setCallbackAlert(null), 10000)
          }
        }
      } catch (err) {
        console.error('Error checking callbacks:', err)
      }
    }

    // Check every minute
    const interval = setInterval(checkCallbacks, 60000)
    checkCallbacks() // Initial check

    return () => clearInterval(interval)
  }, [user, notifiedCallbacks])

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard onNavigate={setCurrentPage} />
      case 'candidates': return <Candidates />
      case 'jobs': return <Jobs />
      case 'pipeline': return <Pipeline />
      case 'callbacks': return <Callbacks />
      case 'followups': return <Followups />
      case 'reports': return <Reports />
      case 'postings': return <Postings />
      case 'directory': return <Directory />
      case 'resubmit': return <Resubmit />
      case 'admin': return role === 'admin' || role === 'superadmin' ? <Admin /> : <Navigate to="/" />
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
    <>
      <AppLayout currentPage={currentPage} onNavigate={setCurrentPage}>
        {renderPage()}
      </AppLayout>
      
      {/* Global Callback Alert */}
      {callbackAlert && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setCallbackAlert(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', maxWidth: '500px', width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', animation: 'slideIn 0.3s ease-out' }}>
            <div style={{ fontSize: '56px', marginBottom: '16px', animation: 'bounce 0.6s infinite' }}>📞</div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text)', marginBottom: '8px' }}>Callback Time!</div>
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'left' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
    </>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/*" element={
            <ProtectedRoute>
              <MainApp />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
