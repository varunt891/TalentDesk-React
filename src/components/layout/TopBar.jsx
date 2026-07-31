import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Icon } from '../ui/icons'
import Avatar from '../ui/Avatar'
import Menu from '../ui/Menu'
import { cn } from '../ui/utils'
import { fetchNotifications, markNotificationRead, markNotificationsRead } from '../../lib/admin/notifications'
import { SETTINGS_TAB_FLAG } from '../../lib/admin/settingsNav'

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

export default function TopBar({ onOpenSidebar, theme, onToggleTheme, onNavigate }) {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const userId = user?.id

  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const notifRef = useRef(null)

  const loadNotifications = useCallback(async () => {
    if (!userId) return
    setNotifications(await fetchNotifications(userId))
  }, [userId])

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 60000)
    return () => clearInterval(interval)
  }, [loadNotifications])

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

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User'

  return (
    <header className="h-14 shrink-0 flex items-center justify-between gap-3 px-4 sm:px-5 border-b border-border bg-surface/90 backdrop-blur-xl shadow-xs relative z-[var(--z-sticky)]">
      <div className="flex items-center gap-2 min-w-0">
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
      </div>

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
              className="absolute right-0 top-[calc(100%+6px)] w-[min(360px,calc(100vw-2rem))] max-h-[min(70vh,420px)] flex flex-col bg-surface border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] overflow-hidden"
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
            { label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', icon: theme === 'dark' ? 'sun' : 'moon', onClick: onToggleTheme },
            { label: 'Company settings', icon: 'admin', onClick: () => onNavigate?.('org_settings') },
            'divider',
            { label: 'Sign out', icon: 'logout', danger: true, onClick: handleSignOut },
          ]}
        />
      </div>
    </header>
  )
}
