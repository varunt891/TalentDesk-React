import { forwardRef } from 'react'
import { Icon } from './icons'
import { cn } from './utils'

const VARIANTS = {
  primary: 'bg-accent text-white shadow-sm hover:brightness-110 hover:shadow-md active:brightness-95 active:scale-[0.98]',
  secondary: 'bg-surface2 text-text border border-border shadow-xs hover:bg-surface3 hover:border-border-strong active:scale-[0.98]',
  ghost: 'bg-transparent text-text2 hover:bg-surface2 hover:text-text active:scale-[0.98]',
  danger: 'bg-red text-white shadow-sm hover:brightness-110 hover:shadow-md active:brightness-95 active:scale-[0.98]',
  ai: 'bg-ai text-white shadow-sm hover:brightness-110 hover:shadow-md active:brightness-95 active:scale-[0.98]',
  outline: 'bg-transparent text-text border border-border hover:border-accent hover:text-accent active:scale-[0.98]',
}

const SIZES = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-[var(--radius-sm)]',
  lg: 'h-11 px-5 text-md gap-2 rounded-[var(--radius-md)]',
}

const ICON_ONLY_SIZES = {
  sm: 'h-8 w-8 rounded-[var(--radius-sm)]',
  md: 'h-9 w-9 rounded-[var(--radius-sm)]',
  lg: 'h-11 w-11 rounded-[var(--radius-md)]',
}

const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    iconOnly = false,
    loading = false,
    disabled = false,
    leftIcon,
    rightIcon,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center font-semibold whitespace-nowrap select-none',
        'transition-[filter,background-color,border-color,color,box-shadow,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant] || VARIANTS.primary,
        iconOnly ? ICON_ONLY_SIZES[size] || ICON_ONLY_SIZES.md : SIZES[size] || SIZES.md,
        className
      )}
      {...rest}
    >
      {loading ? (
        <Icon name="loader" size={size === 'sm' ? 13 : 14} className="animate-spin" />
      ) : leftIcon ? (
        <Icon name={leftIcon} size={size === 'sm' ? 13 : 14} />
      ) : null}
      {!iconOnly && children}
      {iconOnly && !loading && !leftIcon && children}
      {!loading && rightIcon && <Icon name={rightIcon} size={size === 'sm' ? 13 : 14} />}
    </button>
  )
})

export default Button
