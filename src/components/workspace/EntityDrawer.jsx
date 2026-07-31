import { Drawer } from '../ui/Modal'
import Avatar from '../ui/Avatar'
import Tabs from '../ui/Tabs'
import { Icon } from '../ui/icons'
import { cn } from '../ui/utils'

/**
 * The shared shape for "side drawer instead of a separate page/full-screen
 * modal": avatar + title + status header, an optional tab strip, a
 * scrollable body, and a sticky action footer. Candidate/Job/Task/Callback/
 * Followup preview drawers compose their own content into this instead of
 * each hand-building an overlay (as several pages do today).
 */
export default function EntityDrawer({
  open,
  onClose,
  avatarName,
  title,
  subtitle,
  status,
  eyebrow,
  tabs,
  activeTab,
  onTabChange,
  actions,
  size = 'md',
  children,
}) {
  return (
    <Drawer open={open} onClose={onClose} size={size} hideHeader>
      <div className="flex flex-col h-full">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {avatarName && <Avatar name={avatarName} size="lg" />}
            <div className="min-w-0">
              {eyebrow && <div className="text-[10px] font-bold text-accent uppercase tracking-wide mb-0.5">{eyebrow}</div>}
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-text truncate">{title}</h2>
                {status}
              </div>
              {subtitle && <p className="text-xs text-text3 mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-text3 hover:bg-surface2 hover:text-text">
            <Icon name="x" size={14} />
          </button>
        </div>

        {tabs && (
          <div className="px-5 pt-2 shrink-0">
            <Tabs items={tabs} value={activeTab} onChange={onTabChange} />
          </div>
        )}

        <div className={cn('flex-1 overflow-y-auto min-w-0 px-5 py-4', !tabs && 'pt-4')}>
          {children}
        </div>

        {actions && (
          <div className="px-5 py-3.5 border-t border-border flex items-center justify-end gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </Drawer>
  )
}
