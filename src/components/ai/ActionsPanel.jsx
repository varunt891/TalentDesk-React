import { useState, useRef } from 'react'
import { Button, Input, Textarea, Icon, cn } from '../ui'
import AIResultCard from './AIResultCard'
import { AI_ACTIONS, getAiAction } from '../../lib/ai/prompts'
import { COMPARE_DUAL_MODES, COMPARISON_ACTIONS } from '../../lib/ai/categories'
import { streamAiAction } from '../../lib/ai/aiClient'
import { logUsageEvent } from '../../lib/ai/usage'
import { exportResultToDocx, exportResultToPdf } from '../../lib/ai/exportResult'

// A short, human-readable stand-in for a block of pasted content — its
// first non-empty line, stripped of markdown syntax and truncated. Lets a
// result card say what it's actually about ("Michael Anderson" vs "Senior
// AI/ML Engineer") instead of a bare "Result" label with no context.
function snippet(text, maxLen = 50) {
  const firstLine = (text || '').split('\n').map(l => l.trim()).find(Boolean) || ''
  const clean = firstLine.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').replace(/^[-*]\s*/, '').trim()
  if (!clean) return ''
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 1)}…` : clean
}

/**
 * The shared AI Action Framework UI — pick an action, paste content, run.
 * Used by both the floating Copilot's Actions tab and AI Center's center
 * panel. Pass a `key` from the parent when the initial action/content
 * should reset (e.g. switching AI Center categories) since this component
 * only reads its `initial*` props once, on mount.
 *
 * Dual-input mode (two labeled fields with a "Resume vs Job Description" /
 * "Candidate vs Candidate" toggle, plus a pill row narrowed to comparison-
 * shaped actions) activates automatically whenever the 'compare' action is
 * selected — from any entry point: a category launch, a saved prompt, the
 * Quick Actions shortcut, or clicking the "Compare" pill directly with no
 * category at all. It doesn't depend on the caller passing anything, so it
 * can't go stale for one entry path while working for another.
 *
 * `dualInputModes`/`restrictActionsTo` (optional) let a specific category
 * override the default two modes / default action subset if it ever needs
 * a different shape than the built-in one.
 *
 * Results stream in token-by-token (see streamAiAction) rather than
 * appearing all at once once the whole thing is done. Pass
 * `streamingEnabled={false}` (AI Governance setting) to reveal the answer
 * in one shot once complete instead — same as the Copilot chat's toggle.
 */
export default function ActionsPanel({ orgId, userId, initialActionId = 'summarize', initialContent = '', initialContext = '', placeholder, dualInputModes, restrictActionsTo, streamingEnabled = true, onResult, onSavePrompt, source = 'actions_panel' }) {
  const [actionId, setActionId] = useState(initialActionId)
  const [content, setContent] = useState(initialContent)
  const [contentB, setContentB] = useState('')
  const [context, setContext] = useState(initialContext)
  const [dualModeIndex, setDualModeIndex] = useState(0)
  const [result, setResult] = useState(null)
  const [resultSubject, setResultSubject] = useState(null)
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef(null)
  // Whether the category launched this panel with a pre-filled instruction
  // (see categories.js's actionContext) — styled distinctly so it reads as
  // "AI Center already knows what this workflow needs" rather than an empty
  // generic field that happens to have text sitting in it.
  const [hasAutoContext] = useState(!!initialContext.trim())

  const current = getAiAction(actionId)
  const isComparing = actionId === 'compare'
  const activeDualModes = isComparing ? (dualInputModes?.length ? dualInputModes : COMPARE_DUAL_MODES) : null
  const dualMode = activeDualModes?.[dualModeIndex] || activeDualModes?.[0]
  const actionChoices = restrictActionsTo
    ? AI_ACTIONS.filter(a => restrictActionsTo.includes(a.id))
    : isComparing
      ? AI_ACTIONS.filter(a => COMPARISON_ACTIONS.includes(a.id))
      : AI_ACTIONS
  const hasContent = dualMode ? content.trim() && contentB.trim() : !!content.trim()

  const run = async (isRetry = false) => {
    if (!hasContent) return
    setStreaming(true)
    setStreamingText('')
    setError(null)
    setResult(null)
    setResultSubject(dualMode ? `"${snippet(content)}" vs "${snippet(contentB)}"` : `${current.label} — "${snippet(content)}"`)
    const startedAt = new Date().getTime()
    const combinedContent = dualMode
      ? `${dualMode.fieldA.label}:\n${content.trim()}\n\n${dualMode.fieldB.label}:\n${contentB.trim()}`
      : content
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await streamAiAction({
        action: actionId, content: combinedContent, context, signal: controller.signal,
        onDelta: streamingEnabled ? (_delta, full) => setStreamingText(full) : () => {},
      })
      setResult(res.text)
      logUsageEvent(orgId, userId, { type: 'action', action: actionId, source, success: true, retry: isRetry, provider: res.provider, model: res.model, durationMs: new Date().getTime() - startedAt, preview: res.text.slice(0, 140) })
      onResult?.({ actionId, content: combinedContent, context, text: res.text })
    } catch (err) {
      if (err.name === 'AbortError') {
        setStreamingText(current => {
          if (current) setResult(current)
          return current
        })
      } else {
        const message = err.message || 'Action failed. Please try again.'
        setError(message)
        logUsageEvent(orgId, userId, { type: 'action', action: actionId, source, success: false, retry: isRetry, error: message, durationMs: new Date().getTime() - startedAt })
      }
    } finally {
      setStreaming(false)
      setStreamingText('')
      abortRef.current = null
    }
  }
  const stopStreaming = () => abortRef.current?.abort()

  const copyResult = () => { navigator.clipboard.writeText(result || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const exportWord = () => exportResultToDocx(result, current.label)
  const exportPdf = () => exportResultToPdf(result, current.label)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {actionChoices.map(a => (
          <button
            key={a.id}
            type="button"
            onClick={() => setActionId(a.id)}
            className={cn(
              'inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold border transition-all duration-[var(--duration-fast)]',
              actionId === a.id
                ? 'text-white border-transparent shadow-sm'
                : 'bg-surface2 text-text2 border-border hover:text-text hover:border-border-strong'
            )}
            style={actionId === a.id ? { background: 'linear-gradient(135deg, var(--accent), var(--ai))' } : undefined}
          >
            <Icon name={a.icon} size={10} /> {a.label}
          </button>
        ))}
      </div>
      {dualMode ? (
        <div className="flex flex-col gap-3">
          {activeDualModes.length > 1 && (
            <div className="inline-flex items-center gap-1 bg-surface2 rounded-full p-1 border border-border w-fit">
              {activeDualModes.map((m, idx) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setDualModeIndex(idx)}
                  className={cn(
                    'px-3 h-7 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors duration-[var(--duration-fast)]',
                    dualMode.id === m.id ? 'bg-ai text-white' : 'text-text3 hover:text-text2'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-text3 uppercase tracking-wide">{dualMode.fieldA.label}</span>
              <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder={dualMode.fieldA.placeholder} rows={8} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-text3 uppercase tracking-wide">{dualMode.fieldB.label}</span>
              <Textarea value={contentB} onChange={e => setContentB(e.target.value)} placeholder={dualMode.fieldB.placeholder} rows={8} />
            </div>
          </div>
        </div>
      ) : (
        <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder={placeholder || current.placeholder} rows={6} />
      )}
      <Input
        leftIcon={hasAutoContext ? 'sparkles' : undefined}
        value={context}
        onChange={e => setContext(e.target.value)}
        placeholder="Optional instructions (e.g. target language, comparison focus)..."
        className={hasAutoContext ? 'bg-ai-soft border-ai/25 text-text focus:border-ai focus:ring-ai/15' : undefined}
      />
      <div className="flex items-center gap-2">
        {streaming ? (
          <Button variant="danger" leftIcon="square" onClick={stopStreaming}>Stop</Button>
        ) : (
          <Button variant="primary" leftIcon={current.icon} disabled={!hasContent} onClick={() => run(false)}>
            Run {current.label}
          </Button>
        )}
        {onSavePrompt && (
          <Button variant="secondary" leftIcon="pin" disabled={!hasContent || streaming} onClick={() => onSavePrompt({ actionId, content, context })}>
            Save Prompt
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red">{error}</p>}
      <AIResultCard streaming={streaming} streamingText={streamingText} result={result} subject={resultSubject} copied={copied} onCopy={copyResult} onExportWord={exportWord} onExportPdf={exportPdf} />
    </div>
  )
}
