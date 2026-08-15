import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Candidates from './pages/Candidates'
import Jobs from './pages/Jobs'
import JobDetail from './pages/JobDetail'
import CandidateDetail from './pages/CandidateDetail'
import Pipeline from './pages/Pipeline'
import Callbacks from './pages/Callbacks'
import Followups from './pages/Followups'
import Postings from './pages/Postings'
import Directory from './pages/Directory'
import Resubmit from './pages/Resubmit'
import Collisions from './pages/Collisions'
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

import GlobalCallbackAlert from './components/GlobalCallbackAlert'

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
  const [navParams, setNavParams] = useState({})
  const navigateTo = (page, params = {}) => {
    setNavParams(params)
    setCurrentPage(page)
  }
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
      case 'dashboard': return <Dashboard onNavigate={navigateTo} />
      case 'tasks': return <TasksPage user={profile || user} onNavigate={navigateTo} />
      case 'ai_center': return <AICenter />
      case 'candidates': return <Candidates onNavigate={navigateTo} openEditCandidateId={navParams.editCandidateId} />
      case 'jobs': return <Jobs onNavigate={navigateTo} openEditJobId={navParams.editJobId} />
      case 'job_detail': return <JobDetail jobId={navParams.jobId} onNavigate={navigateTo} />
      case 'candidate_detail': return <CandidateDetail candidateId={navParams.candidateId} onNavigate={navigateTo} />
      case 'pipeline': return <Pipeline />
      case 'callbacks': return <Callbacks onNavigate={navigateTo} />
      case 'followups': return <Followups onNavigate={navigateTo} />
      case 'reports': return <Reports />
      case 'postings': return <Postings />
      case 'directory': return <Directory />
      case 'resubmit': return <Resubmit onNavigate={navigateTo} />
      case 'collisions': return <Collisions />
      case 'org_settings': return <OrgSettings onNavigate={navigateTo} />
      case 'team_management': return <TeamManagement onNavigate={navigateTo} />
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
      <AppLayout currentPage={currentPage} onNavigate={navigateTo}>
        {renderPage()}
      </AppLayout>

      <Copilot />
      <GlobalCallbackAlert />
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
