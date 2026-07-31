import { forwardRef } from 'react'
import { Icon } from './icons'
import { cn } from './utils'

const fieldBase =
  'w-full bg-surface2 border rounded-[var(--radius-sm)] text-text placeholder:text-text3 ' +
  'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] ' +
  'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

export const Label = ({ className = '', required, children, ...rest }) => (
  <label className={cn('text-xs font-semibold text-text2 tracking-wide', className)} {...rest}>
    {children}
    {required && <span className="text-red ml-0.5">*</span>}
  </label>
)

export const FormField = ({ label, htmlFor, required, hint, error, className = '', children }) => (
  <div className={cn('flex flex-col gap-1.5', className)}>
    {label && (
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
    )}
    {children}
    {error ? (
      <span className="text-xs text-red flex items-center gap-1">
        <Icon name="alertCircle" size={12} />
        {error}
      </span>
    ) : hint ? (
      <span className="text-xs text-text3">{hint}</span>
    ) : null}
  </div>
)

export const Input = forwardRef(function Input(
  { className = '', error, leftIcon, rightIcon, size = 'md', ...rest },
  ref
) {
  const sizeCls = size === 'sm' ? 'h-8 text-xs px-2.5' : 'h-9 text-sm px-3'
  return (
    <div className="relative w-full">
      {leftIcon && (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text3">
          <Icon name={leftIcon} size={14} />
        </span>
      )}
      <input
        ref={ref}
        className={cn(
          fieldBase,
          sizeCls,
          leftIcon && 'pl-8',
          rightIcon && 'pr-8',
          error ? 'border-red focus:border-red focus:ring-red/15' : 'border-border',
          className
        )}
        {...rest}
      />
      {rightIcon && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text3">
          <Icon name={rightIcon} size={14} />
        </span>
      )}
    </div>
  )
})

export const Textarea = forwardRef(function Textarea({ className = '', error, rows = 4, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        fieldBase,
        'text-sm px-3 py-2.5 resize-y leading-relaxed',
        error ? 'border-red focus:border-red focus:ring-red/15' : 'border-border',
        className
      )}
      {...rest}
    />
  )
})

export const Checkbox = forwardRef(function Checkbox({ label, className = '', id, ...rest }, ref) {
  return (
    <label htmlFor={id} className={cn('inline-flex items-center gap-2 cursor-pointer select-none', className)}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="w-4 h-4 rounded accent-accent cursor-pointer"
        {...rest}
      />
      {label && <span className="text-sm text-text">{label}</span>}
    </label>
  )
})

export const Switch = forwardRef(function Switch({ checked, onChange, disabled, label, className = '' }, ref) {
  return (
    <label className={cn('inline-flex items-center gap-2.5 cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed', className)}>
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 p-0 cursor-pointer rounded-full transition-colors duration-[var(--duration-fast)] ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
          checked ? 'bg-accent border border-transparent' : 'bg-surface3 border border-border'
        )}
      >
        <span
          className={cn(
            'pointer-events-none absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform duration-[var(--duration-fast)] ease-in-out',
            checked ? 'translate-x-4' : 'translate-x-0'
          )}
        />
      </button>
      {label && <span className="text-sm font-medium text-text">{label}</span>}
    </label>
  )
})
