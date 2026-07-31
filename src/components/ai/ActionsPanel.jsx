import { useState } from 'react'
import { Button, Input, Textarea, Icon, cn } from '../ui'
import MarkdownView from '../MarkdownView'
import { AI_ACTIONS, getAiAction } from '../../lib/ai/prompts'
import { runAiAction } from '../../lib/ai/aiClient'
import { logUsageEvent } from '../../lib/ai/usage'

/**
 * The shared AI Action Framework UI — pick an action, paste content, run.
 * Used by both the floating Copilot's Actions tab and AI Center's center
 * panel. Pass a `key` from the parent when the initial action/content
 * should reset (e.g. switching AI Center categories) since this component
 * only reads its `initial*` props once, on mount.
 */
export default function ActionsPanel({ orgId, userId, initialActionId = 'summarize', initialContent = '', initialContext = '', placeholder, onResult, onSavePrompt, source = 'actions_panel' }) {
  const [actionId, setActionId] = useState(initialActionId)
  const [content, setContent] = useState(initialContent)
  const [context, setContext] = useState(initialContext)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  const current = getAiAction(actionId)

  const run = async (isRetry = false) => {
    if (!content.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    const startedAt = new Date().getTime()
    try {
      const res = await runAiAction({ action: actionId, content, context })
      if (res.success === false) throw new Error(res.error || 'Action failed.')
      setResult(res.text)
      logUsageEvent(orgId, userId, { type: 'action', action: actionId, source, success: true, retry: isRetry, provider: res.provider, model: res.model, durationMs: new Date().getTime() - startedAt, preview: res.text.slice(0, 140) })
      onResult?.({ actionId, content, context, text: res.text })
    } catch (err) {
      const message = err.message || 'Action failed. Please try again.'
      setError(message)
      logUsageEvent(orgId, userId, { type: 'action', action: actionId, source, success: false, retry: isRetry, error: message, durationMs: new Date().getTime() - startedAt })
    } finally {
      setLoading(false)
    }
  }

  const copyResult = () => { navigator.clipboard.writeText(result || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {AI_ACTIONS.map(a => (
          <button
            key={a.id}
            type="button"
            onClick={() => setActionId(a.id)}
            className={cn('inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold border transition-colors duration-[var(--duration-fast)]', actionId === a.id ? 'bg-accent text-white border-accent' : 'bg-surface2 text-text2 border-border hover:text-text')}
          >
            <Icon name={a.icon} size={10} /> {a.label}
          </button>
        ))}
      </div>
      <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder={placeholder || current.placeholder} rows={6} />
      <Input value={context} onChange={e => setContext(e.target.value)} placeholder="Optional instructions (e.g. target language, comparison focus)..." />
      <div className="flex items-center gap-2">
        <Button variant="primary" leftIcon={current.icon} loading={loading} disabled={!content.trim()} onClick={() => run(false)}>
          Run {current.label}
        </Button>
        {onSavePrompt && (
          <Button variant="secondary" leftIcon="pin" disabled={!content.trim()} onClick={() => onSavePrompt({ actionId, content, context })}>
            Save Prompt
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red">{error}</p>}
      {result && (
        <div className="rounded-[var(--radius-md)] border border-border bg-surface2 p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-accent uppercase tracking-wide">Result</span>
            <button type="button" onClick={copyResult} className="text-[10px] font-semibold text-text3 hover:text-text flex items-center gap-1">
              <Icon name={copied ? 'check' : 'copy'} size={10} /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <MarkdownView content={result} />
        </div>
      )}
    </div>
  )
}
