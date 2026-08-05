import { useRef, useState } from 'react'
import { Textarea } from './Input'
import Button from './Button'
import MarkdownView from '../MarkdownView'
import { cn } from './utils'

// Drop-in replacement for <Textarea> — same value/onChange/rows/className
// contract — that adds a markdown formatting toolbar (operating on the real
// textarea selection) plus a Preview toggle rendered through the shared
// MarkdownView renderer. Deliberately not a WYSIWYG editor: keeps storing
// plain markdown text so AI generate/extract-skills code that reads these
// fields as plain text keeps working unchanged.
export default function MarkdownEditor({ value = '', onChange, rows = 4, className = '', placeholder, ...rest }) {
  const [preview, setPreview] = useState(false)
  const textareaRef = useRef(null)

  const emit = (newValue, cursorPos) => {
    onChange({ target: { value: newValue } })
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(cursorPos, cursorPos)
    })
  }

  const wrapSelection = (before, after, placeholderText) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end) || placeholderText
    const newValue = value.slice(0, start) + before + selected + after + value.slice(end)
    emit(newValue, start + before.length + selected.length + after.length)
  }

  const prefixLine = (prefix) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const newValue = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    emit(newValue, start + prefix.length)
  }

  const insertLink = () => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const label = value.slice(start, end) || 'link text'
    const template = `[${label}](https://)`
    const newValue = value.slice(0, start) + template + value.slice(end)
    // Land the cursor right where the URL placeholder is, ready to type over it.
    emit(newValue, start + template.length - 1)
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-0.5 mb-1.5">
        <Button type="button" size="sm" variant="ghost" iconOnly leftIcon="bold" title="Bold" disabled={preview} onClick={() => wrapSelection('**', '**', 'bold text')} />
        <Button type="button" size="sm" variant="ghost" iconOnly leftIcon="heading" title="Heading" disabled={preview} onClick={() => prefixLine('## ')} />
        <Button type="button" size="sm" variant="ghost" iconOnly leftIcon="listBullets" title="Bullet list" disabled={preview} onClick={() => prefixLine('- ')} />
        <Button type="button" size="sm" variant="ghost" iconOnly leftIcon="listNumbered" title="Numbered list" disabled={preview} onClick={() => prefixLine('1. ')} />
        <Button type="button" size="sm" variant="ghost" iconOnly leftIcon="link" title="Link" disabled={preview} onClick={insertLink} />
        <div className="flex-1" />
        <Button type="button" size="sm" variant={preview ? 'secondary' : 'ghost'} onClick={() => setPreview(p => !p)}>
          {preview ? 'Edit' : 'Preview'}
        </Button>
      </div>
      {preview ? (
        <div
          className={cn('border border-border rounded-[var(--radius-sm)] bg-surface2 px-3 py-2.5 overflow-y-auto')}
          style={{ minHeight: `${rows * 1.7}em` }}
        >
          {value?.trim() ? <MarkdownView content={value} /> : <span className="text-text3 text-sm">Nothing to preview yet.</span>}
        </div>
      ) : (
        <Textarea ref={textareaRef} value={value} onChange={onChange} rows={rows} placeholder={placeholder} {...rest} />
      )}
    </div>
  )
}
