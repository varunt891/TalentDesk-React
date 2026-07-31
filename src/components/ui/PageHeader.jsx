import { cn } from './utils'

/**
 * One header shape for every page: eyebrow badge, title, subtitle, and
 * optional search/filters/actions slots. Replaces the 3+ bespoke header
 * layouts that existed per-page before the design system.
 */
export default function PageHeader({ eyebrow, title, subtitle, search, filters, actions, className = '' }) {
  return (
    <div className={cn('flex flex-col gap-5 pb-6 border-b border-border', className)}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-accent bg-accent/10 rounded-full px-2.5 py-1 mb-2.5">
              {eyebrow}
            </span>
          )}
          <h1 className="text-[26px] font-extrabold text-text leading-[1.15] tracking-[-0.02em] truncate">{title}</h1>
          {subtitle && <p className="text-[13px] text-text3 mt-1.5 leading-relaxed max-w-2xl">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
      </div>
      {(search || filters) && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          {search && <div className="w-full sm:max-w-sm">{search}</div>}
          {filters && <div className="flex items-center gap-2 flex-wrap flex-1">{filters}</div>}
        </div>
      )}
    </div>
  )
}
