import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import * as XLSX from 'xlsx'
import { db } from '../lib/api'
import { useCandidates } from '../hooks/useCandidates'
import { useAuth } from '../context/AuthContext'
import SearchableSelect from '../components/SearchableSelect'

const COLORS = ['#4f7cff', '#2ecc8f', '#7c5cff', '#f5c842', '#ff8c42', '#ff4d6a']
const TEAM_BADGE_COLORS = ['blue', 'purple', 'green', 'yellow', 'orange', 'pink']
const STAGES = ['Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired', 'Rejected']

function dateKey(date) {
  return date.toISOString().slice(0, 10)
}

function daysAgo(days) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - days)
  return date
}

function isInRange(value, days) {
  if (!value) return false
  return value >= dateKey(daysAgo(days - 1))
}

function getDescendants(userId, allUsers) {
  if (!userId || !allUsers) return []
  const direct = allUsers.filter(u => u.manager_id === userId)
  let result = [...direct]
  for (const child of direct) {
    result = result.concat(getDescendants(child.id, allUsers))
  }
  return result
}

export default function Reports() {
  const { profile } = useAuth()
  const role = profile?.role || 'recruiter'

  const { candidates } = useCandidates()
  const [mode, setMode] = useState('weekly')
  const [callbacks, setCallbacks] = useState([])
  const [followups, setFollowups] = useState([])
  const [users, setUsers] = useState([])
  const [scope, setScope] = useState({ team: 'all', user: 'all' })

  useEffect(() => {
    Promise.all([
      db.from('callbacks').select('*').order('date', { ascending: false }),
      db.from('followups').select('*').order('date', { ascending: false }),
      db.from('profiles').select('*').param('full_org', 'true').order('full_name'),
    ]).then(([callbacksRes, followupsRes, usersRes]) => {
      setCallbacks(callbacksRes.data || [])
      setFollowups(followupsRes.data || [])
      setUsers(usersRes.data || [])
    })
  }, [])

  const isSuperAdmin = role === 'superadmin'
  const isAdmin = role === 'admin'
  const isRM = useMemo(() => {
    if (['recruitment_manager', 'operations_manager'].includes(role)) return true
    if (role === 'manager' && (!profile?.manager_id || users.some(u => u.manager_id === profile?.id && ['manager', 'account_manager', 'recruitment_manager'].includes(u.role)))) return true
    return false
  }, [role, profile, users])

  const isAM = useMemo(() => {
    if (role === 'account_manager') return true
    if (role === 'manager' && !isRM) return true
    return false
  }, [role, isRM])

  const canSeeFullOrg = isSuperAdmin || isAdmin
  const canSeeRM = canSeeFullOrg || isRM

  const profileTeam = profile?.team

  // When users are loaded, lock AM to their team
  useEffect(() => {
    if (isAM && profileTeam && users.length > 0) {
      setScope(current => ({ ...current, team: profileTeam }))
    }
  }, [isAM, profileTeam, users.length])

  const rangeDays = mode === 'daily' ? 1 : 7

  const allOrgUsers = useMemo(() => {
    const userMap = new Map()

    users.forEach(u => {
      if (u.id || u.full_name || u.email) {
        userMap.set(u.id || u.full_name || u.email, u)
      }
    })

    candidates.forEach(c => {
      const recName = c.recruiter_name || c.fe_name
      const recId = c.recruiter_id || c.user_id
      if (recName) {
        const existing = Array.from(userMap.values()).find(u => u.full_name === recName || u.id === recId)
        if (!existing) {
          userMap.set(recId || recName, {
            id: recId || recName,
            full_name: recName,
            email: '',
            role: 'recruiter',
            team: c.team || null
          })
        }
      }
    })

    return Array.from(userMap.values())
  }, [users, candidates])

  const rmTreeUsers = useMemo(() => {
    if (!isRM || !profile) return allOrgUsers
    const descendants = getDescendants(profile.id, allOrgUsers)
    return [profile, ...descendants]
  }, [isRM, profile, allOrgUsers])

  const scopeUsers = useMemo(() => {
    if (isAM && profile) {
      return allOrgUsers.filter(u => (profileTeam && u.team === profileTeam) || u.manager_id === profile.id || u.id === profile.id)
    }
    const baseUsers = isRM ? rmTreeUsers : allOrgUsers
    const effectiveTeam = scope.team
    if (effectiveTeam === 'all') return baseUsers
    return baseUsers.filter(u => u.team === effectiveTeam)
  }, [scope.team, allOrgUsers, rmTreeUsers, isAM, isRM, profile, profileTeam])

  // Available teams for selection
  const teams = useMemo(() => {
    const sourceUsers = isAM ? scopeUsers : (isRM ? rmTreeUsers : allOrgUsers)
    const allTeams = [...new Set(sourceUsers.map(u => u.team).filter(Boolean))].sort()
    if (isAM && profileTeam) return [profileTeam]
    return allTeams
  }, [allOrgUsers, rmTreeUsers, scopeUsers, isAM, isRM, profileTeam])

  const selectedUserDescendants = useMemo(() => {
    if (scope.user === 'all') return null
    const selected = allOrgUsers.find(u => u.id === scope.user)
    if (!selected) return { userIds: new Set([scope.user]), userNames: new Set() }
    const descendants = getDescendants(selected.id, allOrgUsers)
    const userIds = new Set([selected.id, ...descendants.map(u => u.id)])
    const userNames = new Set([selected.full_name, ...descendants.map(u => u.full_name)].filter(Boolean))
    return { userIds, userNames }
  }, [scope.user, allOrgUsers])

  const reportCandidates = useMemo(() => {
    return candidates.filter(candidate => {
      if (!isInRange(candidate.submission_date, rangeDays)) return false
      if (scope.user !== 'all' && selectedUserDescendants) {
        const { userIds, userNames } = selectedUserDescendants
        const matchesUser = userIds.has(candidate.user_id) || userIds.has(candidate.recruiter_id)
        const matchesName = userNames.has(candidate.recruiter_name) || userNames.has(candidate.fe_name)
        if (!matchesUser && !matchesName) return false
      }
      if (scope.team !== 'all') {
        const userIds = new Set(scopeUsers.map(user => user.id))
        return userIds.has(candidate.user_id) || userIds.has(candidate.recruiter_id) || scopeUsers.some(user => {
          const name = user.full_name || user.email
          return name && [candidate.recruiter_name, candidate.fe_name].includes(name)
        })
      }
      return true
    })
  }, [candidates, rangeDays, scope.team, scope.user, scopeUsers, selectedUserDescendants])

  const scopeUserIds = useMemo(() => new Set(scopeUsers.map(user => user.id)), [scopeUsers])

  const itemInScope = useCallback((item) => {
    if (scope.user !== 'all' && selectedUserDescendants) {
      return selectedUserDescendants.userIds.has(item.user_id)
    }
    if (scope.team !== 'all') return scopeUserIds.has(item.user_id)
    return true
  }, [scope.team, scope.user, selectedUserDescendants, scopeUserIds])

  const reportCallbacks = useMemo(() => {
    return callbacks.filter(callback => isInRange(callback.date, rangeDays) && itemInScope(callback))
  }, [callbacks, itemInScope, rangeDays])

  const reportFollowups = useMemo(() => {
    return followups.filter(followup => isInRange(followup.date, rangeDays) && itemInScope(followup))
  }, [followups, itemInScope, rangeDays])

  const trendData = useMemo(() => {
    return [...Array(rangeDays)].map((_, index) => {
      const date = daysAgo(rangeDays - 1 - index)
      const key = dateKey(date)
      return {
        label: mode === 'daily' ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' }),
        submissions: reportCandidates.filter(candidate => candidate.submission_date === key).length,
        callbacks: reportCallbacks.filter(callback => callback.date === key).length,
        followups: reportFollowups.filter(followup => followup.date === key).length,
      }
    })
  }, [mode, rangeDays, reportCallbacks, reportCandidates, reportFollowups])

  const pipelineData = useMemo(() => {
    return STAGES.map((stage, index) => ({
      stage: stage.replace('Interview ', ''),
      count: reportCandidates.filter(candidate => candidate.external_status === stage).length,
      color: COLORS[index % COLORS.length],
    }))
  }, [reportCandidates])

  const recruiterData = useMemo(() => {
    const byRecruiter = new Map()
    reportCandidates.forEach(candidate => {
      const name = candidate.recruiter_name || candidate.fe_name || 'Unassigned'
      const current = byRecruiter.get(name) || { name, submissions: 0, interviews: 0, hires: 0 }
      current.submissions += 1
      if (['Interview Scheduled', 'Interview Done'].includes(candidate.external_status)) current.interviews += 1
      if (candidate.external_status === 'Hired' || candidate.internal_status === 'Hired') current.hires += 1
      byRecruiter.set(name, current)
    })
    return [...byRecruiter.values()].sort((a, b) => b.submissions - a.submissions).slice(0, 8)
  }, [reportCandidates])

  const teamData = useMemo(() => {
    const sourceTeams = scope.team === 'all' ? teams : [scope.team]
    return sourceTeams.map(team => {
      const members = users.filter(user => user.team === team)
      const memberIds = new Set(members.map(user => user.id))
      const memberNames = new Set(members.map(user => user.full_name || user.email).filter(Boolean))
      const owned = reportCandidates.filter(candidate => (
        memberIds.has(candidate.user_id) ||
        memberIds.has(candidate.recruiter_id) ||
        memberNames.has(candidate.recruiter_name) ||
        memberNames.has(candidate.fe_name)
      ))
      return {
        team,
        members: members.length,
        managers: members.filter(user => user.role === 'manager').length,
        submissions: owned.length,
        interviews: owned.filter(c => ['Interview Scheduled', 'Interview Done'].includes(c.external_status)).length,
        hires: owned.filter(c => c.external_status === 'Hired' || c.internal_status === 'Hired').length,
      }
    }).filter(row => row.team)
  }, [reportCandidates, scope.team, teams, users])

  const selectedUser = users.find(user => user.id === scope.user)
  const selectedTeam = scope.team === 'all' ? 'All teams' : scope.team
  const scopeLabel = scope.user !== 'all'
    ? (selectedUser?.full_name || selectedUser?.email || 'Selected user')
    : selectedTeam

  const metrics = [
    { label: 'Submissions', value: reportCandidates.length, helper: `${mode === 'daily' ? 'today' : 'last 7 days'}`, tone: 'blue' },
    { label: 'Interviews', value: reportCandidates.filter(c => ['Interview Scheduled', 'Interview Done'].includes(c.external_status)).length, helper: 'client movement', tone: 'purple' },
    { label: 'Offers/Hires', value: reportCandidates.filter(c => ['Offer Extended', 'Hired'].includes(c.external_status)).length, helper: 'late-stage wins', tone: 'green' },
    { label: 'Team Members', value: scopeUsers.length, helper: scopeLabel, tone: 'yellow' },
    { label: 'Callbacks', value: reportCallbacks.length, helper: 'logged contacts', tone: 'orange' },
    { label: 'Follow-ups', value: reportFollowups.length, helper: 'scheduled actions', tone: 'red' },
  ]

  const exportReport = () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(metrics), 'Summary')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pipelineData), 'Pipeline')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(recruiterData), 'Recruiters')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(teamData), 'Teams')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportCallbacks), 'Callbacks')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportFollowups), 'Followups')
    XLSX.writeFile(workbook, `talentdesk_${mode}_${scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_report_${dateKey(new Date())}.xlsx`)
  }

  return (
    <div className="reports-page">
      <header className="reports-hero">
        <div>
          <p>Reports Studio</p>
          <h1>{mode === 'daily' ? 'Daily' : 'Weekly'} performance report</h1>
          <span>
            {canSeeFullOrg
              ? 'Org-wide hiring analytics — filter by team or individual recruiter.'
              : isAM
                ? `Showing your team: ${profile?.team || 'your team'}`
                : 'Your personal performance summary.'}
          </span>
        </div>
        <div className="reports-actions">
          <div className="reports-mode-toggle">
            <button className={mode === 'daily' ? 'active' : ''} onClick={() => setMode('daily')} type="button">Daily</button>
            <button className={mode === 'weekly' ? 'active' : ''} onClick={() => setMode('weekly')} type="button">Weekly</button>
          </div>
          {canSeeRM && (
            <SearchableSelect
              options={teams}
              value={scope.team}
              onChange={selectedTeam => setScope({ team: selectedTeam, user: 'all' })}
              allLabel="All Teams"
              placeholder="Type team name..."
              icon="🏢"
              fullWidth={false}
            />
          )}
          {isAM && (
            <span style={{ background: 'rgba(245,200,66,0.15)', color: '#f5c842', border: '1px solid rgba(245,200,66,0.3)', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, letterSpacing: '0.3px' }}>
              🔒 {profile?.team || 'Your Team'}
            </span>
          )}
          {(canSeeRM || isAM) && (
            <SearchableSelect
              options={scopeUsers}
              value={scope.user}
              onChange={selectedId => setScope(current => ({ ...current, user: selectedId }))}
              allLabel={isAM ? "All Team Recruiters" : "All Recruiters"}
              placeholder="Type recruiter name..."
              icon="👤"
              fullWidth={false}
            />
          )}
          <button className="reports-export-btn" onClick={exportReport} type="button">Export XLSX</button>
        </div>
      </header>

      <section className="reports-metric-grid">
        {metrics.map(metric => (
          <article className={`reports-metric-card ${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.helper}</small>
          </article>
        ))}
      </section>

      <section className="reports-grid">
        <ReportPanel title="Activity Trend" subtitle="Submissions, callbacks, and follow-ups by day">
          <div className="reports-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <CartesianGrid stroke="rgba(139,145,168,0.18)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#8b91a8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#8b91a8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Area type="monotone" dataKey="submissions" stroke="#4f7cff" fill="#4f7cff33" strokeWidth={2} />
                <Area type="monotone" dataKey="callbacks" stroke="#2ecc8f" fill="#2ecc8f24" strokeWidth={2} />
                <Area type="monotone" dataKey="followups" stroke="#ff8c42" fill="#ff8c4224" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ReportPanel>

        <ReportPanel title="Pipeline Movement" subtitle="External client stages for selected period">
          <div className="reports-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(139,145,168,0.18)" vertical={false} />
                <XAxis dataKey="stage" interval={0} angle={-35} textAnchor="end" height={50} tick={{ fill: '#8b91a8', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#8b91a8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {pipelineData.map(item => <Cell key={item.stage} fill={item.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ReportPanel>

        <ReportPanel title="Recruiter Output" subtitle="Submissions, interviews, and hires">
          <div className="reports-table">
            {recruiterData.length === 0 ? <div className="reports-empty">No recruiter activity in this period</div> : recruiterData.map(row => (
              <div className="reports-table-row" key={row.name}>
                <strong>{row.name}</strong>
                <span>{row.submissions} submissions</span>
                <span>{row.interviews} interviews</span>
                <span>{row.hires} hires</span>
              </div>
            ))}
          </div>
        </ReportPanel>

        <ReportPanel title="Team Performance" subtitle="Submissions and outcomes by team">
          <div className="reports-chart">
            {teamData.length === 0 ? <div className="reports-empty">Assign users to teams in Admin to unlock team reporting</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={teamData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(139,145,168,0.18)" vertical={false} />
                  <XAxis dataKey="team" interval={0} angle={-35} textAnchor="end" height={50} tick={{ fill: '#8b91a8', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#8b91a8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                  <Bar dataKey="submissions" fill="#4f7cff" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="interviews" fill="#7c5cff" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="hires" fill="#2ecc8f" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ReportPanel>
      </section>

      <section className="reports-activity-card">
        <div className="reports-activity-header">
          <h2>Team & User Breakdown</h2>
          <p>Real-time team headcount, leadership distribution, and hiring yield benchmarks.</p>
        </div>
        <div className="reports-activity-list">
          {teamData.length === 0 ? (
            <div className="reports-empty">No team structure found yet</div>
          ) : (
            [...teamData]
              .sort((a, b) => b.submissions - a.submissions)
              .map((item, index) => {
                const conversionRate = item.submissions > 0 ? Math.round((item.hires / item.submissions) * 100) : 0
                const isTopTeam = index === 0 && item.submissions > 0
                const badgeColor = TEAM_BADGE_COLORS[index % TEAM_BADGE_COLORS.length]
                return (
                  <div className="reports-team-breakdown-card" key={item.team}>
                    <div className="reports-team-info">
                      <div className={`reports-team-icon-badge ${badgeColor}`}>
                        {item.team.charAt(0).toUpperCase()}
                      </div>
                      <div className="reports-team-details">
                        <div className="reports-team-name-row">
                          <h3 className="reports-team-name">{item.team}</h3>
                          {isTopTeam && <span className="reports-team-badge">🏆 Top team</span>}
                        </div>
                        <div className="reports-team-subtext">
                          <span>👥 <b>{item.members}</b> {item.members === 1 ? 'member' : 'members'}</span>
                          <span className="dot-sep">•</span>
                          <span>👤 <b>{item.managers}</b> {item.managers === 1 ? 'manager' : 'managers'}</span>
                        </div>
                        <div className="reports-team-conversion">
                          <div className="reports-team-conversion-track">
                            <div className="reports-team-conversion-fill" style={{ width: `${Math.min(conversionRate, 100)}%` }} />
                          </div>
                          <span className="reports-team-conversion-label">{conversionRate}% hire rate</span>
                        </div>
                      </div>
                    </div>

                    <div className="reports-team-metrics-pills">
                      <div className="team-metric-pill blue">
                        <span className="pill-num">{item.submissions}</span>
                        <span className="pill-label">Submissions</span>
                      </div>
                      <div className="team-metric-pill purple">
                        <span className="pill-num">{item.interviews}</span>
                        <span className="pill-label">Interviews</span>
                      </div>
                      <div className="team-metric-pill green">
                        <span className="pill-num">{item.hires}</span>
                        <span className="pill-label">{item.hires === 1 ? 'Hire' : 'Hires'}</span>
                      </div>
                    </div>
                  </div>
                )
              })
          )}
        </div>
      </section>
    </div>
  )
}

function ReportPanel({ title, subtitle, children }) {
  return (
    <article className="reports-panel">
      <div className="reports-panel-head">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {children}
    </article>
  )
}

const tooltipStyle = {
  background: '#161922',
  border: '1px solid #2c3148',
  borderRadius: 8,
  color: '#e8eaf2',
}

const tooltipLabelStyle = { color: '#e8eaf2', fontWeight: 700 }
const tooltipItemStyle = { color: '#e8eaf2' }
