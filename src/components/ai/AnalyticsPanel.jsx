import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardHeader, Badge, EmptyState } from '../ui'
import { getUsageSummary, getUsageTimeSeries, getAdoptionByWorkspace, getActionUsageBreakdown, getQualitySummary } from '../../lib/ai/usage'
import { getAiAction } from '../../lib/ai/prompts'

const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', padding: '8px 12px' }
const tooltipLabelStyle = { color: 'var(--text)', fontWeight: '700', fontSize: '12px' }
const tooltipItemStyle = { color: 'var(--text2)', fontSize: '12px' }

const WORKSPACE_LABELS = {
  dashboard: 'Dashboard', candidates: 'Candidates', jobs: 'Jobs', pipeline: 'Pipeline',
  tasks: 'Tasks & Targets', communication: 'Communication', ai_center: 'AI Center',
  actions_panel: 'Copilot Actions', automations: 'Automations', unknown: 'Other',
}

function MiniStat({ label, value, tone }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-surface2 border border-border px-3 py-2.5">
      <div className="text-[10px] text-text3 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-lg font-extrabold font-mono" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
    </div>
  )
}

function RankedBar({ label, count, max, tone = 'accent' }) {
  const pct = max ? Math.round((count / max) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-text2 font-medium truncate">{label}</span>
        <span className="text-text3 font-mono shrink-0 ml-2">{count}</span>
      </div>
      <div className="h-1.5 bg-surface3 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `var(--${tone})` }} />
      </div>
    </div>
  )
}

/**
 * Part 1 (Analytics) + Part 4 (Quality) — every number here is read from
 * usage.js's real logged events (src/lib/ai/usage.js). Nothing is
 * projected, simulated, or estimated except "Estimated Time Saved", which
 * is explicitly labeled as a heuristic. Cross-recruiter analytics show an
 * honest placeholder since usage is only tracked per-browser.
 */
export default function AnalyticsPanel({ orgId, userId, conversations }) {
  const summary = getUsageSummary(orgId, userId)
  const quality = getQualitySummary(orgId, userId)
  const timeSeries = getUsageTimeSeries(orgId, userId, 14)
  const adoption = getAdoptionByWorkspace(orgId, userId)
  const actionUsage = getActionUsageBreakdown(orgId, userId)

  const conversationGrowth = useMemo(() => {
    const buckets = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      const count = (conversations || []).filter(c => (c.createdAt || '').slice(0, 10) === dateStr).length
      buckets.push({ date: dateStr, label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), count })
    }
    return buckets
  }, [conversations])

  if (summary.totalRequests === 0) {
    return <EmptyState icon="reports" title="No AI usage yet" description="Analytics will appear here once you start chatting with Copilot or running AI actions." />
  }

  const maxAction = actionUsage[0]?.count || 1
  const maxAdoption = adoption[0]?.count || 1

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat label="Total Requests" value={summary.totalRequests} />
        <MiniStat label="This Week" value={summary.requestsThisWeek} />
        <MiniStat label="Success Rate" value={quality.successRate !== null ? `${quality.successRate}%` : '—'} />
        <MiniStat label="Est. Time Saved" value={summary.estimatedMinutesSaved > 0 ? `${summary.estimatedMinutesSaved}m` : '—'} />
      </div>

      <Card>
        <CardHeader title="AI Requests Over Time" subtitle="Last 14 days" />
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={timeSeries}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
            <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
            <Bar dataKey="count" name="Requests" fill="var(--accent)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader title="Most Used AI Actions" />
          {actionUsage.length === 0 ? <p className="text-xs text-text3">No actions run yet.</p> : (
            <div className="flex flex-col gap-2.5">
              {actionUsage.slice(0, 8).map(a => <RankedBar key={a.action} label={getAiAction(a.action).label} count={a.count} max={maxAction} />)}
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="AI Adoption by Workspace" />
          {adoption.length === 0 ? <p className="text-xs text-text3">No workspace activity yet.</p> : (
            <div className="flex flex-col gap-2.5">
              {adoption.slice(0, 8).map(a => <RankedBar key={a.source} label={WORKSPACE_LABELS[a.source] || a.source} count={a.count} max={maxAdoption} tone="ai" />)}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Conversation Growth" subtitle="New conversations started, last 14 days" />
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={conversationGrowth}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
            <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
            <Bar dataKey="count" name="Conversations" fill="var(--ai)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <CardHeader title="Quality & Reliability" subtitle="Measured from real logged requests" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <MiniStat label="Failed Requests" value={quality.failedRequests} tone={quality.failedRequests > 0 ? 'red' : undefined} />
          <MiniStat label="Retry Count" value={quality.retryCount} />
          <MiniStat label="Avg Completion" value={quality.avgCompletionMs ? `${(quality.avgCompletionMs / 1000).toFixed(1)}s` : '—'} />
          <MiniStat label="Streaming Success" value={quality.streamingSuccessRate !== null ? `${quality.streamingSuccessRate}%` : '—'} />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-text3 mb-3">
          <span>Last activity: {quality.lastActivityAt ? new Date(quality.lastActivityAt).toLocaleString() : 'Never'}</span>
          {Object.keys(quality.providerCounts).length > 0 && (
            <span className="flex items-center gap-1.5">
              Provider used: {Object.entries(quality.providerCounts).map(([p, n]) => <Badge key={p} size="sm" tone="neutral">{p} ({n})</Badge>)}
            </span>
          )}
        </div>
        {quality.recentErrors.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="text-[10px] font-bold text-text3 uppercase tracking-wide">Recent Errors</div>
            {quality.recentErrors.map((e, i) => (
              <div key={i} className="text-xs text-red bg-red/5 border border-red/15 rounded-[var(--radius-sm)] px-2.5 py-1.5">
                <span className="font-mono text-[10px] text-text3 mr-2">{new Date(e.at).toLocaleTimeString()}</span>{e.error}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text3">No errors recorded.</p>
        )}
      </Card>

      <Card>
        <CardHeader title="Most Active Recruiters" />
        <EmptyState icon="users" title="Not available yet" description="Cross-recruiter analytics require centralized usage tracking, which isn't available without backend persistence. Showing your own activity in the meantime." />
      </Card>
    </div>
  )
}
