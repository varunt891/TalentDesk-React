import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Icon } from '../ui/icons'
import { cn } from '../ui/utils'

const navItems = [
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard', section: 'Main' },
  { id: 'candidates', icon: 'users', label: 'Candidates', section: 'Main' },
  { id: 'pipeline', icon: 'pipeline', label: 'Pipeline', section: 'Main' },
  { id: 'jobs', icon: 'jobs', label: 'Jobs', section: 'Main' },
  { id: 'tasks', icon: 'tasks', label: 'Tasks & Targets', section: 'Main' },
  { id: 'callbacks', icon: 'callbacks', label: 'Callbacks', section: 'Tools' },
  { id: 'followups', icon: 'followups', label: 'Follow-ups', section: 'Tools' },
  { id: 'resubmit', icon: 'resubmit', label: 'Re-submit Finder', section: 'Tools' },
  { id: 'ai_center', icon: 'sparkles', label: 'AI Center', section: 'Tools' },
  { id: 'reports', icon: 'reports', label: 'Reports', section: 'Tools' },
  { id: 'postings', icon: 'postings', label: 'Job Postings', section: 'Tools' },
  { id: 'team_management', icon: 'directory', label: 'Team Management', section: 'Workspace' },
  { id: 'org_settings', icon: 'admin', label: 'Company Settings', section: 'Workspace' },
  { id: 'directory', icon: 'directory', label: 'Team Directory', section: 'Workspace' },
  { id: 'admin', icon: 'admin', label: 'Admin Panel', section: 'Admin', adminOnly: true },
]

