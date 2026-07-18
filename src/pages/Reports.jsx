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

const COLORS = ['#4f7cff', '#2ecc8f', '#7c5cff', '#f5c842', '#ff8c42', '#ff4d6a']
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

export default function Reports() {
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
      db.from('profiles').select('*').order('full_name'),
    ]).then(([callbacksRes, followupsRes, usersRes]) => {
      setCallbacks(callbacksRes.data || [])
      setFollowups(followupsRes.data || [])
      setUsers(usersRes.data || [])
    })
  }, [])

  const rangeDays = mode === 'daily' ? 1 : 7
  const teams = useMemo(() => [...new Set(users.map(user => user.team).filter(Boolean))].sort(), [users])
  const scopeUsers = useMemo(() => {
    return users.filter(user => scope.team === 'all' || user.team === scope.team)
  }, [scope.team, users])

  const reportCandidates = useMemo(() => {
    return candidates.filter(candidate => {
      if (!isInRange(candidate.submission_date, rangeDays)) return false
      if (scope.user !== 'all') {
        return candidate.user_id === scope.user || candidate.recruiter_id === scope.user
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
  }, [candidates, rangeDays, scope.team, scope.user, scopeUsers])

  const scopeUserIds = useMemo(() => new Set(scopeUsers.map(user => user.id)), [scopeUsers])

  const itemInScope = useCallback((item) => {
    if (scope.user !== 'all') return item.user_id === scope.user
    if (scope.team !== 'all') return scopeUserIds.has(item.user_id)
    return true
  }, [scope.team, scope.user, scopeUserIds])

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
          <span>Generate leadership-ready hiring reports by organization, team, manager, or individual recruiter.</span>
        </div>
        <div className="reports-actions">
          <div className="reports-mode-toggle">
            <button className={mode === 'daily' ? 'active' : ''} onClick={() => setMode('daily')} type="button">Daily</button>
            <button className={mode === 'weekly' ? 'active' : ''} onClick={() => setMode('weekly')} type="button">Weekly</button>
          </div>
          <select value={scope.team} onChange={e => setScope({ team: e.target.value, user: 'all' })}>
            <option value="all">All Teams</option>
            {teams.map(team => <option key={team} value={team}>{team}</option>)}
          </select>
          <select value={scope.user} onChange={e => setScope(current => ({ ...current, user: e.target.value }))}>
            <option value="all">All Users</option>
            {scopeUsers.map(user => <option key={user.id} value={user.id}>{user.full_name || user.email}</option>)}
          </select>
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
              <BarChart data={pipelineData}>
                <CartesianGrid stroke="rgba(139,145,168,0.18)" vertical={false} />
                <XAxis dataKey="stage" tick={{ fill: '#8b91a8', fontSize: 10 }} axisLine={false} tickLine={false} />
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
                <BarChart data={teamData}>
                  <CartesianGrid stroke="rgba(139,145,168,0.18)" vertical={false} />
                  <XAxis dataKey="team" tick={{ fill: '#8b91a8', fontSize: 10 }} axisLine={false} tickLine={false} />
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
        <div>
          <h2>Team & User Breakdown</h2>
          <p>Use Admin Panel to edit teams, managers, departments, and member ownership.</p>
        </div>
        <div className="reports-activity-list">
          {teamData.length === 0 ? <div className="reports-empty">No team structure found yet</div> : teamData.map(item => (
            <div className="reports-activity-row" key={item.team}>
              <span>{item.team.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{item.team}</strong>
                <small>{item.members} members - {item.managers} managers - {item.submissions} submissions - {item.interviews} interviews - {item.hires} hires</small>
              </div>
            </div>
          ))}
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
