import { useState } from 'react'
import { Icon } from '../ui'
import MarkdownView from '../MarkdownView'

// Shared chat bubble used by both the floating Copilot widget and the AI
// Center chat panel — one rendering implementation for user/assistant
// turns, thinking state, streaming cursor, copy, and regenerate.
export default function MessageBubble({ message, onRegenerate, thinking, streaming }) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(message.content || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[var(--radius-md)] bg-accent text-white shadow-sm px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap">{message.content}</div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2.5 group">
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: 'linear-gradient(135deg, var(--accent), var(--ai))', boxShadow: '0 0 0 3px color-mix(in srgb, var(--ai) 10%, transparent)' }}
      >
        <Icon name="sparkles" size={12} className="text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="rounded-[var(--radius-md)] bg-surface2 border border-border shadow-xs px-3.5 py-3">
          {thinking ? (
            <div className="flex items-center gap-1 py-1">
              {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-text3 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          ) : (
            <>
              <MarkdownView content={message.content} />
              {streaming && <span className="inline-block w-1.5 h-3.5 bg-accent align-middle animate-pulse ml-0.5" />}
            </>
          )}
        </div>
        {!thinking && !streaming && (
          <div className="flex items-center gap-3 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--duration-fast)]">
            <button type="button" onClick={copy} className="text-[10px] font-semibold text-text3 hover:text-text flex items-center gap-1">
              <Icon name={copied ? 'check' : 'copy'} size={10} /> {copied ? 'Copied' : 'Copy'}
            </button>
            {onRegenerate && (
              <button type="button" onClick={onRegenerate} className="text-[10px] font-semibold text-text3 hover:text-text flex items-center gap-1">
                <Icon name="refresh" size={10} /> Regenerate
              </button>
            )}
            {message.stopped && <span className="text-[10px] text-text3">(stopped)</span>}
          </div>
        )}
      </div>
    </div>
  )
}
