import { forwardRef } from 'react'
import { cn } from '../ui/utils'

/**
 * Shared outer container every page's root now renders into, so max-width,
 * gutters and vertical rhythm live in one place instead of ~10 divergent
 * per-page CSS classes.
 *
 * "scroll": a normal page — the shell's <main> scrolls it vertically; the
 * container owns horizontal gutter + vertical rhythm.
 * "flush": the page owns its own sticky toolbar + independently-scrolling
 * body (a Kanban board, a dense table) that already manages its own
 * internal padding — the container only caps max-width and fills height,
 * with zero padding of its own, so gutters aren't applied twice.
 */
export const PageContainer = forwardRef(function PageContainer(
  { variant = 'scroll', className = '', style, children, ...rest },
  ref
) {
  const isFlush = variant === 'flush'
  return (
    <div
      ref={ref}
      className={cn(
        'w-full mx-auto',
        isFlush ? 'h-full min-h-0 flex flex-col overflow-hidden' : 'px-4 sm:px-6 lg:px-8 py-6',
        className
      )}
      style={{ maxWidth: 'var(--container-max)', ...style }}
      {...rest}
    >
      {children}
    </div>
  )
})

export function PageContent({ className = '', children }) {
  return <div className={cn('flex flex-col gap-6', className)}>{children}</div>
}

export function PageActions({ className = '', children }) {
  return <div className={cn('flex items-center gap-2', className)}>{children}</div>
}
