// AI usage/activity log — purely additive to the Phase 5.1 foundation (does
// not modify aiClient/promptService/etc). Powers AI Center's real metrics
// (requests today, avg response time, most-used action, adoption by
// workspace, quality/reliability) from actual recorded usage instead of
// invented numbers. localStorage only, same org+user scoping convention as
// memory.js.
//
// Event shape (all fields optional except `type`/`at`):
//   { type: 'chat' | 'action' | 'automation', action?, source?, success?,
//     retry?, error?, provider?, model?, durationMs?, preview?, at }
// `success` defaults to true when omitted, so events logged before this
// field existed still count correctly.
function usageKey(orgId, userId) { return `td_ai_usage_${orgId || 'na'}_${userId || 'na'}` }
const MAX_EVENTS = 500

export function loadUsageEvents(orgId, userId) {
  try {
    const raw = localStorage.getItem(usageKey(orgId, userId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function logUsageEvent(orgId, userId, event) {
  try {
    const current = loadUsageEvents(orgId, userId)
    const next = [{ ...event, at: new Date().toISOString() }, ...current].slice(0, MAX_EVENTS)
    localStorage.setItem(usageKey(orgId, userId), JSON.stringify(next))
  } catch { /* quota exceeded */ }
}

const isSuccess = (e) => e.success !== false
const todayStr = () => new Date().toISOString().slice(0, 10)

export function getUsageSummary(orgId, userId) {
  const events = loadUsageEvents(orgId, userId)
  const today = todayStr()
  const eventsToday = events.filter(e => (e.at || '').slice(0, 10) === today)
  const succeeded = events.filter(isSuccess)
  const withDuration = succeeded.filter(e => typeof e.durationMs === 'number')
  const avgResponseMs = withDuration.length ? Math.round(withDuration.reduce((sum, e) => sum + e.durationMs, 0) / withDuration.length) : null

  const actionCounts = {}
  succeeded.filter(e => e.type === 'action' && e.action).forEach(e => { actionCounts[e.action] = (actionCounts[e.action] || 0) + 1 })
  const topAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0] || null

  const weekAgoMs = new Date().getTime() - 7 * 86400000
  const eventsThisWeek = events.filter(e => new Date(e.at).getTime() >= weekAgoMs)

  // Estimated time saved is a disclosed heuristic (~3 min per completed
  // action, ~2 min per chat reply) built from real successful usage counts
  // — labeled "Estimated" everywhere it's shown, never presented as fact.
  const actionCount = succeeded.filter(e => e.type === 'action').length
  const chatCount = succeeded.filter(e => e.type === 'chat').length
  const estimatedMinutesSaved = actionCount * 3 + chatCount * 2

  return {
    requestsToday: eventsToday.length,
    totalRequests: events.length,
    requestsThisWeek: eventsThisWeek.length,
    avgResponseMs,
    topAction: topAction ? { action: topAction[0], count: topAction[1] } : null,
    estimatedMinutesSaved,
  }
}

// Part 4 — AI Quality: only ever measured from real logged events. Returns
// null/empty defaults (never fabricated numbers) when nothing recorded yet.
export function getQualitySummary(orgId, userId) {
  const events = loadUsageEvents(orgId, userId)
  const total = events.length
  const failed = events.filter(e => e.success === false)
  const succeeded = events.filter(isSuccess)
  const chatEvents = events.filter(e => e.type === 'chat')
  const chatSucceeded = chatEvents.filter(isSuccess)
  const retryCount = events.filter(e => e.retry === true).length
  const withDuration = succeeded.filter(e => typeof e.durationMs === 'number')
  const avgCompletionMs = withDuration.length ? Math.round(withDuration.reduce((s, e) => s + e.durationMs, 0) / withDuration.length) : null

  const providerCounts = {}
  events.filter(e => e.provider).forEach(e => { providerCounts[e.provider] = (providerCounts[e.provider] || 0) + 1 })

  return {
    totalRequests: total,
    failedRequests: failed.length,
    successRate: total ? Math.round((succeeded.length / total) * 100) : null,
    retryCount,
    avgCompletionMs,
    streamingSuccessRate: chatEvents.length ? Math.round((chatSucceeded.length / chatEvents.length) * 100) : null,
    lastActivityAt: events[0]?.at || null,
    providerCounts,
    recentErrors: failed.slice(0, 5).map(e => ({ at: e.at, error: e.error, type: e.type, action: e.action, source: e.source })),
  }
}

// Part 1 — daily request volume + average latency for the last N days, for
// the "AI Requests Over Time" / "Average Response Time Trend" charts.
export function getUsageTimeSeries(orgId, userId, days = 14) {
  const events = loadUsageEvents(orgId, userId)
  const buckets = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const dayEvents = events.filter(e => (e.at || '').slice(0, 10) === dateStr)
    const withDuration = dayEvents.filter(e => typeof e.durationMs === 'number')
    buckets.push({
      date: dateStr,
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      count: dayEvents.length,
      avgDurationMs: withDuration.length ? Math.round(withDuration.reduce((s, e) => s + e.durationMs, 0) / withDuration.length) : 0,
    })
  }
  return buckets
}

// "AI Adoption by Workspace" — grouped by the `source` each call site tags
// itself with (candidates/jobs/pipeline/tasks/communication/ai_center/...).
export function getAdoptionByWorkspace(orgId, userId) {
  const events = loadUsageEvents(orgId, userId)
  const counts = {}
  events.forEach(e => {
    const key = e.source || 'unknown'
    counts[key] = (counts[key] || 0) + 1
  })
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([source, count]) => ({ source, count }))
}

// "Most Used AI Actions"
export function getActionUsageBreakdown(orgId, userId) {
  const events = loadUsageEvents(orgId, userId).filter(e => e.type === 'action' && e.action)
  const counts = {}
  events.forEach(e => { counts[e.action] = (counts[e.action] || 0) + 1 })
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([action, count]) => ({ action, count }))
}
