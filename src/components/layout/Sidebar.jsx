import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const navItems = [
  // Main: the core day-to-day recruiting workflow
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard', section: 'Main' },
  { id: 'candidates', icon: 'candidates', label: 'Candidates', section: 'Main' },
  { id: 'pipeline', icon: 'pipeline', label: 'Pipeline', section: 'Main' },
  { id: 'jobs', icon: 'jobs', label: 'Jobs', section: 'Main' },
  { id: 'tasks', icon: 'tasks', label: 'Tasks & Targets', section: 'Main' },
  // Tools: supporting utilities used situationally, not the core object screens
  { id: 'callbacks', icon: 'callbacks', label: 'Callbacks', section: 'Tools' },
  { id: 'followups', icon: 'followups', label: 'Follow-ups', section: 'Tools' },
  { id: 'resubmit', icon: 'resubmit', label: 'Re-submit Finder', section: 'Tools' },
  { id: 'ai_center', icon: 'ai', label: 'AI Center', section: 'Tools' },
  { id: 'reports', icon: 'reports', label: 'Reports', section: 'Tools' },
  { id: 'postings', icon: 'postings', label: 'Job Postings', section: 'Tools' },
  // Workspace: org/people reference, not a recruiting-workflow tool
  { id: 'directory', icon: 'directory', label: 'Team Directory', section: 'Workspace' },
  // Admin: role-gated
  { id: 'admin', icon: 'admin', label: 'Admin Panel', section: 'Admin', adminOnly: true },
]

const ROLE_COLORS = {
  superadmin: { bg: 'rgba(255,92,135,0.15)', color: '#ff5c87', label: 'Super Admin' },
  admin: { bg: 'rgba(79,124,255,0.15)', color: '#4f7cff', label: 'Admin' },
  manager: { bg: 'rgba(245,200,66,0.15)', color: '#f5c842', label: 'Manager' },
  recruiter: { bg: 'rgba(46,204,143,0.15)', color: '#2ecc8f', label: 'Recruiter' },
  employee: { bg: 'rgba(100,116,139,0.15)', color: '#64748b', label: 'Employee' },
}

