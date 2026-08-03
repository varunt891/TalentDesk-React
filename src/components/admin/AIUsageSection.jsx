import { useState, useEffect, useMemo } from 'react'
import {
  Card, CardHeader, KPICard, Badge, Avatar, SearchBar, Select, Button, Modal, cn,
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
}

const EMPTY_OVERVIEW = {
  creditLimit: 1000, totalCreditsUsed: 0, percentUsed: 0, remainingCredits: 1000,
  totalChat: 0, totalAction: 0, totalRequests: 0, activeStaffCount: 0, totalStaffCount: 0, staffList: [],
}

export default function AIUsageSection({ org, orgId }) {
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('All')
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [overview, setOverview] = useState(EMPTY_OVERVIEW)
  const [loading, setLoading] = useState(true)

  const planName = org?.subscription_plan || 'Growth'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiRequest('/organization/ai-usage')
      .then(res => {
        if (cancelled || !res?.data) return
        setOverview({
          ...res.data,
          staffList: res.data.staffList.map(s => ({ ...s, topAction: TOOL_LABELS[s.topToolId] || (s.creditsUsed > 0 ? 'General AI Usage' : '—') })),
        })
      })
      .catch(err => console.error('[AIUsageSection] Failed to load AI usage:', err.message))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [orgId])

  const departments = useMemo(() => {
    const set = new Set(overview.staffList.map(s => s.department).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [overview.staffList])

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase()
    return overview.staffList.filter(staff => {
      const matchesSearch = !q || `${staff.name} ${staff.email} ${staff.role} ${staff.topAction}`.toLowerCase().includes(q)
      const matchesDept = deptFilter === 'All' || staff.department === deptFilter
      return matchesSearch && matchesDept
    })
  }, [overview.staffList, search, deptFilter])

  const isNearLimit = overview.percentUsed >= 80

  return (
    <div className="flex flex-col gap-6">
      {/* Overall AI Credit Consumption Overview */}
      <Card>
        <CardHeader
          title="Organization AI Usage & Credits"
          subtitle={loading ? 'Loading real-time usage…' : `Centralized AI consumption monitoring for ${org?.name || 'Organization'}`}
          action={<Badge tone="ai" size="md">{planName} Plan — {overview.creditLimit.toLocaleString()} Credits/mo</Badge>}
        />

        <div className="flex flex-col gap-5">
          {/* Main Usage Meter */}
          <div className="rounded-[var(--radius-md)] border border-border bg-surface2/60 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-text">Monthly AI Credits Consumed</span>
                <Badge tone={isNearLimit ? 'red' : 'accent'} size="sm">
                  {overview.percentUsed}% used
                </Badge>
              </div>
              <div className="text-xs font-mono font-medium text-text2">
                <span className="text-text font-bold text-sm">{overview.totalCreditsUsed.toLocaleString()}</span> / {overview.creditLimit.toLocaleString()} credits
              </div>
            </div>

            {/* Meter Bar */}
            <div className="h-3 rounded-full bg-surface3 overflow-hidden p-0.5 border border-border/40">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  isNearLimit ? 'bg-gradient-to-r from-red to-orange' : 'bg-gradient-to-r from-accent to-ai'
                )}
                style={{ width: `${Math.min(100, overview.percentUsed)}%` }}
              />
            </div>

            <div className="flex justify-between items-center text-xs text-text3 pt-1">
              <span>{overview.remainingCredits.toLocaleString()} credits remaining in billing cycle</span>
              <span>Resets on 1st of month</span>
            </div>
          </div>

          {isNearLimit && (
            <InfoBanner tone="warn">
              Your organization has consumed {overview.percentUsed}% of allocated AI credits for this month. Upgrade to Enterprise tier to increase credit capacity.
            </InfoBanner>
          )}

          {/* Key Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPICard
              label="Total AI Requests"
              value={overview.totalRequests.toLocaleString()}
              helper={`${overview.totalChat} Chat · ${overview.totalAction} Actions`}
              icon="sparkles"
              tone="ai"
            />
            <KPICard
              label="Active Staff Users"
              value={`${overview.activeStaffCount} / ${overview.totalStaffCount}`}
              helper="Staff generating AI prompts"
              icon="users"
              tone="accent"
            />
            <KPICard
              label="Credits Remaining"
              value={overview.remainingCredits.toLocaleString()}
              helper={`Limit: ${overview.creditLimit}`}
              icon="layers"
              tone="green"
            />
            <KPICard
              label="Avg Staff Usage"
              value={overview.totalStaffCount > 0 ? `${Math.round(overview.totalCreditsUsed / overview.totalStaffCount)} cr` : '0'}
              helper="Credits / staff member"
              icon="mail"
              tone="yellow"
            />
          </div>
        </div>
      </Card>

      {/* Staff AI Usage Breakdown Table */}
      <Card>
        <CardHeader
          title="Staff AI Credit Breakdown"
          subtitle="Track individual staff member AI usage, credit share, and top AI features."
        />

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <div className="flex-1">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search staff by name, email, role, or top action..."
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              value={deptFilter}
              onChange={setDeptFilter}
              options={departments.map(d => ({ value: d, label: d === 'All' ? 'All Departments' : d }))}
            />
          </div>
        </div>

        {/* Staff Table */}
        {filteredStaff.length === 0 ? (
          <div className="py-12 text-center text-sm text-text3">
            No staff members found matching &quot;{search}&quot;.
          </div>
        ) : (
          <div className="overflow-x-auto border border-border rounded-[var(--radius-md)]">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface2 text-text2 font-semibold uppercase tracking-wider text-[10px] border-b border-border">
                <tr>
                  <th className="p-3">Staff Member</th>
                  <th className="p-3">Role & Dept</th>
                  <th className="p-3 text-right">AI Credits Used</th>
                  <th className="p-3">Share of Org Usage</th>
                  <th className="p-3">Top AI Feature</th>
                  <th className="p-3">Last AI Activity</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface text-text">
                {filteredStaff.map(staff => (
                  <tr key={staff.memberId} className="hover:bg-surface2/50 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={staff.name} size="sm" />
                        <div className="min-w-0">
                          <div className="font-semibold text-text text-xs truncate">{staff.name}</div>
                          <div className="text-[11px] text-text3 truncate">{staff.email}</div>
                        </div>
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-text">{staff.department}</span>
                        <span className="text-[10px] text-text3 uppercase tracking-wider">{staff.role}</span>
                      </div>
                    </td>

                    <td className="p-3 text-right">
                      <span className="font-bold font-mono text-sm text-accent">{staff.creditsUsed.toLocaleString()}</span>
                      <span className="text-[10px] text-text3 ml-1">credits</span>
                    </td>

                    <td className="p-3 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-surface3 overflow-hidden">
                          <div
                            className="h-full bg-ai rounded-full"
                            style={{ width: `${Math.max(4, staff.percentShare)}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-text2 w-8 text-right">{staff.percentShare}%</span>
                      </div>
                    </td>

                    <td className="p-3">
                      <Badge tone="neutral" size="sm" className="font-medium">
                        {staff.topAction}
                      </Badge>
                    </td>

                    <td className="p-3 text-text3 text-[11px] whitespace-nowrap">
                      {staff.lastActive ? new Date(staff.lastActive).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No activity yet'}
                    </td>

                    <td className="p-3 text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedStaff(staff)}
                        title="View detailed AI activity"
                      >
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Staff Inspection Modal */}
      {selectedStaff && (
        <Modal
          open={Boolean(selectedStaff)}
          onClose={() => setSelectedStaff(null)}
          title={`AI Usage Detail: ${selectedStaff.name}`}
          size="md"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 bg-surface2 p-3 rounded-[var(--radius-md)] border border-border">
              <Avatar name={selectedStaff.name} size="md" />
              <div>
                <div className="font-bold text-text">{selectedStaff.name}</div>
                <div className="text-xs text-text3">{selectedStaff.email} · {selectedStaff.department} ({selectedStaff.role})</div>
              </div>
              <Badge tone="ai" className="ml-auto">{selectedStaff.creditsUsed} Total Credits</Badge>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-surface3/40 p-3 rounded-[var(--radius-md)] border border-border text-center">
                <div className="text-xs text-text3">Copilot Chats</div>
                <div className="text-lg font-bold text-text mt-0.5">{selectedStaff.chatCount}</div>
              </div>
              <div className="bg-surface3/40 p-3 rounded-[var(--radius-md)] border border-border text-center">
                <div className="text-xs text-text3">AI Actions</div>
                <div className="text-lg font-bold text-text mt-0.5">{selectedStaff.actionCount}</div>
              </div>
              <div className="bg-surface3/40 p-3 rounded-[var(--radius-md)] border border-border text-center">
                <div className="text-xs text-text3">Automations</div>
                <div className="text-lg font-bold text-text mt-0.5">{selectedStaff.autoCount}</div>
              </div>
            </div>

            <div className="text-xs text-text2 flex flex-col gap-2 pt-2">
              <div className="flex justify-between border-b border-border pb-1.5">
                <span className="text-text3">Share of Org AI Consumption:</span>
                <span className="font-bold text-text">{selectedStaff.percentShare}%</span>
              </div>
              <div className="flex justify-between border-b border-border pb-1.5">
                <span className="text-text3">Primary AI Workflow:</span>
                <span className="font-medium text-text">{selectedStaff.topAction}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text3">Last Prompted AI:</span>
                <span className="text-text">{selectedStaff.lastActive ? new Date(selectedStaff.lastActive).toLocaleString() : 'N/A'}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedStaff(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
