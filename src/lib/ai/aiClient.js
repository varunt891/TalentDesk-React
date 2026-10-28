// Low-level AI transport: the one place that knows how to reach the server's
// AI endpoints (one-shot action, and the streaming variants of copilot chat/
// action/generate). Every AI feature in the app should go through this
// module instead of hand-rolling its own fetch/auth logic.
import { API_BASE, getAuthToken, apiRequest } from '../api'

// Generic AI Action Framework entry point — Summarize/Rewrite/Improve/
// Compare/Explain/Score/Analyze/Recommend/Draft/Translate/Extract all
// funnel through this single call.
export async function runAiAction({ action, content, context }) {
  return apiRequest('/ai/action', { method: 'POST', body: { action, content, context } })
}

// Low-level SSE consumer shared by every streaming AI surface. Resolves with
// the fully assembled text once the stream completes; calls onDelta as each
// chunk arrives so the UI can render incrementally. Pass an AbortSignal to
// support cancellation (e.g. a "Stop" button).
async function streamSSE(path, body, { onDelta, signal } = {}) {
  const token = getAuthToken()
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok || !response.body) {
    let errMsg = `Request failed (${response.status})`
    try {
      const payload = await response.json()
      errMsg = payload.error || errMsg
    } catch { /* body wasn't JSON */ }
    throw new Error(errMsg)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let meta = {}
  let completed = false

  const consumeEvent = evt => {
    const dataLine = evt.split('\n').find(line => line.startsWith('data:'))
    if (!dataLine) return
    const jsonStr = dataLine.slice(5).trim()
    if (!jsonStr) return
    let parsed
    try { parsed = JSON.parse(jsonStr) } catch { return }
    if (parsed.error) {
      const error = new Error(parsed.error)
      error.code = parsed.code
      throw error
    }
    if (parsed.delta) {
      fullText += parsed.delta
      onDelta?.(parsed.delta, fullText)
    }
    if (parsed.done) { completed = true; meta = parsed }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''
      events.forEach(consumeEvent)
    }
    if (buffer.trim()) consumeEvent(buffer)
    if (!completed) throw new Error('The AI connection ended before the response completed. Please retry.')
  } finally {
    reader.releaseLock()
  }

  return { text: fullText, ...meta }
}

// Streams the Recruiter Copilot's reply over SSE.
export async function streamCopilot({ message, history, context, onDelta, signal }) {
  return streamSSE('/ai/copilot/stream', { message, history, context }, { onDelta, signal })
}

// Streaming twin of runAiAction — same Action Framework, incremental output.
export async function streamAiAction({ action, content, context, onDelta, signal }) {
  return streamSSE('/ai/action/stream', { action, content, context }, { onDelta, signal })
}

// Direct entry point into a specific server-side tool config (see
// server/src/services/promptService.js's TOOL_CONFIGS) for purpose-built
// features that need their own prompt shape rather than the generic Action
// Framework — e.g. Market Salary & Demand analysis.
export async function streamAiGenerate({ prompt, toolId, onDelta, signal }) {
  return streamSSE('/ai/generate/stream', { prompt, toolId }, { onDelta, signal })
}
