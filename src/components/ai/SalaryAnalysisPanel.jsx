import { useState, useRef } from 'react'
import { Button, Input } from '../ui'
import AIResultCard from './AIResultCard'
import { streamAiGenerate } from '../../lib/ai/aiClient'
import { logUsageEvent } from '../../lib/ai/usage'
import { exportResultToDocx, exportResultToPdf } from '../../lib/ai/exportResult'

/**
 * Market Salary & Demand — a purpose-built form (role / location / years of
 * experience) instead of the generic Action Framework's single paste box,
 * since salary benchmarking is a parameterized lookup, not a "paste content
 * to transform" task. Calls the 'salary' tool config directly via
 * /ai/generate/stream (see promptService.js), which returns yearly + hourly
 * ranges per experience band plus a job market demand outlook, streamed in
 * token-by-token rather than appearing all at once when it's fully done.
 */
export default function SalaryAnalysisPanel({ orgId, userId, source = 'ai_center', streamingEnabled = true }) {
  const [role, setRole] = useState('')
  const [location, setLocation] = useState('')
  const [experience, setExperience] = useState('')
  const [result, setResult] = useState(null)
  const [resultSubject, setResultSubject] = useState(null)
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef(null)

  const canRun = role.trim() && location.trim()

  const run = async () => {
    if (!canRun) return
    setStreaming(true)
    setStreamingText('')
    setError(null)
    setResult(null)
    setResultSubject(`${role.trim()} — ${location.trim()}${experience.trim() ? ` — ${experience.trim()} yrs` : ''}`)
    const startedAt = new Date().getTime()
    const prompt = `Role: ${role.trim()}\nLocation: ${location.trim()}\nYears of Experience: ${experience.trim() || 'across all levels'}\n\nProvide salary benchmarks and job market demand for this role.`
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await streamAiGenerate({
        prompt, toolId: 'salary', signal: controller.signal,
        onDelta: streamingEnabled ? (_delta, full) => setStreamingText(full) : () => {},
      })
      setResult(res.text)
      logUsageEvent(orgId, userId, { type: 'action', action: 'salary', source, success: true, provider: res.provider, model: res.model, durationMs: new Date().getTime() - startedAt, preview: res.text.slice(0, 140) })
    } catch (err) {
      if (err.name === 'AbortError') {
        setStreamingText(current => {
          if (current) setResult(current)
          return current
        })
      } else {
        const message = err.message || 'Salary analysis failed. Please try again.'
        setError(message)
        logUsageEvent(orgId, userId, { type: 'action', action: 'salary', source, success: false, error: message, durationMs: new Date().getTime() - startedAt })
      }
    } finally {
      setStreaming(false)
      setStreamingText('')
      abortRef.current = null
    }
  }
  const stopStreaming = () => abortRef.current?.abort()

  const copyResult = () => { navigator.clipboard.writeText(result || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const exportWord = () => exportResultToDocx(result, `salary_${role || 'role'}`)
  const exportPdf = () => exportResultToPdf(result, `salary_${role || 'role'}`)

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-text3 uppercase tracking-wide">Role / Job Title</span>
          <Input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Senior React Developer" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-text3 uppercase tracking-wide">Location</span>
          <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Austin, TX or Remote (US)" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-text3 uppercase tracking-wide">Years of Experience (optional)</span>
          <Input value={experience} onChange={e => setExperience(e.target.value)} placeholder="e.g. 5" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        {streaming ? (
          <Button variant="danger" leftIcon="square" onClick={stopStreaming}>Stop</Button>
        ) : (
          <Button variant="primary" leftIcon="trendUp" disabled={!canRun} onClick={run}>
            Run Salary & Demand Analysis
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red">{error}</p>}
      <AIResultCard streaming={streaming} streamingText={streamingText} result={result} subject={resultSubject} copied={copied} onCopy={copyResult} onExportWord={exportWord} onExportPdf={exportPdf} />
    </div>
  )
}
