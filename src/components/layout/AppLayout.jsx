import { useEffect, useRef, useState } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { db } from '../../lib/api'
import { cn } from '../ui/utils'

export default function AppLayout({ currentPage, onNavigate, children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('td_theme') || 'dark')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('td_sidebar_collapsed') === 'true')
  const [pendingTasksCount, setPendingTasksCount] = useState(0)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 1024 : false)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('td_theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  const toggleSidebarCollapse = () => {
    const next = !sidebarCollapsed
    setSidebarCollapsed(next)
    localStorage.setItem('td_sidebar_collapsed', String(next))
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const checkTasks = async () => {
      try {
        const { data } = await db.from('tasks').select('*')
        if (data) setPendingTasksCount(data.filter(t => t.status !== 'Completed').length)
      } catch {
        // silent catch
      }
    }
    checkTasks()
    const interval = setInterval(checkTasks, 10000)
    return () => clearInterval(interval)
  }, [])

  // Disable browser scroll restoration so refresh always starts at the top
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    return () => { if ('scrollRestoration' in history) history.scrollRestoration = 'auto' }
  }, [])

  const mainRef = useRef(null)
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [currentPage])

  const handleNavigate = (page) => {
    onNavigate(page)
    setSidebarOpen(false)
  }

  return (
    <div className="relative isolate flex h-dvh w-full max-w-[100vw] overflow-hidden bg-bg text-text">
      {/* Ambient atmosphere */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-[16%] w-[640px] h-[640px] rounded-full opacity-[0.20] blur-[120px]" style={{ background: 'var(--accent)' }} />
        <div className="absolute top-[15%] -right-44 w-[700px] h-[700px] rounded-full opacity-[0.18] blur-[130px]" style={{ background: 'var(--ai)' }} />
        <div className="absolute -bottom-52 left-[6%] w-[580px] h-[580px] rounded-full opacity-[0.14] blur-[120px]" style={{ background: 'var(--accent2)' }} />
      </div>

      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden animate-in fade-in duration-150"
        />
      )}

      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 lg:relative lg:z-auto transition-transform duration-200 ease-[var(--ease-standard)]',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <Sidebar
          currentPage={currentPage}
          onNavigate={handleNavigate}
          isCollapsed={isMobile ? false : sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          onClose={() => setSidebarOpen(false)}
          pendingTasksCount={pendingTasksCount}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          onOpenSidebar={() => setSidebarOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
          pendingTasksCount={pendingTasksCount}
          onNavigate={handleNavigate}
          currentPage={currentPage}
        />
        <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
          {children}
        </main>
      </div>
    </div>
  )
}
