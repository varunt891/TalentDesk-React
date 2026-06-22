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
import { db } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useCandidates } from '../hooks/useCandidates'

const STAGES = ['Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired', 'Rejected']
const COLORS = ['#4f7cff', '#ff8c42', '#7c5cff', '#60a5fa', '#f5c842', '#2ecc8f', '#ff4d6a']

export default function Dashboard({ onNavigate }) {
  const { profile } = useAuth()
  const { candidates } = useCandidates()
  const [jobs, setJobs] = useState([])
  const [callbacks, setCallbacks] = useState([])
  const [followups, setFollowups] = useState([])
  const [activity, setActivity] = useState([])
  const [timeRange, setTimeRange] = useState('all')
  const [scratchpad, setScratchpad] = useState(() => localStorage.getItem('td_scratchpad') || '')

  const handleScratchpadChange = (e) => {
    setScratchpad(e.target.value)
    localStorage.setItem('td_scratchpad', e.target.value)
  }

  const upcomingInterviews = useMemo(() => {
    return candidates
      .filter(c => c.internal_status === 'Interview Scheduled' && c.interview_date)
      .map(c => ({
        id: c.id,
        candidate_name: `${c.first_name} ${c.last_name}`,
        date: c.interview_date,
        type: c.interview_type || 'Zoom',
        job_title: c.job_title || 'Software Engineer',
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 4)
  }, [candidates])

  const fetchDashboardData = () => {
    Promise.all([
      db.from('jobs').select('*').order('created_at', { ascending: false }),
      db.from('callbacks').select('*').order('date', { ascending: true }),
      db.from('followups').select('*').order('date', { ascending: true }),
      db.from('activity_logs').select('*').order('created_at', { ascending: false }),
    ]).then(([jobsRes, callbacksRes, followupsRes, activityRes]) => {
      setJobs(jobsRes.data || [])
      setCallbacks(callbacksRes.data || [])
      setFollowups(followupsRes.data || [])
      setActivity((activityRes.data || []).slice(0, 12))
    })
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const handleCompleteCallback = async (id) => {
    try {
      const { error } = await db.from('callbacks').update({ status: 'done' }).eq('id', id)
      if (!error) {
        setCallbacks(prev => prev.map(c => c.id === id ? { ...c, status: 'done' } : c))
      }
    } catch (err) {
      console.error('Error completing callback:', err)
    }
  }

  const handleCompleteFollowup = async (id) => {
    try {
      const { error } = await db.from('followups').update({ status: 'done' }).eq('id', id)
      if (!error) {
        setFollowups(prev => prev.map(f => f.id === id ? { ...f, status: 'done' } : f))
      }
    } catch (err) {
      console.error('Error completing followup:', err)
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const month = today.slice(0, 7)
  const role = profile?.role || 'recruiter'

  // Time-range filtered data
  const filteredCandidates = useMemo(() => {
    if (timeRange === 'all') return candidates
    const cutoff = new Date()
    if (timeRange === '7d') cutoff.setDate(cutoff.getDate() - 7)
    else if (timeRange === '30d') cutoff.setDate(cutoff.getDate() - 30)
    else if (timeRange === '90d') cutoff.setDate(cutoff.getDate() - 90)

    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return candidates.filter(c => c.submission_date && c.submission_date >= cutoffStr)
  }, [candidates, timeRange])

  const filteredFollowups = useMemo(() => {
    if (timeRange === 'all') return followups
    const cutoff = new Date()
    if (timeRange === '7d') cutoff.setDate(cutoff.getDate() - 7)
    else if (timeRange === '30d') cutoff.setDate(cutoff.getDate() - 30)
    else if (timeRange === '90d') cutoff.setDate(cutoff.getDate() - 90)

    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return followups.filter(f => f.date && f.date >= cutoffStr)
  }, [followups, timeRange])

  const pipelineData = useMemo(() => {
    return STAGES.map((stage, index) => ({
      stage: stage.replace('Interview ', ''),
      count: filteredCandidates.filter(c => c.external_status === stage).length,
      color: COLORS[index],
    }))
  }, [filteredCandidates])

  const recruiterData = useMemo(() => {
    const byName = new Map()
    filteredCandidates.forEach(candidate => {
      const name = candidate.recruiter_name || candidate.fe_name || 'Unassigned'
      const current = byName.get(name) || { name, submissions: 0, hires: 0, interviews: 0 }
      current.submissions += 1
      if (candidate.internal_status === 'Hired') current.hires += 1
      if (['Interview Scheduled', 'Interview Done'].includes(candidate.internal_status)) current.interviews += 1
      byName.set(name, current)
    })
    const sortedList = [...byName.values()].sort((a, b) => b.submissions - a.submissions).slice(0, 6)
    const maxSubmissions = sortedList.length > 0 ? sortedList[0].submissions : 1
    return sortedList.map(item => ({
      ...item,
      percentage: Math.round((item.submissions / maxSubmissions) * 100),
    }))
  }, [filteredCandidates])

  const trendData = useMemo(() => {
    const rangeLength = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 7
    return [...Array(rangeLength)].map((_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - (rangeLength - 1 - index))
      const key = date.toISOString().slice(0, 10)
      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        submissions: filteredCandidates.filter(c => c.submission_date === key).length,
        followups: filteredFollowups.filter(f => f.date === key).length,
      }
    })
  }, [filteredCandidates, filteredFollowups, timeRange])

  const sourceData = useMemo(() => {
    return [
      { name: 'Open', value: jobs.filter(j => j.status === 'Open').length },
      { name: 'On Hold', value: jobs.filter(j => j.status === 'On Hold').length },
      { name: 'Filled', value: jobs.filter(j => j.status === 'Filled').length },
      { name: 'Closed', value: jobs.filter(j => j.status === 'Closed').length },
    ].filter(item => item.value > 0)
  }, [jobs])

  const pendingCallbacks = callbacks.filter(c => c.status === 'pending')
  const dueFollowups = followups.filter(f => f.status !== 'done')
  const todaysCallbacks = pendingCallbacks.filter(c => c.date === today)
  const overdueFollowups = dueFollowups.filter(f => f.date && f.date < today)

  const activeJobsCount = useMemo(() => jobs.filter(j => j.status === 'Open').length, [jobs])

  const stats = [
    { label: 'Candidates', value: filteredCandidates.length, helper: `${filteredCandidates.filter(c => c.submission_date?.startsWith(month)).length} this month`, tone: 'blue' },
    { label: 'Open jobs', value: activeJobsCount, helper: `${jobs.length} total jobs`, tone: 'green' },
    { label: 'Interviews', value: filteredCandidates.filter(c => ['Interview Scheduled', 'Interview Done'].includes(c.internal_status)).length, helper: 'scheduled or completed', tone: 'purple' },
    { label: 'Hires', value: filteredCandidates.filter(c => c.internal_status === 'Hired').length, helper: 'all-time placements', tone: 'yellow' },
    { label: 'Callbacks', value: pendingCallbacks.length, helper: `${todaysCallbacks.length} today`, tone: 'orange' },
    { label: 'Follow-ups', value: dueFollowups.length, helper: `${overdueFollowups.length} overdue`, tone: 'red' },
  ]

  return (
    <div className="dashboard-page">
      <header className="dashboard-hero">
        <div className="dashboard-welcome-panel">
          <div>
            <p className="dashboard-kicker">{profile?.organizations?.name || 'TalentDesk'} workspace</p>
            <h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {profile?.full_name?.split(' ')[0] || 'there'}</h1>
            <p>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · <span>{role}</span></p>
          </div>
          <div className="time-range-selector">
            {[
              { id: '7d', label: '7 Days' },
              { id: '30d', label: '30 Days' },
              { id: '90d', label: '90 Days' },
              { id: 'all', label: 'All Time' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setTimeRange(tab.id)}
                className={`time-range-tab ${timeRange === tab.id ? 'active' : ''}`}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="dashboard-hero-panel">
          <span>Pipeline health</span>
          <strong>{Math.round((filteredCandidates.filter(c => ['Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired'].includes(c.internal_status)).length / Math.max(filteredCandidates.length, 1)) * 100)}%</strong>
          <small>qualified progress rate</small>
        </div>
      </header>

      {/* Quick Action Navigation Center */}
      <section className="dashboard-quick-actions">
        <div className="quick-actions-grid">
          {[
            { id: 'candidates', label: 'Candidates', desc: 'Browse & search profiles', icon: '👥', tone: 'blue' },
            { id: 'pipeline', label: 'Pipeline', desc: 'Manage hiring stages', icon: '🚦', tone: 'purple' },
            { id: 'jobs', label: 'Jobs Requisitions', desc: 'Track active job openings', icon: '💼', tone: 'green' },
            { id: 'callbacks', label: 'Callbacks Center', desc: 'Manage callbacks log', icon: '📞', tone: 'orange' },
          ].map(action => (
            <button
              key={action.id}
              onClick={() => onNavigate(action.id)}
              className={`quick-action-card ${action.tone}`}
              type="button"
            >
              <span className="quick-action-icon">{action.icon}</span>
              <div className="quick-action-copy">
                <strong>{action.label}</strong>
                <small>{action.desc}</small>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="dashboard-stat-grid">
        {stats.map(stat => (
          <article className={`dashboard-stat ${stat.tone}`} key={stat.label}>
            <div className="stat-content">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.helper}</small>
            </div>
            <div className="stat-decorator" aria-hidden="true" />
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-column">
          <Panel title="Pipeline Funnel" subtitle="Candidates by current stage">
            <div className="dashboard-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineData}>
                  <CartesianGrid stroke="rgba(139,145,168,0.18)" vertical={false} />
                  <XAxis dataKey="stage" tick={{ fill: '#8b91a8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#8b91a8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ fill: 'rgba(79,124,255,0.08)' }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} activeBar={{ fillOpacity: 0.88, stroke: '#e8eaf2', strokeWidth: 1 }}>
                    {pipelineData.map(item => <Cell key={item.stage} fill={item.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Recruiter Leaderboard" subtitle="Top performers by submission rate">
            <div className="dashboard-report-list">
              {recruiterData.length === 0 ? <EmptyLine text="No recruiter submissions in this period" /> : recruiterData.map((row, index) => {
                const medals = ['🥇', '🥈', '🥉']
                const rankDisplay = index < 3 ? medals[index] : `#${index + 1}`
                return (
                  <div className="dashboard-report-row visual-leaderboard" key={row.name}>
                    <div className="leaderboard-rank">{rankDisplay}</div>
                    <div className="leaderboard-details">
                      <div className="leaderboard-meta">
                        <strong>{row.name}</strong>
                        <small>{row.interviews} interviews · {row.hires} hires</small>
                      </div>
                      <div className="leaderboard-progress-container">
                        <div className="leaderboard-progress-bar" style={{ width: `${row.percentage}%` }} />
                      </div>
                    </div>
                    <b className="leaderboard-value">{row.submissions}</b>
                  </div>
                )
              })}
            </div>
          </Panel>

          <Panel title="Activity Feed" subtitle="Latest changes across your visible workspace">
            <div className="dashboard-activity">
              {activity.length === 0 ? <EmptyLine text="No activity yet" /> : activity.map(item => (
                <div className="dashboard-activity-row" key={item.id}>
                  <span>{item.action?.[0]?.toUpperCase()}</span>
                  <div>
                    <strong>{item.summary || item.entity}</strong>
                    <small>{item.actor_name || 'System'} {item.action} {item.entity?.replace('_', ' ')} · {formatTime(item.created_at)}</small>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="dashboard-column">
          <Panel title={`${timeRange === '7d' ? '7-Day' : timeRange === '30d' ? '30-Day' : timeRange === '90d' ? '90-Day' : '7-Day'} Activity`} subtitle="Submissions and follow-ups">
            <div className="dashboard-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="submissions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f7cff" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#4f7cff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="followups" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2ecc8f" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#2ecc8f" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(139,145,168,0.18)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#8b91a8', fontSize: 10 }} axisLine={false} tickLine={false} interval={timeRange === '90d' ? 14 : timeRange === '30d' ? 4 : 0} />
                  <YAxis tick={{ fill: '#8b91a8', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                  <Area type="monotone" dataKey="submissions" stroke="#4f7cff" fill="url(#submissions)" strokeWidth={2} />
                  <Area type="monotone" dataKey="followups" stroke="#2ecc8f" fill="url(#followups)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Job Mix Requisitions" subtitle="Distribution of jobs by status">
            <div className="dashboard-donut">
              {sourceData.length === 0 ? <EmptyLine text="No job data yet" /> : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sourceData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={80} paddingAngle={4}>
                        {sourceData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center-label">
                    <strong>{activeJobsCount}</strong>
                    <span>Active Jobs</span>
                  </div>
                </>
              )}
            </div>
          </Panel>

          <Panel title="Action Center (Today's Tasks)" subtitle="Complete callbacks and follow-ups inline">
            <div className="dashboard-work-list interactive-action-list">
              {[...todaysCallbacks.slice(0, 4), ...overdueFollowups.slice(0, 4)].length === 0 ? (
                <EmptyLine text="All callbacks and follow-ups completed!" />
              ) : (
                <>
                  {todaysCallbacks.slice(0, 4).map(item => (
                    <div className="action-task-card yellow" key={`c-${item.id}`}>
                      <div className="task-content">
                        <strong>📞 Callback: {item.candidate_name}</strong>
                        <small>{item.time || 'Schedule'} · {item.phone || 'No phone'}</small>
                      </div>
                      <div className="task-actions">
                        {item.phone && (
                          <a href={`tel:${item.phone}`} className="task-action-btn phone-btn" title="Call candidate">
                            📞
                          </a>
                        )}
                        <button onClick={() => handleCompleteCallback(item.id)} className="task-action-btn check-btn" title="Mark Done" type="button">
                          ✓
                        </button>
                      </div>
                    </div>
                  ))}
                  {overdueFollowups.slice(0, 4).map(item => (
                    <div className="action-task-card red" key={`f-${item.id}`}>
                      <div className="task-content">
                        <strong>🔔 Follow-up: {item.candidate_name}</strong>
                        <small>{item.date} · {item.priority || 'Medium'} priority</small>
                      </div>
                      <div className="task-actions">
                        <button onClick={() => handleCompleteFollowup(item.id)} className="task-action-btn check-btn" title="Mark Done" type="button">
                          ✓
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Panel>

          <Panel title="Upcoming Interviews" subtitle="Scheduled candidate syncs and meetings">
            <div className="dashboard-work-list">
              {upcomingInterviews.length === 0 ? (
                <EmptyLine text="No interviews scheduled right now" />
              ) : (
                upcomingInterviews.map(item => (
                  <div className="interview-task-card" key={item.id}>
                    <div className="interview-badge">
                      <span>{new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div className="task-content">
                      <strong>{item.candidate_name}</strong>
                      <small>{item.job_title} · {item.type}</small>
                    </div>
                    <button onClick={() => onNavigate('candidates')} className="task-action-btn view-btn" title="View Candidate Profile" type="button">
                      👁️
                    </button>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="Workspace Notepad" subtitle="Temporary thoughts & call notes (autosaved)">
            <textarea
              value={scratchpad}
              onChange={handleScratchpadChange}
              placeholder="Type quick reminders, candidate numbers, or call snippets here..."
              className="dashboard-scratchpad"
            />
          </Panel>
        </div>
      </section>
    </div>
  )
}

function Panel({ title, subtitle, children, wide }) {
  return (
    <article className={`dashboard-panel ${wide ? 'wide' : ''}`}>
      <div className="dashboard-panel-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </article>
  )
}

function WorkItem({ title, meta, tone }) {
  return (
    <div className={`dashboard-work-item ${tone}`}>
      <strong>{title || 'Untitled'}</strong>
      <small>{meta}</small>
    </div>
  )
}

function EmptyLine({ text }) {
  return <div className="dashboard-empty-line">{text}</div>
}

function formatTime(value) {
  if (!value) return 'recently'
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const tooltipStyle = {
  background: '#161922',
  border: '1px solid #2c3148',
  borderRadius: 8,
  color: '#e8eaf2',
  boxShadow: '0 14px 40px rgba(0,0,0,0.28)',
}

const tooltipLabelStyle = {
  color: '#e8eaf2',
  fontWeight: 700,
}

const tooltipItemStyle = {
  color: '#e8eaf2',
}
