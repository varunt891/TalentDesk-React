import { useState, useEffect, useMemo } from 'react'
import {
  Card, CardHeader, KPICard, Badge, Avatar, SearchBar, Select, Button, Modal, cn, Icon, Table,
} from '../ui'
import InfoBanner from './InfoBanner'
import { apiRequest } from '../../lib/api'

const TOOL_LABELS = {
  resume_parser: 'Resume Parser',
  copilot_chat: 'Copilot Chat',
  match: 'Candidate Match',
  submission_packet: 'Submission Packet',
  jd: 'Job Description Analysis',
  boolean: 'Boolean Search Builder',
  salary: 'Salary Benchmarking',
  email: 'Outreach Email Generator',
  formatter: 'Resume Formatter',
  resume_skills: 'Skill Extraction',
  interview_sim: 'Interview Simulator',
}

const PROVIDER_INFO = {
  gemini: { name: 'Google Gemini', color: 'from-blue-500 to-indigo-600', badgeTone: 'accent' },
  groq: { name: 'Groq GPT-OSS', color: 'from-amber-500 to-orange-600', badgeTone: 'yellow' },
  openrouter: { name: 'OpenRouter AI', color: 'from-purple-500 to-pink-600', badgeTone: 'ai' },
  mistral: { name: 'Mistral AI', color: 'from-emerald-500 to-teal-600', badgeTone: 'green' },
  unknown: { name: 'System / Default', color: 'from-gray-500 to-slate-600', badgeTone: 'neutral' },
}

const PERIOD_OPTIONS = [
  { id: '7', label: '7 Days' },
  { id: '30', label: '30 Days' },
  { id: '90', label: '90 Days' },
  { id: '0', label: 'All Time' },
]

