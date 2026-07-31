import { cn } from '../ui/utils'

/**
 * A single settings row: label + description on the left, a control
 * (toggle/select/input) on the right, with optional full-width content
 * below (e.g. a textarea). The one repeated shape across every
 * Administration/Settings tab — reused instead of each tab hand-rolling
 * its own label/control layout.
 */
export default function SettingsCard({ title, description, control, children, className = '' }) {
  return (
    <div className={cn('py-4 border-b border-border last:border-0', className)}>
      <div className="flex items-center justify-between gap-5 flex-wrap">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-text tracking-tight">{title}</div>
          {description && <div className="text-xs text-text3 mt-1 leading-relaxed">{description}</div>}
        </div>
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}