function readJson(key, fallback) {
  try {
    const saved = localStorage.getItem(key)
    const parsed = saved ? JSON.parse(saved) : fallback
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export default function Sidebar({ currentPage, onNavigate, isCollapsed, onToggleCollapse, onClose, pendingTasksCount = 0 }) {
  const { profile, organization } = useAuth()

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

  const role = (profile?.role || 'recruiter').toLowerCase()
  const orgName = organization?.name || 'Recruiter CRM'

  const visibleItems = navItems.filter(item => {
    if (item.adminOnly) return ['admin', 'superadmin', 'owner'].includes(role)
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
    <aside
      className={cn(
        'h-full flex flex-col bg-surface2 border-r border-border shrink-0',
        'transition-[width] duration-200 ease-[var(--ease-standard)]',
        isCollapsed ? 'w-16' : 'w-52'
      )}
    >
      <div className={cn('flex items-center gap-2 h-14 border-b border-border shrink-0', isCollapsed ? 'justify-center px-2' : 'justify-between px-4')}>
        {isCollapsed ? (
          <div
            className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-sm font-extrabold bg-gradient-to-br from-accent to-accent2 text-white shrink-0"
            title={orgName}
          >
            TD
          </div>
        ) : (
          <div className="min-w-0">
            <div className="text-[15px] font-extrabold text-text tracking-tight truncate">TalentDesk</div>
            <div className="text-[10px] font-semibold text-text3 uppercase tracking-wider truncate">{orgName}</div>
          </div>
        )}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="focus-ring hidden lg:flex w-7 h-7 rounded-[var(--radius-sm)] items-center justify-center text-text3 hover:bg-surface2 hover:text-text transition-colors duration-[var(--duration-fast)]"
          >
            <Icon name={isCollapsed ? 'chevronRight' : 'chevronLeft'} size={13} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="focus-ring lg:hidden w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center text-text3 hover:bg-surface2 hover:text-text"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3 flex flex-col gap-1">
        {showFavoritesAndRecents && (
          <NavSection title="Favorites & Recent" isCollapsed={isCollapsed} pinned>
            {favoriteItems.map(item => (
              <NavItem key={`fav-${item.id}`} item={item} active={currentPage === item.id} onClick={() => handleNavigate(item.id)} isCollapsed={isCollapsed} pendingTasksCount={pendingTasksCount} isFavorite onToggleFavorite={(e) => toggleFavorite(item.id, e)} />
            ))}
            {recentItems.map(item => (
              <NavItem key={`recent-${item.id}`} item={item} active={false} onClick={() => handleNavigate(item.id)} isCollapsed={isCollapsed} pendingTasksCount={pendingTasksCount} isFavorite={false} onToggleFavorite={(e) => toggleFavorite(item.id, e)} muted />
            ))}
          </NavSection>
        )}

        <NavSection title="Main" items={mainItems} currentPage={currentPage} onNavigate={handleNavigate} isCollapsed={isCollapsed} pendingTasksCount={pendingTasksCount} favorites={favorites} onToggleFavorite={toggleFavorite} collapsed={!!collapsedSections['Main']} onToggleCollapse={() => toggleSectionCollapse('Main')} />
        <NavSection title="Tools" items={toolItems} currentPage={currentPage} onNavigate={handleNavigate} isCollapsed={isCollapsed} pendingTasksCount={pendingTasksCount} favorites={favorites} onToggleFavorite={toggleFavorite} collapsed={!!collapsedSections['Tools']} onToggleCollapse={() => toggleSectionCollapse('Tools')} />
        {workspaceItems.length > 0 && (
          <NavSection title="Workspace" items={workspaceItems} currentPage={currentPage} onNavigate={handleNavigate} isCollapsed={isCollapsed} pendingTasksCount={pendingTasksCount} favorites={favorites} onToggleFavorite={toggleFavorite} collapsed={!!collapsedSections['Workspace']} onToggleCollapse={() => toggleSectionCollapse('Workspace')} />
        )}
        {adminItems.length > 0 && (
          <NavSection title="Admin" items={adminItems} currentPage={currentPage} onNavigate={handleNavigate} isCollapsed={isCollapsed} pendingTasksCount={pendingTasksCount} favorites={favorites} onToggleFavorite={toggleFavorite} collapsed={!!collapsedSections['Admin']} onToggleCollapse={() => toggleSectionCollapse('Admin')} />
        )}
      </nav>
    </aside>
  )
}

function NavSection({ title, items, currentPage, onNavigate, isCollapsed, pendingTasksCount, favorites, onToggleFavorite, collapsed, onToggleCollapse, pinned, children }) {
  return (
    <div className="flex flex-col gap-0.5 mb-1">
      {!isCollapsed ? (
        pinned ? (
          <div className="px-2 pt-1 pb-1.5 text-[10px] font-bold text-text3 uppercase tracking-wider">{title}</div>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            className="focus-ring flex items-center justify-between px-2 pt-2.5 pb-1.5 rounded-[var(--radius-sm)] text-[10px] font-bold text-text3 uppercase tracking-wider hover:text-text2 transition-colors duration-[var(--duration-fast)]"
          >
            <span>{title}</span>
            <Icon name="chevronDown" size={10} className={cn('transition-transform duration-[var(--duration-fast)]', collapsed && '-rotate-90')} />
          </button>
        )
      ) : (
        <div className="h-px bg-border mx-1.5 my-1.5" />
      )}
      {(pinned || !collapsed) && children}
      {!pinned && !collapsed && items?.map(item => (
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
    <div className="group/nav relative flex items-center">
      <button
        type="button"
        onClick={onClick}
        title={isCollapsed ? item.label : undefined}
        className={cn(
          'focus-ring relative flex items-center gap-2.5 w-full h-[34px] rounded-[var(--radius-sm)] text-[13px] font-semibold transition-colors duration-[var(--duration-fast)]',
          isCollapsed ? 'justify-center px-0' : 'px-2.5',
          active ? 'bg-accent/12 text-accent shadow-[inset_0_0_0_1px_rgba(59,130,246,0.14)]' : muted ? 'text-text3 hover:bg-surface3 hover:text-text2' : 'text-text2 hover:bg-surface3 hover:text-text'
        )}
      >
        <span className="relative shrink-0 flex items-center justify-center">
          <Icon name={item.icon} size={15} />
          {showRedDot && isCollapsed && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red border-2 border-surface" />}
        </span>
        {!isCollapsed && (
          <span className="flex-1 flex items-center justify-between min-w-0 truncate text-left">
            <span className="truncate">{item.label}</span>
            {showRedDot && (
              <span className="ml-2 text-[10px] font-extrabold bg-red/15 text-red rounded-full px-1.5 leading-4 shrink-0">{pendingTasksCount}</span>
            )}
          </span>
        )}
      </button>
      {!isCollapsed && onToggleFavorite && (
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={isFavorite ? `Remove ${item.label} from favorites` : `Add ${item.label} to favorites`}
          aria-pressed={!!isFavorite}
          className={cn(
            'focus-ring absolute right-1.5 w-5 h-5 flex items-center justify-center text-xs rounded-[var(--radius-sm)] transition-opacity duration-[var(--duration-fast)]',
            isFavorite ? 'text-yellow opacity-100' : 'text-text3 opacity-0 group-hover/nav:opacity-100 hover:text-yellow'
          )}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      )}
    </div>
  )
}
