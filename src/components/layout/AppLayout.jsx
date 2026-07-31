import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { db } from '../../lib/api'
import { cn } from '../ui/utils'

export default function AppLayout({ currentPage, onNavigate, children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('td_theme') || 'dark')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('td_sidebar_collapsed') === 'true')
  const [pendingTasksCount, setPendingTasksCount] = useState(0)

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

  const handleNavigate = (page) => {
    onNavigate(page)
    setSidebarOpen(false)
  }

  return (
    <div className="flex h-dvh w-full max-w-[100vw] overflow-hidden bg-bg text-text">
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
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
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          onClose={() => setSidebarOpen(false)}
          pendingTasksCount={pendingTasksCount}
        />
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          onOpenSidebar={() => setSidebarOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
          pendingTasksCount={pendingTasksCount}
          onNavigate={handleNavigate}
        />
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
          {children}
        </main>
      </div>
    </div>
  )
}