function readJson(key, fallback) {
  try {
    const saved = localStorage.getItem(key)
    const parsed = saved ? JSON.parse(saved) : fallback
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export default function Sidebar({ currentPage, onNavigate, theme, onToggleTheme, isCollapsed, onToggleCollapse, onClose, pendingTasksCount = 0 }) {
  const { user, profile, profileError, signOut } = useAuth()
  const navigate = useNavigate()

  const [favorites, setFavorites] = useState(() => readJson('td_sidebar_favorites', []))
  const [recentPages, setRecentPages] = useState(() => readJson('td_sidebar_recents', []))
  const [collapsedSections, setCollapsedSections] = useState(() => readJson('td_sidebar_section_state', {}))

  const toggleFavorite = (id, e) => {
    e.stopPropagation()
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
      try { localStorage.setItem('td_sidebar_favorites', JSON.stringify(next)) } catch { /* ignore quota errors */ }
      return next
    })
  }

  const toggleSectionCollapse = (title) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [title]: !prev[title] }
      try { localStorage.setItem('td_sidebar_section_state', JSON.stringify(next)) } catch { /* ignore quota errors */ }
      return next
    })
  }

  const handleNavigate = (id) => {
    setRecentPages(prev => {
      const next = [id, ...prev.filter(p => p !== id)].slice(0, 3)
      try { localStorage.setItem('td_sidebar_recents', JSON.stringify(next)) } catch { /* ignore quota errors */ }
      return next
    })
    onNavigate(id)
  }

  const role = profile?.role || 'recruiter'
  const roleStyle = ROLE_COLORS[role] || ROLE_COLORS.recruiter
  const orgName = 'Recruiter CRM'

  const visibleItems = navItems.filter(item => {
    if (item.adminOnly) return role === 'admin' || role === 'superadmin'
    return true
  })

  const mainItems = visibleItems.filter(i => i.section === 'Main')
  const toolItems = visibleItems.filter(i => i.section === 'Tools')
  const workspaceItems = visibleItems.filter(i => i.section === 'Workspace')
  const adminItems = visibleItems.filter(i => i.section === 'Admin')

  const favoriteItems = visibleItems.filter(i => favorites.includes(i.id))
  const recentItems = recentPages
    .map(id => visibleItems.find(i => i.id === id))
    .filter(i => i && i.id !== currentPage && !favorites.includes(i.id))
    .slice(0, 3)

  const showFavoritesAndRecents = !isCollapsed && (favoriteItems.length > 0 || recentItems.length > 0)

  return (
    <aside className={`app-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <div className="sidebar-brand-container">
          {isCollapsed ? (
            <div className="sidebar-brand-collapsed" title={orgName}>TD</div>
          ) : (
            <div>
              <div className="sidebar-brand">TalentDesk</div>
              <div className="sidebar-org">{orgName}</div>
            </div>
          )}
        </div>
        <div className="sidebar-header-actions">
          <button className="sidebar-collapse-toggle" type="button" onClick={onToggleCollapse} aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <svg className="collapse-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {isCollapsed ? (
                <polyline points="9 18 15 12 9 6"></polyline>
              ) : (
                <polyline points="15 18 9 12 15 6"></polyline>
              )}
            </svg>
          </button>
          <button className="sidebar-close" type="button" onClick={onClose} aria-label="Close navigation">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <nav className="sidebar-nav">
        {showFavoritesAndRecents && (
          <div className="sidebar-section">
            <div className="sidebar-section-label static">Favorites & Recent</div>
            {favoriteItems.map(item => (
              <NavItem
                key={`fav-${item.id}`}
                item={item}
                active={currentPage === item.id}
                onClick={() => handleNavigate(item.id)}
                isCollapsed={isCollapsed}
                pendingTasksCount={pendingTasksCount}
                isFavorite
                onToggleFavorite={(e) => toggleFavorite(item.id, e)}
              />
            ))}
            {recentItems.map(item => (
              <NavItem
                key={`recent-${item.id}`}
                item={item}
                active={false}
                onClick={() => handleNavigate(item.id)}
                isCollapsed={isCollapsed}
                pendingTasksCount={pendingTasksCount}
                isFavorite={false}
                onToggleFavorite={(e) => toggleFavorite(item.id, e)}
                muted
              />
            ))}
          </div>
        )}

        <Section
          title="Main" items={mainItems} currentPage={currentPage} onNavigate={handleNavigate} isCollapsed={isCollapsed}
          pendingTasksCount={pendingTasksCount} favorites={favorites} onToggleFavorite={toggleFavorite}
          collapsed={!!collapsedSections['Main']} onToggleCollapse={() => toggleSectionCollapse('Main')}
        />
        <Section
          title="Tools" items={toolItems} currentPage={currentPage} onNavigate={handleNavigate} isCollapsed={isCollapsed}
          pendingTasksCount={pendingTasksCount} favorites={favorites} onToggleFavorite={toggleFavorite}
          collapsed={!!collapsedSections['Tools']} onToggleCollapse={() => toggleSectionCollapse('Tools')}
        />
        {workspaceItems.length > 0 && (
          <Section
            title="Workspace" items={workspaceItems} currentPage={currentPage} onNavigate={handleNavigate} isCollapsed={isCollapsed}
            pendingTasksCount={pendingTasksCount} favorites={favorites} onToggleFavorite={toggleFavorite}
            collapsed={!!collapsedSections['Workspace']} onToggleCollapse={() => toggleSectionCollapse('Workspace')}
          />
        )}
        {adminItems.length > 0 && (
          <Section
            title="Admin" items={adminItems} currentPage={currentPage} onNavigate={handleNavigate} isCollapsed={isCollapsed}
            pendingTasksCount={pendingTasksCount} favorites={favorites} onToggleFavorite={toggleFavorite}
            collapsed={!!collapsedSections['Admin']} onToggleCollapse={() => toggleSectionCollapse('Admin')}
          />
        )}
      </nav>

      <div className="sidebar-footer">
        {isCollapsed ? (
          <button className="theme-toggle-compact" type="button" onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        ) : (
          <div className="theme-slider-container" onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            <div className={`theme-slider-knob ${theme}`} />
            <div className={`theme-slider-option ${theme === 'light' ? 'active' : ''}`}>
              <span className="theme-slider-icon">☀️</span>
              <span className="theme-slider-text">Light</span>
            </div>
            <div className={`theme-slider-option ${theme === 'dark' ? 'active' : ''}`}>
              <span className="theme-slider-icon">🌙</span>
              <span className="theme-slider-text">Dark</span>
            </div>
          </div>
        )}

        {isCollapsed ? (
          <div className="sidebar-user-card collapsed">
            <div className="sidebar-avatar" title={`${profile?.full_name || user?.email} (${roleStyle.label})`}>
              {(profile?.full_name || user?.email || 'U').substring(0, 1).toUpperCase()}
            </div>
            <button className="sidebar-signout" onClick={async () => { await signOut(); navigate('/login', { replace: true }) }} title="Sign out" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
          </div>
        ) : (
          <div className="sidebar-user-card">
            <div className="sidebar-user-row">
              <div className="sidebar-avatar">
                {(profile?.full_name || user?.email || 'U').substring(0, 1).toUpperCase()}
              </div>
              <div className="sidebar-user-copy">
                <div className="sidebar-user-name">
                  {profile?.full_name || user?.email?.split('@')[0]}
                </div>
                <div className="sidebar-user-email">{user?.email}</div>
              </div>
            </div>

            <div className="sidebar-role-row">
              <span
                className="sidebar-role"
                style={{
                  background: roleStyle.bg,
                  color: roleStyle.color,
                  borderColor: `${roleStyle.color}44`,
                }}
              >
                {roleStyle.label}
              </span>
              <button className="sidebar-signout" onClick={async () => { await signOut(); navigate('/login', { replace: true }) }} title="Sign out" type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </button>
            </div>
            {profileError && (
              <div className="sidebar-profile-warning" title={profileError}>
                Profile not linked
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

function Section({ title, items, currentPage, onNavigate, isCollapsed, pendingTasksCount, favorites, onToggleFavorite, collapsed, onToggleCollapse }) {
  return (
    <div className="sidebar-section">
      {!isCollapsed ? (
        <button type="button" className="sidebar-section-label" onClick={onToggleCollapse} aria-expanded={!collapsed}>
          <span>{title}</span>
          <svg className={`sidebar-section-chevron ${collapsed ? 'collapsed' : ''}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      ) : (
        <div className="sidebar-section-divider" />
      )}
      {!collapsed && items.map(item => (
        <NavItem
          key={item.id}
          item={item}
          active={currentPage === item.id}
          onClick={() => onNavigate(item.id)}
          isCollapsed={isCollapsed}
          pendingTasksCount={pendingTasksCount}
          isFavorite={favorites?.includes(item.id)}
          onToggleFavorite={onToggleFavorite ? (e) => onToggleFavorite(item.id, e) : undefined}
        />
      ))}
    </div>
  )
}