export default function SuperadminAIUsageSection() {
  const [days, setDays] = useState('30')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('orgs') // 'orgs' | 'providers' | 'tools' | 'logs'
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [eventSearch, setEventSearch] = useState('')

  const fetchUsage = async () => {
    setLoading(true)
    try {
      const res = await apiRequest(`/admin/platform/ai-usage?days=${days}`)
      if (res?.data) {
        setData(res.data)
      }
    } catch (err) {
      console.error('[SuperadminAIUsageSection] Failed to load platform AI usage:', err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsage()
  }, [days])

  const summary = data?.summary || {
    totalCreditsUsed: 0,
    totalTokens: 0,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    successRate: 100,
    avgLatencyMs: null,
    totalOrgsCount: 0,
    activeOrgsCount: 0,
    activeUsersCount: 0,
  }

  const orgs = data?.orgs || []
  const providers = data?.providers || []
  const tools = data?.tools || []
  const recentEvents = data?.recentEvents || []

  // Filtered Orgs
  const filteredOrgs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orgs.filter(o => !q || `${o.name} ${o.slug} ${o.plan}`.toLowerCase().includes(q))
  }, [orgs, search])

  // Filtered Events
  const filteredEvents = useMemo(() => {
    const q = eventSearch.trim().toLowerCase()
    return recentEvents.filter(e => {
      if (!q) return true
      return (
        `${e.orgName} ${e.userName} ${e.toolId} ${e.provider} ${e.model} ${e.error || ''}`
          .toLowerCase()
          .includes(q)
      )
    })
  }, [recentEvents, eventSearch])

  return (
    <div className="flex flex-col gap-6">
      {/* Platform Header & Timeframe Switcher */}
      <Card>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4 pb-3 border-b border-border/50">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-text tracking-tight">
                Platform AI Infrastructure & Analytics
              </h3>
              <Badge tone="ai" size="sm">Superadmin View</Badge>
            </div>
            <p className="text-xs text-text3 mt-1 leading-relaxed">
              {loading
                ? 'Retrieving real server-recorded AI execution events…'
                : `Real platform-wide AI model executions across ${summary.totalOrgsCount} organizations`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="flex items-center gap-1 bg-surface2 border border-border rounded-[var(--radius-sm)] p-0.5">
              {PERIOD_OPTIONS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setDays(p.id)}
                  className={cn(
                    'h-7 px-2.5 rounded-[calc(var(--radius-sm)-2px)] text-xs font-semibold transition-colors duration-[var(--duration-fast)]',
                    days === p.id ? 'bg-accent text-white' : 'text-text3 hover:text-text'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              leftIcon="refresh"
              loading={loading}
              onClick={fetchUsage}
            >
              Refresh Data
            </Button>
          </div>
        </div>


        {/* Real KPI Summary Matrix */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
          <KPICard
            label="Total AI Requests"
            value={summary.totalRequests.toLocaleString()}
            helper={`${summary.successfulRequests.toLocaleString()} successful · ${summary.failedRequests.toLocaleString()} failed`}
            icon="sparkles"
            tone="ai"
          />
          <KPICard
            label="Total Tokens Processed"
            value={summary.totalTokens > 0 ? summary.totalTokens.toLocaleString() : '—'}
            helper="Sum across all providers"
            icon="layers"
            tone="accent"
          />
          <KPICard
            label="Platform Success Rate"
            value={`${summary.successRate}%`}
            helper={summary.failedRequests > 0 ? `${summary.failedRequests} request errors` : '100% operational'}
            icon="checkCircle"
            tone={summary.successRate >= 95 ? 'green' : summary.successRate >= 85 ? 'yellow' : 'red'}
          />
          <KPICard
            label="Avg Execution Latency"
            value={summary.avgLatencyMs ? `${summary.avgLatencyMs} ms` : '—'}
            helper="Real model response time"
            icon="jobs"
            tone="orange"
          />
          <KPICard
            label="Active AI Orgs"
            value={`${summary.activeOrgsCount} / ${summary.totalOrgsCount}`}
            helper={`${summary.activeUsersCount} staff users active`}
            icon="users"
            tone="yellow"
          />
        </div>
      </Card>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('orgs')}
          className={cn(
            'px-4 py-2 text-xs font-semibold rounded-t-[var(--radius-sm)] transition-colors',
            activeTab === 'orgs'
              ? 'bg-surface border-t border-x border-border text-accent font-bold'
              : 'text-text3 hover:text-text'
          )}
        >
          Tenant Organizations ({orgs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('providers')}
          className={cn(
            'px-4 py-2 text-xs font-semibold rounded-t-[var(--radius-sm)] transition-colors',
            activeTab === 'providers'
              ? 'bg-surface border-t border-x border-border text-accent font-bold'
              : 'text-text3 hover:text-text'
          )}
        >
          AI Providers & Infrastructure ({providers.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('tools')}
          className={cn(
            'px-4 py-2 text-xs font-semibold rounded-t-[var(--radius-sm)] transition-colors',
            activeTab === 'tools'
              ? 'bg-surface border-t border-x border-border text-accent font-bold'
              : 'text-text3 hover:text-text'
          )}
        >
          AI Features & Workflows ({tools.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={cn(
            'px-4 py-2 text-xs font-semibold rounded-t-[var(--radius-sm)] transition-colors',
            activeTab === 'logs'
              ? 'bg-surface border-t border-x border-border text-accent font-bold'
              : 'text-text3 hover:text-text'
          )}
        >
          Live AI Activity Stream ({recentEvents.length})
        </button>
      </div>

      {/* ── TAB 1: Tenant Organizations Matrix ── */}
      {activeTab === 'orgs' && (
        <Card>
          <CardHeader
            title="Tenant Organization AI Consumption Matrix"
            subtitle="Platform-wide monitoring of AI quota limits, credit usage, and active features per organization"
            action={
              <div className="w-64">
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="Search org name, slug, or plan..."
                />
              </div>
            }
          />

          {filteredOrgs.length === 0 ? (
            <div className="py-12 text-center text-sm text-text3">
              No organizations found matching search criteria.
            </div>
          ) : (
            <div className="overflow-x-auto border border-border rounded-[var(--radius-md)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface2 text-text2 font-semibold uppercase tracking-wider text-[10px] border-b border-border">
                  <tr>
                    <th className="p-3">Organization</th>
                    <th className="p-3">Plan</th>
                    <th className="p-3 text-right">AI Credits Used</th>
                    <th className="p-3">Quota Consumption Meter</th>
                    <th className="p-3">Total Tokens</th>
                    <th className="p-3">Top AI Feature</th>
                    <th className="p-3">Top Provider</th>
                    <th className="p-3 text-right">Success Rate</th>
                    <th className="p-3">Last AI Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface text-text">
                  {filteredOrgs.map(org => {
                    const isHighUsage = org.percentUsed >= 80
                    const providerMeta = PROVIDER_INFO[(org.topProvider || '').toLowerCase()] || PROVIDER_INFO.unknown

                    return (
                      <tr key={org.orgId} className="hover:bg-surface2/50 transition-colors">
                        <td className="p-3 font-semibold text-text">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                            <div>
                              <div className="text-xs font-bold text-text">{org.name}</div>
                              <div className="text-[11px] text-text3 font-mono">{org.slug || '—'}</div>
                            </div>
                          </div>
                        </td>

                        <td className="p-3">
                          <Badge tone={org.plan === 'Enterprise' ? 'ai' : org.plan === 'Growth' ? 'accent' : 'neutral'} size="sm">
                            {org.plan}
                          </Badge>
                        </td>

                        <td className="p-3 text-right font-mono font-bold text-accent text-sm">
                          {org.creditsUsed.toLocaleString()}
                          <span className="text-[10px] text-text3 font-normal ml-1">/ {org.creditLimit.toLocaleString()}</span>
                        </td>

                        <td className="p-3 min-w-[160px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-surface3 overflow-hidden border border-border/30">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all duration-300',
                                  isHighUsage ? 'bg-gradient-to-r from-orange to-red' : 'bg-gradient-to-r from-accent to-ai'
                                )}
                                style={{ width: `${org.percentUsed}%` }}
                              />
                            </div>
                            <span className={cn('text-[11px] font-mono font-bold w-10 text-right', isHighUsage ? 'text-red' : 'text-text2')}>
                              {org.percentUsed}%
                            </span>
                          </div>
                        </td>

                        <td className="p-3 font-mono text-xs text-text2">
                          {org.totalTokens > 0 ? org.totalTokens.toLocaleString() : '—'}
                        </td>

                        <td className="p-3">
                          <Badge tone="neutral" size="sm">
                            {TOOL_LABELS[org.topToolId] || (org.creditsUsed > 0 ? 'General AI' : 'None')}
                          </Badge>
                        </td>

                        <td className="p-3">
                          {org.topProvider ? (
                            <Badge tone={providerMeta.badgeTone} size="sm">
                              {providerMeta.name}
                            </Badge>
                          ) : (
                            <span className="text-text3 text-[11px]">—</span>
                          )}
                        </td>

                        <td className="p-3 text-right font-mono text-xs">
                          <span className={cn('font-bold', org.successRate >= 95 ? 'text-green' : org.successRate >= 80 ? 'text-yellow' : 'text-red')}>
                            {org.creditsUsed > 0 ? `${org.successRate}%` : '—'}
                          </span>
                        </td>

                        <td className="p-3 text-text3 text-[11px] whitespace-nowrap">
                          {org.lastActive
                            ? new Date(org.lastActive).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : 'No activity'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── TAB 2: AI Providers Infrastructure & Health ── */}
      {activeTab === 'providers' && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              title="AI Provider Load & Infrastructure Health"
              subtitle="Real metrics captured from Gemini, Groq, OpenRouter, and Mistral model executions"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
              {Object.entries(PROVIDER_INFO).filter(([key]) => key !== 'unknown').map(([key, info]) => {
                const provData = providers.find(p => p.provider === key) || {
                  requests: 0,
                  percentShare: 0,
                  tokens: 0,
                  successRate: 100,
                  avgLatencyMs: null,
                }

                return (
                  <div
                    key={key}
                    className="rounded-[var(--radius-md)] border border-border bg-surface2/60 p-4 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <Badge tone={info.badgeTone} size="md" className="font-bold">
                          {info.name}
                        </Badge>
                        <span className="text-xs font-mono font-bold text-accent">
                          {provData.percentShare}% share
                        </span>
                      </div>

                      <div className="mt-4 flex flex-col gap-2">
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs text-text3">Total Executions:</span>
                          <span className="text-xl font-extrabold font-mono text-text">
                            {provData.requests.toLocaleString()}
                          </span>
                        </div>

                        <div className="flex justify-between items-baseline">
                          <span className="text-xs text-text3">Total Tokens:</span>
                          <span className="text-sm font-mono font-semibold text-text2">
                            {provData.tokens > 0 ? provData.tokens.toLocaleString() : '—'}
                          </span>
                        </div>

                        <div className="flex justify-between items-baseline">
                          <span className="text-xs text-text3">Avg Response Time:</span>
                          <span className="text-sm font-mono font-semibold text-orange">
                            {provData.avgLatencyMs ? `${provData.avgLatencyMs} ms` : '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                      <span className="text-text3">Health Status:</span>
                      <span
                        className={cn(
                          'font-bold font-mono',
                          provData.successRate >= 95 ? 'text-green' : provData.successRate >= 80 ? 'text-yellow' : 'text-red'
                        )}
                      >
                        {provData.requests > 0 ? `${provData.successRate}% Success` : 'Idle'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ── TAB 3: AI Tools & Features Breakdown ── */}
      {activeTab === 'tools' && (
        <Card>
          <CardHeader
            title="AI Features & Workflow Utilization"
            subtitle="Breakdown of AI request distribution across TalentDesk platform capabilities"
          />

          {tools.length === 0 ? (
            <div className="py-12 text-center text-sm text-text3">
              No AI feature usage recorded yet in this time period.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              {tools.map(tool => {
                const label = TOOL_LABELS[tool.toolId] || tool.toolId
                return (
                  <div
                    key={tool.toolId}
                    className="p-4 rounded-[var(--radius-md)] border border-border bg-surface2/40 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon name="sparkles" size={16} className="text-accent" />
                        <span className="font-bold text-text text-sm">{label}</span>
                      </div>
                      <Badge tone="ai" size="sm">{tool.requests} calls ({tool.percentShare}%)</Badge>
                    </div>

                    <div className="h-2 rounded-full bg-surface3 overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full"
                        style={{ width: `${Math.max(4, tool.percentShare)}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-xs text-text3 pt-1">
                      <span>Tokens: <b className="text-text font-mono">{tool.tokens.toLocaleString()}</b></span>
                      <span>Success Rate: <b className="text-green font-mono">{tool.successRate}%</b></span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* ── TAB 4: Live AI Activity Stream Audit Log ── */}
      {activeTab === 'logs' && (
        <Card>
          <CardHeader
            title="Live Platform AI Execution Log"
            subtitle="Real-time audit log of the 50 most recent server-side AI model requests"
            action={
              <div className="w-64">
                <SearchBar
                  value={eventSearch}
                  onChange={setEventSearch}
                  placeholder="Filter logs by org, user, tool, provider..."
                />
              </div>
            }
          />

          {filteredEvents.length === 0 ? (
            <div className="py-12 text-center text-sm text-text3">
              No recent AI execution logs found.
            </div>
          ) : (
            <div className="overflow-x-auto border border-border rounded-[var(--radius-md)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface2 text-text2 font-semibold uppercase tracking-wider text-[10px] border-b border-border">
                  <tr>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Organization</th>
                    <th className="p-3">User</th>
                    <th className="p-3">AI Tool / Action</th>
                    <th className="p-3">Provider & Model</th>
                    <th className="p-3 text-right">Latency</th>
                    <th className="p-3 text-right">Tokens</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface text-text">
                  {filteredEvents.map(event => {
                    const providerMeta = PROVIDER_INFO[(event.provider || '').toLowerCase()] || PROVIDER_INFO.unknown

                    return (
                      <tr key={event.id} className="hover:bg-surface2/50 transition-colors font-mono text-[11px]">
                        <td className="p-3 text-text3 whitespace-nowrap">
                          {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>

                        <td className="p-3 font-sans font-semibold text-text">
                          {event.orgName}
                        </td>

                        <td className="p-3 font-sans text-text2 truncate max-w-[120px]">
                          {event.userName}
                        </td>

                        <td className="p-3 font-sans">
                          <Badge tone="neutral" size="sm">
                            {TOOL_LABELS[event.toolId] || event.toolId || 'General AI'}
                          </Badge>
                        </td>

                        <td className="p-3 font-sans">
                          <div className="flex items-center gap-1.5">
                            <Badge tone={providerMeta.badgeTone} size="sm">
                              {event.provider || 'AI'}
                            </Badge>
                            <span className="text-[10px] font-mono text-text3 truncate max-w-[110px]">
                              {event.model || 'default'}
                            </span>
                          </div>
                        </td>

                        <td className="p-3 text-right font-mono text-orange">
                          {event.durationMs ? `${event.durationMs}ms` : '—'}
                        </td>

                        <td className="p-3 text-right font-mono text-accent">
                          {event.totalTokens ? event.totalTokens.toLocaleString() : '—'}
                        </td>

                        <td className="p-3 text-center font-sans">
                          {event.success ? (
                            <Badge tone="green" size="sm">Success</Badge>
                          ) : (
                            <Badge tone="red" size="sm">Failed</Badge>
                          )}
                        </td>

                        <td className="p-3 text-center font-sans">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedEvent(event)}
                          >
                            Details
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <Modal
          open={Boolean(selectedEvent)}
          onClose={() => setSelectedEvent(null)}
          title="AI Execution Event Details"
          size="md"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between bg-surface2 p-3 rounded-[var(--radius-md)] border border-border">
              <div>
                <div className="font-bold text-text">{TOOL_LABELS[selectedEvent.toolId] || selectedEvent.toolId || 'AI Action'}</div>
                <div className="text-xs text-text3">{selectedEvent.orgName} · User: {selectedEvent.userName}</div>
              </div>
              <Badge tone={selectedEvent.success ? 'green' : 'red'}>
                {selectedEvent.success ? 'SUCCESS' : 'FAILED'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-[var(--radius-md)] bg-surface3/40 border border-border flex flex-col gap-1">
                <span className="text-text3">Provider</span>
                <span className="font-bold text-text">{selectedEvent.provider || 'Default'}</span>
              </div>

              <div className="p-3 rounded-[var(--radius-md)] bg-surface3/40 border border-border flex flex-col gap-1">
                <span className="text-text3">Model Name</span>
                <span className="font-mono font-bold text-text truncate">{selectedEvent.model || 'Standard'}</span>
              </div>

              <div className="p-3 rounded-[var(--radius-md)] bg-surface3/40 border border-border flex flex-col gap-1">
                <span className="text-text3">Execution Duration</span>
                <span className="font-mono font-bold text-orange">{selectedEvent.durationMs ? `${selectedEvent.durationMs} ms` : 'N/A'}</span>
              </div>

              <div className="p-3 rounded-[var(--radius-md)] bg-surface3/40 border border-border flex flex-col gap-1">
                <span className="text-text3">Tokens Consumed</span>
                <span className="font-mono font-bold text-accent">{selectedEvent.totalTokens ? selectedEvent.totalTokens.toLocaleString() : 'N/A'}</span>
              </div>
            </div>

            {selectedEvent.error && (
              <div className="p-3 rounded-[var(--radius-md)] bg-red/10 border border-red/30 text-red text-xs font-mono">
                <div className="font-bold text-xs uppercase tracking-wider mb-1">Execution Error Trace:</div>
                {selectedEvent.error}
              </div>
            )}

            <div className="flex justify-between items-center text-xs text-text3 pt-2 border-t border-border">
              <span>Event ID: <code className="text-text font-mono">{selectedEvent.id}</code></span>
              <span>{new Date(selectedEvent.createdAt).toLocaleString()}</span>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedEvent(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
