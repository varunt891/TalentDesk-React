import { useState } from 'react'
import { Button, Card, Icon } from '../ui'
import MarkdownView from '../MarkdownView'
import { runAiAction } from '../../lib/ai/aiClient'
import { logUsageEvent } from '../../lib/ai/usage'

/**
 * The single building block for contextual AI integration across
 * Candidates/Jobs/Pipeline/Tasks/Communication (Phase 5.3). Generates
 * on-demand (never auto-fires on every render) using the shared Action
 * Framework — content always comes from real record data the caller
 * assembles, never pasted by the user and never fabricated by this
 * component. One implementation, reused everywhere instead of bespoke AI
 * UI per page. `source` tags the originating workspace for AI Center's
 * adoption-by-workspace analytics (Phase 5.4).
 */
export default function AIInsightCard({ orgId, userId, title, icon = 'sparkles', actionId, content, context, emptyHint, cta = 'Generate', source = 'unknown' }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  const canRun = Boolean((content || '').trim())

  const run = async (isRetry = false) => {
    if (!canRun) return
    setLoading(true)
    setError(null)
    const startedAt = new Date().getTime()
    try {
      const res = await runAiAction({ action: actionId, content, context })
      if (res.success === false) throw new Error(res.error || 'AI request failed.')
      setResult(res.text)
      logUsageEvent(orgId, userId, { type: 'action', action: actionId, source, success: true, retry: isRetry, provider: res.provider, model: res.model, durationMs: new Date().getTime() - startedAt, preview: res.text.slice(0, 140) })
    } catch (err) {
      const message = err.message || 'AI request failed. Please try again.'
      setError(message)
      logUsageEvent(orgId, userId, { type: 'action', action: actionId, source, success: false, retry: isRetry, error: message, durationMs: new Date().getTime() - startedAt })
    } finally {
      setLoading(false)
    }
  }

  const copy = () => { navigator.clipboard.writeText(result || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  return (
    <Card className="bg-surface2">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="flex items-center gap-1.5 text-xs font-bold text-accent uppercase tracking-wide">
          <Icon name={icon} size={12} /> {title}
        </span>
        {result && (
          <button type="button" onClick={copy} className="text-[10px] font-semibold text-text3 hover:text-text flex items-center gap-1">
            <Icon name={copied ? 'check' : 'copy'} size={10} /> {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>

      {!result && !loading && (
        canRun ? (
          <Button size="sm" variant="secondary" leftIcon="sparkles" onClick={() => run(false)}>{cta}</Button>
        ) : (
          <p className="text-xs text-text3">{emptyHint || 'Not enough data to generate this yet.'}</p>
        )
      )}
      {loading && (
        <div className="flex items-center gap-1 py-1.5">
          {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-text3 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </div>
      )}
      {error && (
        <p className="text-xs text-red mt-1">{error} <button type="button" onClick={() => run(true)} className="underline font-semibold">Retry</button></p>
      )}
      {result && (
        <>
          <MarkdownView content={result} />
          <button type="button" onClick={() => run(true)} className="text-[10px] font-semibold text-text3 hover:text-text flex items-center gap-1 mt-2">
            <Icon name="refresh" size={10} /> Regenerate
          </button>
        </>
      )}
    </Card>
  )
}
