import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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
  const [jobs, setJobs] = useState([])
  const [callbacks, setCallbacks] = useState([])
  const [followups, setFollowups] = useState([])
  const [activity, setActivity] = useState([])

  useEffect(() => {
    Promise.all([
      db.from('jobs').select('*').order('created_at', { ascending: false }),
      db.from('callbacks').select('*').order('date', { ascending: false }),
      db.from('followups').select('*').order('date', { ascending: false }),
      db.from('activity_logs').select('*').order('created_at', { ascending: false }),
    ]).then(([jobsRes, callbacksRes, followupsRes, activityRes]) => {
      setJobs(jobsRes.data || [])
      setCallbacks(callbacksRes.data || [])
      setFollowups(followupsRes.data || [])
      setActivity((activityRes.data || []).slice(0, 20))
    })
  }, [])

  const rangeDays = mode === 'daily' ? 1 : 7
  const reportCandidates = useMemo(
    () => candidates.filter(candidate => isInRange(candidate.submission_date, rangeDays)),
    [candidates, rangeDays],
  )

  const trendData = useMemo(() => {
    return [...Array(rangeDays)].map((_, index) => {
      const date = daysAgo(rangeDays - 1 - index)
      const key = dateKey(date)
      return {
        label: mode === 'daily' ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' }),
        submissions: candidates.filter(candidate => candidate.submission_date === key).length,
        callbacks: callbacks.filter(callback => callback.date === key).length,
        followups: followups.filter(followup => followup.date === key).length,
      }
    })
  }, [callbacks, candidates, followups, mode, rangeDays])

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

  const jobMix = useMemo(() => {
    return ['Open', 'On Hold', 'Filled', 'Closed']
      .map(status => ({ name: status, value: jobs.filter(job => job.status === status).length }))
      .filter(item => item.value > 0)
  }, [jobs])

  const metrics = [
    { label: 'Submissions', value: reportCandidates.length, helper: `${mode === 'daily' ? 'today' : 'last 7 days'}`, tone: 'blue' },
    { label: 'Interviews', value: reportCandidates.filter(c => ['Interview Scheduled', 'Interview Done'].includes(c.external_status)).length, helper: 'client movement', tone: 'purple' },
    { label: 'Offers/Hires', value: reportCandidates.filter(c => ['Offer Extended', 'Hired'].includes(c.external_status)).length, helper: 'late-stage wins', tone: 'green' },
    { label: 'Open Jobs', value: jobs.filter(job => job.status === 'Open').length, helper: `${jobs.length} total roles`, tone: 'yellow' },
    { label: 'Callbacks', value: callbacks.filter(callback => isInRange(callback.date, rangeDays)).length, helper: 'logged contacts', tone: 'orange' },
    { label: 'Follow-ups', value: followups.filter(followup => isInRange(followup.date, rangeDays)).length, helper: 'scheduled actions', tone: 'red' },
  ]

  const exportReport = () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(metrics), 'Summary')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pipelineData), 'Pipeline')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(recruiterData), 'Recruiters')
    XLSX.writeFile(workbook, `talentdesk_${mode}_report_${dateKey(new Date())}.xlsx`)
  }

  return (
    <div className="reports-page">
      <header className="reports-hero">
        <div>
          <p>Reports Studio</p>
          <h1>{mode === 'daily' ? 'Daily' : 'Weekly'} performance report</h1>
          <span>Generate leadership-ready hiring reports with submissions, pipeline movement, recruiter output, and task activity.</span>
        </div>
        <div className="reports-actions">
          <div className="reports-mode-toggle">
            <button className={mode === 'daily' ? 'active' : ''} onClick={() => setMode('daily')} type="button">Daily</button>
            <button className={mode === 'weekly' ? 'active' : ''} onClick={() => setMode('weekly')} type="button">Weekly</button>
          </div>
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

        <ReportPanel title="Job Status Mix" subtitle="Current requisition distribution">
          <div className="reports-donut">
            {jobMix.length === 0 ? <div className="reports-empty">No job status data yet</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={jobMix} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={4}>
                    {jobMix.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </ReportPanel>
      </section>

      <section className="reports-activity-card">
        <div>
          <h2>Report Notes</h2>
          <p>Recent workspace activity included in the reporting period.</p>
        </div>
        <div className="reports-activity-list">
          {activity.length === 0 ? <div className="reports-empty">No activity logged yet</div> : activity.slice(0, 8).map(item => (
            <div className="reports-activity-row" key={item.id}>
              <span>{item.action?.slice(0, 1)?.toUpperCase() || 'A'}</span>
              <div>
                <strong>{item.summary || `${item.action} ${item.entity}`}</strong>
                <small>{item.actor_name || 'System'} - {formatDate(item.created_at)}</small>
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

function formatDate(value) {
  if (!value) return 'recently'
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const tooltipStyle = {
  background: '#161922',
  border: '1px solid #2c3148',
  borderRadius: 8,
  color: '#e8eaf2',
}

const tooltipLabelStyle = { color: '#e8eaf2', fontWeight: 700 }
const tooltipItemStyle = { color: '#e8eaf2' }
