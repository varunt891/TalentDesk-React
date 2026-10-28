import { useEffect, useRef, useState } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { db } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../ui/utils'

export default function AppLayout({ currentPage, onNavigate, children }) {
  const { user, profile } = useAuth()
  const [theme, setTheme] = useState(() => localStorage.getItem('td_theme_v2') || 'light')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('td_sidebar_collapsed') !== 'false')
  const [sidebarHovered, setSidebarHovered] = useState(false)
  const [sidebarKeyboardOpen, setSidebarKeyboardOpen] = useState(false)
  const [pendingTasksCount, setPendingTasksCount] = useState(0)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 1024 : false)
  const navigationAsDrawer = isMobile
  const hoverNavigation = currentPage === 'ai_center' && !isMobile
  const hoverExpanded = sidebarHovered || sidebarKeyboardOpen
  const closeNavigation = () => {
    setSidebarOpen(false)
    setSidebarHovered(false)
    setSidebarKeyboardOpen(false)
  }

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      setSidebarHovered(false)
      setSidebarKeyboardOpen(false)
      // Auto-close mobile sidebar when resizing to desktop
      if (!mobile) setSidebarOpen(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('td_theme_v2', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  // Touch layouts retain the on-demand navigation drawer.
  useEffect(() => {
    if (navigationAsDrawer && sidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [navigationAsDrawer, sidebarOpen])

  // Close mobile sidebar on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false)
        setSidebarHovered(false)
        setSidebarKeyboardOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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
      if (!user) {
        setPendingTasksCount(0)
        return
      }
      try {
        const { data } = await db.from('tasks').select('*')
        if (data) {
          const currentToday = new Date().toISOString().slice(0, 10)
          const isManager = ['admin', 'superadmin', 'manager'].includes(profile?.role)

          const userTasks = data.filter(t => {
            if (t.status === 'Completed') return false
            if (!isManager && t.assigned_to !== user.id && t.assigned_by !== user.id) return false
            if (t.due_date && t.due_date > currentToday) return false
            return true
          })

          setPendingTasksCount(userTasks.length)
        }
      } catch {
        // silent catch
      }
    }

    checkTasks()
    const interval = setInterval(checkTasks, 10000)
    window.addEventListener('td:tasks-changed', checkTasks)

    return () => {
      clearInterval(interval)
      window.removeEventListener('td:tasks-changed', checkTasks)
    }
  }, [user, profile])

  // Disable browser scroll restoration so refresh always starts at the top
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    return () => { if ('scrollRestoration' in history) history.scrollRestoration = 'auto' }
  }, [])

  const mainRef = useRef(null)
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
    window.scrollTo(0, 0)
    document.body.scrollTop = 0
    document.documentElement.scrollTop = 0
  }, [currentPage])

  const handleNavigate = (page, params) => {
    onNavigate(page, params)
    closeNavigation()
  }

  return (
    <div className="app-shell relative isolate flex h-dvh w-full max-w-[100vw] overflow-hidden bg-bg text-text" data-page={currentPage}>


      {sidebarOpen && navigationAsDrawer && (
        <div
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
        />
      )}

      <div
        id="workspace-navigation"
        aria-hidden={navigationAsDrawer && !sidebarOpen ? true : undefined}
        inert={navigationAsDrawer && !sidebarOpen}
        className={cn(
          'navigation-rail inset-y-0 left-0 shrink-0 transition-[transform,width,min-width] duration-200 ease-[var(--ease-standard)] will-change-[transform,width]',
          hoverNavigation && 'ai-navigation-rail',
          navigationAsDrawer ? 'fixed z-40 w-60 min-w-[15rem]' : hoverNavigation ? 'relative z-40 w-20 min-w-[5rem]' : sidebarCollapsed ? 'relative z-auto w-20 min-w-[5rem]' : 'relative z-auto w-60 min-w-[15rem]',
          navigationAsDrawer && !sidebarOpen ? '-translate-x-full' : 'translate-x-0'
        )}
      >
        <div
          className={hoverNavigation ? 'ai-hover-navigation-surface' : 'h-full'}
          data-expanded={hoverNavigation ? hoverExpanded : undefined}
          onPointerEnter={event => { if (hoverNavigation && event.pointerType === 'mouse') setSidebarHovered(true) }}
          onPointerLeave={() => { if (hoverNavigation) setSidebarHovered(false) }}
          onFocusCapture={event => { if (hoverNavigation && event.target.matches(':focus-visible')) setSidebarKeyboardOpen(true) }}
          onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSidebarKeyboardOpen(false) }}
        >
        <Sidebar
          currentPage={currentPage}
          onNavigate={handleNavigate}
          isCollapsed={navigationAsDrawer ? false : hoverNavigation ? !hoverExpanded : sidebarCollapsed}
          isOverlay={navigationAsDrawer || hoverNavigation}
          isHoverNavigation={hoverNavigation}
          onToggleCollapse={hoverNavigation ? () => setSidebarKeyboardOpen(true) : toggleSidebarCollapse}
          onClose={closeNavigation}
          pendingTasksCount={pendingTasksCount}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        </div>
      </div>

      <div className="flex-1 min-w-0 h-full min-h-0 flex flex-col overflow-hidden">
        <TopBar
          onOpenSidebar={() => setSidebarOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
          pendingTasksCount={pendingTasksCount}
          onNavigate={handleNavigate}
          currentPage={currentPage}
          navigationAsDrawer={navigationAsDrawer}
          navigationOpen={sidebarOpen}
        />
        <main ref={mainRef} className="app-main flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col overscroll-y-contain">
          {children}
        </main>
      </div>
    </div>
  )
}