function NavItem({ item, active, onClick, isCollapsed, pendingTasksCount, isFavorite, onToggleFavorite, muted }) {
  const showRedDot = item.id === 'tasks' && pendingTasksCount > 0

  return (
    <div className="sidebar-nav-item-row">
      <button
        className={`sidebar-nav-item ${active ? 'active' : ''} ${muted ? 'muted' : ''}`}
        type="button"
        onClick={onClick}
        title={isCollapsed ? (showRedDot ? `${item.label} (${pendingTasksCount} pending)` : item.label) : undefined}
      >
        <span className="sidebar-nav-icon" style={{ position: 'relative' }}>
          <SidebarIcon name={item.icon} />
          {showRedDot && <span className="sidebar-red-dot-badge" />}
        </span>
        {!isCollapsed && (
          <span className="sidebar-nav-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>{item.label}</span>
            {showRedDot && <span className="sidebar-red-count">{pendingTasksCount}</span>}
          </span>
        )}
      </button>
      {/* Sibling button, not nested inside the nav button — buttons can't contain
          interactive content, and a nested one would be unreachable by keyboard. */}
      {!isCollapsed && onToggleFavorite && (
        <button
          type="button"
          className={`sidebar-favorite-star ${isFavorite ? 'active' : ''}`}
          onClick={onToggleFavorite}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-label={isFavorite ? `Remove ${item.label} from favorites` : `Add ${item.label} to favorites`}
          aria-pressed={!!isFavorite}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      )}
    </div>
  )
}

function SidebarIcon({ name }) {
  switch (name) {
    case 'dashboard':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      )
    case 'tasks':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      )
    case 'ai':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      )
    case 'candidates':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'pipeline':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="2" y1="14" x2="6" y2="14" />
          <line x1="10" y1="8" x2="14" y2="8" />
          <line x1="18" y1="16" x2="22" y2="16" />
        </svg>
      )
    case 'jobs':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      )
    case 'callbacks':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      )
    case 'reports':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <rect x="7" y="12" width="3" height="5" rx="1" />
          <rect x="12" y="8" width="3" height="9" rx="1" />
          <rect x="17" y="5" width="3" height="12" rx="1" />
        </svg>
      )
    case 'resubmit':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
      )
    case 'followups':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      )
    case 'postings':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      )
    case 'directory':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      )
    case 'admin':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )
    default:
      return <span>◉</span>
  }
}
