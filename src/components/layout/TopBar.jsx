import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Icon } from '../ui/icons'
import Avatar from '../ui/Avatar'
import Menu from '../ui/Menu'
import { Modal, Button, Badge } from '../ui'
import { cn } from '../ui/utils'
import { fetchNotifications, markNotificationRead, markNotificationsRead } from '../../lib/admin/notifications'
import { SETTINGS_TAB_FLAG } from '../../lib/admin/settingsNav'
import { useTopBarInsights } from '../../lib/ai/topBarInsights'
import { useAIBotLines } from '../../lib/ai/botLines'
import PixelRobot from '../ui/PixelRobot'

const ROLE_LABELS = {
  superadmin: 'Super Admin', admin: 'Admin', owner: 'Owner', manager: 'Manager',
  recruitment_manager: 'Recruitment Manager', account_manager: 'Account Manager',
  hr_manager: 'HR Manager', hr_team: 'HR Team', operations_manager: 'Operations Manager',
  recruiter: 'Recruiter', employee: 'Employee',
}

function roleLabel(role) {
  const key = (role || 'recruiter').toLowerCase()
  return ROLE_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

const COMMAND_ITEMS = [
  { id: 'candidates', title: 'Candidates Directory', category: 'Pages', path: '/candidates', icon: 'users' },
  { id: 'jobs', title: 'Job Openings & Requisitions', category: 'Pages', path: '/jobs', icon: 'jobs' },
  { id: 'pipeline', title: 'Recruitment Pipeline Board', category: 'Pages', path: '/pipeline', icon: 'pipeline' },
  { id: 'reports', title: 'Analytics & Reports', category: 'Pages', path: '/reports', icon: 'reports' },
  { id: 'ai-center', title: 'AI Match & Copilot Center', category: 'Pages', path: '/ai-center', icon: 'sparkles' },
  { id: 'settings', title: 'Workspace & Team Settings', category: 'Pages', path: '/settings', icon: 'admin' },
  { id: 'styleguide', title: 'Component Style Guide', category: 'Design', path: '/style-guide', icon: 'edit' },
]

export default function TopBar({ onOpenSidebar, theme, onToggleTheme, onNavigate, currentPage }) {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const userId = user?.id
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User'

  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const notifRef = useRef(null)

  // Command palette search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [profileModalOpen, setProfileModalOpen] = useState(false)

  const loadNotifications = useCallback(async () => {
    if (!userId) return
    setNotifications(await fetchNotifications(userId))
  }, [userId])

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 60000)
    return () => clearInterval(interval)
  }, [loadNotifications])

  // Global Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      } else if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchOpen])

  useEffect(() => {
    if (!notifOpen) return
    const handleClick = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false) }
    const handleKey = (e) => { if (e.key === 'Escape') setNotifOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [notifOpen])

  const unread = notifications.filter(n => !n.read)
  const { robotInsights, applicantInsights } = useTopBarInsights({ unreadCount: unread.length, userName: displayName })
  const { candidateLines: aiCandidateLines, robotLines: aiRobotLines, bicker: aiBicker } = useAIBotLines()

  const handleMarkAllRead = async () => {
    const ids = unread.map(n => n.id)
    if (ids.length === 0) return
    await markNotificationsRead(ids)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const handleNotificationClick = async (n) => {
    if (n.read) return
    await markNotificationRead(n.id)
    setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)))
  }

  const openNotificationSettings = () => {
    setNotifOpen(false)
    sessionStorage.setItem(SETTINGS_TAB_FLAG, 'notifications')
    onNavigate?.('org_settings')
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const filteredCommands = COMMAND_ITEMS.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleRunCommand = (item) => {
    setSearchOpen(false)
    setSearchQuery('')
    if (item.path) navigate(item.path)
  }

  return (
    <header
      className="h-[72px] shrink-0 flex items-center justify-between gap-3 px-4 sm:px-5 border-b border-border bg-surface/90 backdrop-blur-xl shadow-xs relative z-[var(--z-sticky)]"
      style={searchOpen ? { zIndex: 100000 } : undefined}
    >
      {/* Left section: Mobile menu button + Pixel Robot Playground in left TopBar area */}
      <div className="flex items-center gap-3 min-w-0 shrink-0 h-full relative">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open navigation"
          className="focus-ring lg:hidden w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-text2 hover:bg-surface2"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
            <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>

        {/* Pixel Robot playground inside the left TopBar space */}
        <div className="w-36 sm:w-56 h-full relative flex items-center overflow-visible">
          {currentPage !== 'ai_center' && (
            <PixelRobot
              currentPage={currentPage}
              robotInsights={robotInsights}
              applicantInsights={applicantInsights}
              aiCandidateLines={aiCandidateLines}
              aiRobotLines={aiRobotLines}
              aiBicker={aiBicker}
              onNavigate={onNavigate}
            />
          )}
        </div>
      </div>

      {/* Center Section: Global Search Bar */}
      <div className="flex-1 flex justify-center max-w-xs sm:max-w-sm mx-auto px-2 relative min-w-0 h-full items-center">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="w-full max-w-xs sm:max-w-sm h-9 px-3.5 rounded-full bg-surface2/70 hover:bg-surface2 border border-border/80 text-text3 hover:text-text flex items-center justify-between text-xs transition-all duration-200 shadow-2xs group hover:border-accent/40 hover:shadow-[0_4px_16px_-6px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
        >
          <div className="flex items-center gap-2 min-w-0 font-medium">
            <Icon name="search" size={14} className="text-text3 group-hover:text-accent transition-colors shrink-0" />
            <span className="truncate">Search candidates, jobs...</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-semibold text-text3 bg-surface border border-border/70 rounded-md font-mono shrink-0">
            <span>Ctrl</span><span>K</span>
          </kbd>
        </button>
      </div>

      {/* Right Section: Notifications & User Dropdown */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen(o => !o)}
            aria-label={unread.length > 0 ? `${unread.length} unread notifications` : 'Notifications'}
            aria-expanded={notifOpen}
            className="focus-ring relative w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-text2 hover:bg-surface2 hover:text-text transition-colors duration-[var(--duration-fast)]"
          >
            <Icon name="bell" size={16} />
            {unread.length > 0 && (
              <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red text-white text-[9px] font-extrabold flex items-center justify-center leading-none">
                {unread.length > 9 ? '9+' : unread.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <div
              className="absolute right-0 top-[calc(100%+6px)] w-[min(360px,calc(100vw-2rem))] max-h-[min(70vh,420px)] flex flex-col bg-surface border border-border rounded-[var(--radius-md)] shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,var(--shadow-lg)] overflow-hidden animate-in fade-in zoom-in-95 duration-100"
              style={{ zIndex: 'var(--z-dropdown)' }}
            >
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-border shrink-0">
                <span className="text-sm font-bold text-text">Notifications</span>
                {unread.length > 0 && (
                  <button type="button" onClick={handleMarkAllRead} className="focus-ring rounded-[var(--radius-sm)] text-xs font-semibold text-accent hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="overflow-y-auto flex-1">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-text3">You're all caught up.</div>
                ) : (
                  <div className="flex flex-col divide-y divide-border">
                    {notifications.slice(0, 20).map(n => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => handleNotificationClick(n)}
                        className={cn(
                          'focus-ring w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 hover:bg-surface2 transition-colors duration-[var(--duration-fast)]',
                          !n.read && 'bg-accent/[0.04]'
                        )}
                      >
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-text truncate">{n.title}</div>
                          <div className="text-xs text-text3 mt-0.5 line-clamp-2">{n.message}</div>
                          <div className="text-[10px] text-text3 mt-1">{new Date(n.created_at).toLocaleString()}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-3.5 py-2 border-t border-border shrink-0">
                <button type="button" onClick={openNotificationSettings} className="focus-ring rounded-[var(--radius-sm)] text-xs font-semibold text-accent hover:underline">
                  View all in Settings
                </button>
              </div>
            </div>
          )}
        </div>

        <Menu
          align="end"
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} className="focus-ring flex items-center gap-2 h-8 pl-1 pr-2 rounded-[var(--radius-sm)] hover:bg-surface2 transition-colors duration-[var(--duration-fast)]">
              <Avatar name={displayName} size="xs" />
              <span className="hidden sm:block text-xs font-semibold text-text max-w-[120px] truncate">{displayName}</span>
              <Icon name="chevronDown" size={11} className="hidden sm:block text-text3" />
            </button>
          )}
          items={[
            { label: `${displayName} · ${roleLabel(profile?.role)}`, disabled: true },
            'divider',
            { label: 'View profile', icon: 'users', onClick: () => setProfileModalOpen(true) },
            { label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', icon: theme === 'dark' ? 'sun' : 'moon', onClick: onToggleTheme },
            { label: 'Company settings', icon: 'admin', onClick: () => onNavigate?.('org_settings') },
            'divider',
            { label: 'Sign out', icon: 'logout', danger: true, onClick: handleSignOut },
          ]}
        />
      </div>

      {/* Global Command Search Modal */}
      {searchOpen && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          style={{ zIndex: 100001 }}
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="isolate w-full max-w-xl bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
              <Icon name="search" size={18} className="text-accent shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search candidates, jobs, settings..."
                className="w-full bg-transparent text-sm font-medium text-text outline-none placeholder:text-text3"
              />
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface2 text-text3 border border-border">ESC</span>
            </div>

            {/* Command Results */}
            <div className="p-2 max-h-80 overflow-y-auto">
              {filteredCommands.length === 0 ? (
                <div className="p-6 text-center text-xs text-text3">No results matching "{searchQuery}"</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {filteredCommands.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleRunCommand(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between gap-3 text-xs transition-colors",
                        activeIndex === idx ? "bg-accent/10 text-accent font-semibold" : "text-text hover:bg-surface2"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon name={item.icon} size={15} className="shrink-0 text-text2" />
                        <span className="truncate">{item.title}</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface2 text-text3 border border-border uppercase">
                        {item.category}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ), document.body)}

      {/* User Profile Details Modal */}
      <Modal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title="User Profile"
        subtitle="Your account credentials, assigned role permissions, and workspace details."
        size="md"
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              variant="secondary"
              size="sm"
              leftIcon="admin"
              onClick={() => {
                setProfileModalOpen(false)
                onNavigate?.('org_settings')
              }}
            >
              Company Settings
            </Button>
            <Button size="sm" onClick={() => setProfileModalOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          {/* Header Card with Large Avatar & User Badge */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-surface2 border border-border">
            <Avatar name={displayName} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-text truncate">{displayName}</h3>
                <Badge tone="accent" size="sm">{roleLabel(profile?.role)}</Badge>
              </div>
              <p className="text-xs text-text3 mt-0.5">{user?.email || '—'}</p>
              <p className="text-[11px] text-text2 mt-1 font-mono">{profile?.organizations?.name || 'TalentDesk Workspace'}</p>
            </div>
          </div>

          {/* Account Information Details Grid */}
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg border border-border bg-surface flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text3 uppercase tracking-wider">Full Name</span>
              <span className="font-semibold text-text">{profile?.full_name || displayName}</span>
            </div>

            <div className="p-3 rounded-lg border border-border bg-surface flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text3 uppercase tracking-wider">Email Address</span>
              <span className="font-semibold text-text truncate">{user?.email || '—'}</span>
            </div>

            <div className="p-3 rounded-lg border border-border bg-surface flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text3 uppercase tracking-wider">Assigned Role</span>
              <span className="font-semibold text-text">{roleLabel(profile?.role)}</span>
            </div>

            <div className="p-3 rounded-lg border border-border bg-surface flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text3 uppercase tracking-wider">Workspace Tenant</span>
              <span className="font-semibold text-text truncate">{profile?.organizations?.name || 'TalentDesk'}</span>
            </div>

            <div className="p-3 rounded-lg border border-border bg-surface flex flex-col gap-1 sm:col-span-2">
              <span className="text-[10px] font-bold text-text3 uppercase tracking-wider">Membership Status</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-text">Active Member — Verified Access</span>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </header>
  )
}
