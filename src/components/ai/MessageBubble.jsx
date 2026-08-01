import { useState } from 'react'
import { Icon, cn } from '../ui'
import MarkdownView from '../MarkdownView'

// Shared chat turn used by both the floating Copilot widget and the AI
// Center chat panel. Assistant turns render as calm, unboxed prose next to
// a glowing avatar (Claude's restrained assistant aesthetic) rather than a
// bordered chat-widget bubble on both sides — only the user's own messages
// get a bubble, which is what actually needs visual separation from the
// page background.
export default function MessageBubble({ message, onRegenerate, thinking, streaming }) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(message.content || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[var(--radius-lg)] rounded-br-[var(--radius-sm)] bg-accent text-white shadow-sm px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap">{message.content}</div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2.5 group">
      <span className="relative shrink-0 mt-0.5">
        {streaming && (
          <span className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ background: 'linear-gradient(135deg, var(--accent), var(--ai))' }} />
        )}
        <span
          className="relative w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--ai))', boxShadow: '0 0 0 3px var(--ai-soft)' }}
        >
          <Icon name="sparkles" size={12} className="text-white" />
        </span>
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        {thinking ? (
          <div className="flex items-center gap-1.5 py-1.5">
            {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-ai animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </div>
        ) : (
          <>
            <MarkdownView content={message.content} />
            {streaming && <span className="inline-block w-1.5 h-3.5 bg-ai align-middle animate-pulse ml-0.5" />}
          </>
        )}
        {!thinking && !streaming && (
          <div className={cn('flex items-center gap-3 mt-1 transition-opacity duration-[var(--duration-fast)]', 'opacity-0 group-hover:opacity-100')}>
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
