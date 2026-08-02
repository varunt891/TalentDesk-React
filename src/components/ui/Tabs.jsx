import { useRef, useState, useEffect, useCallback } from 'react'
import { Icon } from './icons'
import { cn } from './utils'

export default function Tabs({ items, value, onChange, className = '' }) {
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanScrollLeft(scrollLeft > 3)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 3)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    checkScroll()

    // 1. Convert vertical mouse wheel deltaY into horizontal scrollLeft
    const handleWheel = (e) => {
      if (el.scrollWidth > el.clientWidth) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault()
          el.scrollLeft += e.deltaY * 0.95
          checkScroll()
        }
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    el.addEventListener('scroll', checkScroll, { passive: true })
    window.addEventListener('resize', checkScroll)

    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [checkScroll, items])

  // Scroll active tab into view when selection changes
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const activeBtn = el.querySelector('[aria-selected="true"]')
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      setTimeout(checkScroll, 300)
    }
  }, [value, checkScroll])

  const scrollByAmount = (amount) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: amount, behavior: 'smooth' })
    setTimeout(checkScroll, 300)
  }

  return (
    <div className={cn('relative border-b border-border group/tabs', className)}>
      {/* Left Fade Gradient & Arrow Button */}
      {canScrollLeft && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-surface via-surface/80 to-transparent z-10" />
          <button
            type="button"
            onClick={() => scrollByAmount(-180)}
            aria-label="Scroll tabs left"
            className="absolute left-0.5 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-surface2/95 border border-border shadow-xs flex items-center justify-center text-text2 hover:text-text hover:bg-surface3 transition-all duration-150 active:scale-95"
            title="Scroll left"
          >
            <Icon name="chevronLeft" size={12} />
          </button>
        </>
      )}

      {/* Right Fade Gradient & Arrow Button */}
      {canScrollRight && (
        <>
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-surface via-surface/80 to-transparent z-10" />
          <button
            type="button"
            onClick={() => scrollByAmount(180)}
            aria-label="Scroll tabs right"
            className="absolute right-0.5 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-surface2/95 border border-border shadow-xs flex items-center justify-center text-text2 hover:text-text hover:bg-surface3 transition-all duration-150 active:scale-95"
            title="Scroll right"
          >
            <Icon name="chevronRight" size={12} />
          </button>
        </>
      )}

      <div
        ref={scrollRef}
        className="flex items-center gap-0.5 overflow-x-auto scroll-smooth"
        role="tablist"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map(item => {
          const active = item.id === value
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.id)}
              className={cn(
                'focus-ring relative flex items-center gap-1.5 px-3.5 h-10 text-[13px] font-semibold whitespace-nowrap rounded-t-[var(--radius-sm)] transition-colors duration-[var(--duration-fast)] shrink-0',
                active ? 'text-text' : 'text-text3 hover:text-text2 hover:bg-surface2/60'
              )}
            >
              {item.label}
              {typeof item.count === 'number' && (
                <span className={cn('text-[10px] font-extrabold rounded-full px-1.5 leading-4 tabular-nums', active ? 'bg-accent/15 text-accent' : 'bg-surface3 text-text3')}>
                  {item.count}
                </span>
              )}
              {active && <span className="absolute left-2.5 right-2.5 -bottom-px h-0.5 bg-accent rounded-full shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_70%,transparent)]" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
