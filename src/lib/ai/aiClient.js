// Low-level AI transport: the one place that knows how to reach the two
// server AI endpoints (one-shot action, streaming copilot chat). Every AI
// feature in the app should go through this module instead of hand-rolling
// its own fetch/auth logic.
import { API_BASE, getAuthToken, apiRequest } from '../api'

// Generic AI Action Framework entry point — Summarize/Rewrite/Improve/
// Compare/Explain/Score/Analyze/Recommend/Draft/Translate/Extract all
// funnel through this single call.
export async function runAiAction({ action, content, context }) {
  return apiRequest('/ai/action', { method: 'POST', body: { action, content, context } })
}

// Streams the Recruiter Copilot's reply over SSE. Resolves with the fully
// assembled text once the stream completes; calls onDelta as each chunk
// arrives so the UI can render incrementally. Pass an AbortSignal to
// support cancellation.
export async function streamCopilot({ message, history, context, onDelta, signal }) {
  const token = getAuthToken()
  const response = await fetch(`${API_BASE}/ai/copilot/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, history, context }),
    signal,
  })

  if (!response.ok || !response.body) {
    let errMsg = `Copilot request failed (${response.status})`
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

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''
    for (const evt of events) {
      const dataLine = evt.split('\n').find(line => line.startsWith('data:'))
      if (!dataLine) continue
      const jsonStr = dataLine.slice(5).trim()
      if (!jsonStr) continue
      let parsed
      try { parsed = JSON.parse(jsonStr) } catch { continue }
      if (parsed.delta) {
        fullText += parsed.delta
        onDelta?.(parsed.delta, fullText)
      } else if (parsed.error) {
        const err = new Error(parsed.error)
        err.code = parsed.code
        throw err
      } else if (parsed.done) {
        meta = parsed
      }
    }
  }

  return { text: fullText, ...meta }
}
