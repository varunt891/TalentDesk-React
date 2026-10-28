import { useState } from 'react'
import { Card, Button, Icon } from '../ui'
import MarkdownView from '../MarkdownView'
import { AUTOMATIONS } from '../../lib/ai/automations'
import { runAiAction } from '../../lib/ai/aiClient'
import { fetchWorkspaceSnapshot } from '../../lib/ai/workspaceSnapshot'
import { logUsageEvent } from '../../lib/ai/usage'

/**
 * Part 2 — AI Automation. Each automation is a reusable, data-driven
 * definition (src/lib/ai/automations.js); running one here just calls the
 * same runAiAction the rest of the platform uses, with content built from
 * the real workspace snapshot. No backend scheduler — "Run Now" only —
 * but the definitions are already shaped for future scheduling.
 */
export default function AutomationsPanel({ orgId, userId, disabled = false, onResult }) {
  const [runningId, setRunningId] = useState(null)
  const [results, setResults] = useState({})

  const run = async (automation) => {
    if (disabled || runningId) return
    setRunningId(automation.id)
    setResults(prev => ({ ...prev, [automation.id]: null }))
    const startedAt = new Date().getTime()
    try {
      const snapshot = await fetchWorkspaceSnapshot()
      const { content, context } = automation.buildContent(snapshot)
      const res = await runAiAction({ action: automation.actionId, content, context })
      if (res.success === false) throw new Error(res.error || 'Automation failed.')
      setResults(prev => ({ ...prev, [automation.id]: { text: res.text } }))
      logUsageEvent(orgId, userId, { type: 'automation', action: automation.actionId, source: 'automations', success: true, provider: res.provider, model: res.model, durationMs: new Date().getTime() - startedAt, preview: res.text.slice(0, 140) })
    } catch (err) {
      const message = err.message || 'Automation failed. Please try again.'
      setResults(prev => ({ ...prev, [automation.id]: { error: message } }))
      logUsageEvent(orgId, userId, { type: 'automation', action: automation.actionId, source: 'automations', success: false, error: message, durationMs: new Date().getTime() - startedAt })
    } finally {
      setRunningId(null)
      onResult?.()
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text3 max-w-2xl">One-click recruiting briefings built from your accessible workspace records. Run a briefing when you need it.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {AUTOMATIONS.map(automation => {
          const result = results[automation.id]
          const isRunning = runningId === automation.id
          return (
            <Card key={automation.id} className="flex flex-col gap-2.5">
              <div className="flex items-start gap-2.5">
                <span className="w-8 h-8 rounded-[var(--radius-sm)] bg-accent/10 text-accent flex items-center justify-center shrink-0">
                  <Icon name={automation.icon} size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-text">{automation.label}</div>
                  <div className="text-xs text-text3 mt-0.5">{automation.description}</div>
                </div>
              </div>
              <Button size="sm" variant="secondary" leftIcon="send" loading={isRunning} disabled={disabled || Boolean(runningId)} onClick={() => run(automation)}>Run briefing</Button>
              {result?.error && <p className="text-xs text-red">{result.error}</p>}
              {result?.text && (
                <div className="rounded-[var(--radius-md)] bg-surface2 border border-border p-3 max-h-64 overflow-y-auto">
                  <MarkdownView content={result.text} />
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
