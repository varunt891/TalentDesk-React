import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'

export default function AppLayout({ currentPage, onNavigate, children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('td_theme') || 'dark')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('td_sidebar_collapsed') === 'true')

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

  const handleNavigate = (page) => {
    onNavigate(page)
    setSidebarOpen(false)
  }

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div
        className="mobile-sidebar-backdrop"
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        theme={theme}
        onToggleTheme={toggleTheme}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="app-main">
        <header className="mobile-topbar">
          <button
            className="mobile-menu-button"
            type="button"
            onClick={() => setSidebarOpen(prev => !prev)}
            aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={sidebarOpen}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="mobile-topbar-title-group">
            <span className="mobile-brand-name">TalentDesk</span>
            <span className="mobile-page-badge">{currentPage}</span>
          </div>
        </header>
        {children}
      </main>
    </div>
  )
}
