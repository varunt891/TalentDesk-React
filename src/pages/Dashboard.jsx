import { useEffect, useMemo, useState, useRef } from 'react'
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

const getTrend = (curr, prev) => {
  if (prev === 0 && curr === 0) return null
  if (prev === 0) return curr > 0 ? { dir: 'up', pct: null } : null
  const pct = Math.round(((curr - prev) / prev) * 100)
  return { dir: pct >= 0 ? 'up' : 'down', pct: Math.abs(pct) }
}

export default function Dashboard({ onNavigate }) {
  const { profile } = useAuth()
  const { candidates } = useCandidates()
  const [jobs, setJobs] = useState([])
  const [callbacks, setCallbacks] = useState([])
  const [followups, setFollowups] = useState([])
  const [activity, setActivity] = useState([])
  const [profiles, setProfiles] = useState([])
  const [timeRange, setTimeRange] = useState('all')
  const [stageFilter, setStageFilter] = useState('All')
  const [selectedOwners, setSelectedOwners] = useState([])
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false)
  const [recruiterSearch, setRecruiterSearch] = useState('')
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowOwnerDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!showOwnerDropdown) {
      setRecruiterSearch('')
    }
  }, [showOwnerDropdown])

  const [jobStatusFilter, setJobStatusFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
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
      db.from('profiles').select('*').order('full_name'),
    ]).then(([jobsRes, callbacksRes, followupsRes, activityRes, profilesRes]) => {
      setJobs(jobsRes.data || [])
      setCallbacks(callbacksRes.data || [])
      setFollowups(followupsRes.data || [])
      setActivity((activityRes.data || []).slice(0, 12))
      setProfiles(profilesRes.data || [])
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
    let list = candidates
    if (timeRange !== 'all') {
      const cutoff = new Date()
      if (timeRange === '7d') cutoff.setDate(cutoff.getDate() - 7)
      else if (timeRange === '30d') cutoff.setDate(cutoff.getDate() - 30)
      else if (timeRange === '90d') cutoff.setDate(cutoff.getDate() - 90)

      const cutoffStr = cutoff.toISOString().slice(0, 10)
      list = list.filter(c => c.submission_date && c.submission_date >= cutoffStr)
    }
    if (stageFilter !== 'All') list = list.filter(c => (c.external_status || c.internal_status || 'Unassigned') === stageFilter)
    if (selectedOwners.length > 0) {
      list = list.filter(c => {
        const key = c.recruiter_id || c.user_id || c.recruiter_name || c.fe_name || 'Unassigned'
        return selectedOwners.includes(key)
      })
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(c => 
        `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.job_title && c.job_title.toLowerCase().includes(q)) ||
        (c.client && c.client.toLowerCase().includes(q)) ||
        (c.recruiter_name && c.recruiter_name.toLowerCase().includes(q)) ||
        (c.fe_name && c.fe_name.toLowerCase().includes(q))
      )
    }
    return list
  }, [candidates, selectedOwners, stageFilter, timeRange, searchQuery])

  const filteredJobs = useMemo(() => {
    let list = jobs
    if (jobStatusFilter !== 'All') list = list.filter(job => (job.status || 'Unassigned') === jobStatusFilter)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(j => 
        (j.title && j.title.toLowerCase().includes(q)) ||
        (j.client && j.client.toLowerCase().includes(q)) ||
        (j.job_id && j.job_id.toLowerCase().includes(q))
      )
    }
    return list
  }, [jobStatusFilter, jobs, searchQuery])

  const ownerOptions = useMemo(() => {
    const owners = new Map()
    profiles
      .filter(user => user.role === 'recruiter' && user.department === 'Recruiting')
      .forEach(user => owners.set(user.id, user.full_name || user.email))
    candidates.forEach(candidate => {
      const key = candidate.recruiter_id || candidate.user_id || candidate.recruiter_name || candidate.fe_name
      const label = candidate.recruiter_name || candidate.fe_name || owners.get(key)
      if (key && label) owners.set(key, label)
    })
    return [...owners.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [candidates, profiles])

  const filteredRecruiterOptions = useMemo(() => {
    if (!recruiterSearch) return ownerOptions
    const q = recruiterSearch.toLowerCase()
    return ownerOptions.filter(opt => opt[1].toLowerCase().includes(q))
  }, [ownerOptions, recruiterSearch])

  const stageOptions = useMemo(() => {
    const stages = new Set(['All', ...STAGES])
    candidates.forEach(candidate => {
      if (candidate.external_status) stages.add(candidate.external_status)
      else if (candidate.internal_status) stages.add(candidate.internal_status)
    })
    return [...stages]
  }, [candidates])

  const jobStatusOptions = useMemo(() => {
    const statuses = new Set(['All'])
    jobs.forEach(job => statuses.add(job.status || 'Unassigned'))
    return [...statuses]
  }, [jobs])

  const filteredFollowups = useMemo(() => {
    if (timeRange === 'all') return followups
    const cutoff = new Date()
    if (timeRange === '7d') cutoff.setDate(cutoff.getDate() - 7)
    else if (timeRange === '30d') cutoff.setDate(cutoff.getDate() - 30)
    else if (timeRange === '90d') cutoff.setDate(cutoff.getDate() - 90)

    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return followups.filter(f => f.date && f.date >= cutoffStr)
  }, [followups, timeRange])

  // Week-over-week comparison for trends
  const thisWeekCount = useMemo(() => {
    const from = new Date(); from.setDate(from.getDate() - 7)
    return candidates.filter(c => c.submission_date >= from.toISOString().slice(0, 10)).length
  }, [candidates])

  const lastWeekCount = useMemo(() => {
    const now = new Date()
    const from = new Date(now); from.setDate(now.getDate() - 14)
    const to = new Date(now); to.setDate(now.getDate() - 7)
    return candidates.filter(c =>
      c.submission_date >= from.toISOString().slice(0, 10) &&
      c.submission_date < to.toISOString().slice(0, 10)
    ).length
  }, [candidates])

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
    const sortedList = [...byName.values()].sort((a, b) => {
      if (b.hires !== a.hires) return b.hires - a.hires
      if (b.submissions !== a.submissions) return b.submissions - a.submissions
      return b.interviews - a.interviews
    }).slice(0, 6)
    const maxSubmissions = sortedList.length > 0 ? Math.max(...sortedList.map(s => s.submissions)) : 1
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
      { name: 'Open', value: filteredJobs.filter(j => j.status === 'Open').length },
      { name: 'On Hold', value: filteredJobs.filter(j => j.status === 'On Hold').length },
      { name: 'Filled', value: filteredJobs.filter(j => j.status === 'Filled').length },
      { name: 'Closed', value: filteredJobs.filter(j => j.status === 'Closed').length },
    ].filter(item => item.value > 0)
  }, [filteredJobs])

  const pendingCallbacks = callbacks.filter(c => c.status === 'pending')
  const dueFollowups = followups.filter(f => f.status !== 'done')
  const todaysCallbacks = pendingCallbacks.filter(c => c.date === today)
  const overdueFollowups = dueFollowups.filter(f => f.date && f.date < today)

  const activeJobsCount = useMemo(() => filteredJobs.filter(j => j.status === 'Open').length, [filteredJobs])
  const qualifiedCount = filteredCandidates.filter(c => ['Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired'].includes(c.external_status || c.internal_status)).length
  const offerCount = filteredCandidates.filter(c => c.external_status === 'Offer Extended' || c.internal_status === 'Offer Extended').length
  const rejectedCount = filteredCandidates.filter(c => c.external_status === 'Rejected' || c.internal_status === 'Rejected').length
  const hiredCount = filteredCandidates.filter(c => c.external_status === 'Hired' || c.internal_status === 'Hired').length
  const conversionRate = Math.round((hiredCount / Math.max(filteredCandidates.length, 1)) * 100)
  const pipelineHealthPct = Math.round((qualifiedCount / Math.max(filteredCandidates.length, 1)) * 100)

  const stats = [
    { label: 'Candidates', value: filteredCandidates.length, helper: `${filteredCandidates.filter(c => c.submission_date?.startsWith(month)).length} this month`, tone: 'blue', trend: getTrend(thisWeekCount, lastWeekCount) },
    { label: 'Qualified', value: qualifiedCount, helper: 'client-stage movement', tone: 'purple', trend: null },
    { label: 'Offers', value: offerCount, helper: `${conversionRate}% hire rate`, tone: 'yellow', trend: null },
    { label: 'Open Jobs', value: activeJobsCount, helper: `${filteredJobs.length} filtered`, tone: 'green', trend: null },
    { label: 'Rejected', value: rejectedCount, helper: 'client declined', tone: 'red', trend: null },
    { label: 'Pending Work', value: pendingCallbacks.length + dueFollowups.length, helper: `${todaysCallbacks.length} calls today`, tone: 'orange', trend: null },
  ]

  const todayFocus = [
    { id: 'calls', label: 'Calls today', value: todaysCallbacks.length, urgent: todaysCallbacks.length > 0, page: 'callbacks' },
    { id: 'overdue', label: 'Overdue tasks', value: overdueFollowups.length, urgent: overdueFollowups.length > 0, page: 'followups' },
    { id: 'interview', label: 'Interviews', value: upcomingInterviews.length, urgent: false, page: 'candidates' },
    { id: 'new', label: 'Added today', value: candidates.filter(c => c.submission_date === today).length, urgent: false, page: 'candidates' },
  ]

  const firstName = profile?.full_name?.split(' ')[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const avatarInitial = (profile?.full_name || 'U').charAt(0).toUpperCase()

  return (
    <div className="dashboard-page">
      <header className="dashboard-hero">
        <div className="dashboard-welcome-panel">
          <div className="dashboard-welcome-avatar">{avatarInitial}</div>
          <div className="dashboard-welcome-copy">
            <p className="dashboard-kicker">{profile?.organizations?.name || 'TalentDesk'} workspace</p>
            <h1>Good {greeting}, {firstName}!</h1>
            <p className="dashboard-welcome-date">{dateStr} · <span>{role}</span></p>
          </div>
        </div>
        <div className="dashboard-hero-metrics">
          <div className="hero-metric">
            <span>Pipeline</span>
            <strong>{pipelineHealthPct}%</strong>
            <small>health</small>
          </div>
          <div className="hero-metric-divider" />
          <div className="hero-metric">
            <span>Hired</span>
            <strong>{hiredCount}</strong>
            <small>placed</small>
          </div>
          <div className="hero-metric-divider" />
          <div className="hero-metric">
            <span>Open</span>
            <strong>{activeJobsCount}</strong>
            <small>jobs</small>
          </div>
        </div>
      </header>

      <section className="dashboard-control-bar">
        <div className="dashboard-search-container">
          <span className="search-icon">Search</span>
          <input 
            type="text" 
            placeholder="Search candidates, emails, jobs..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="dashboard-search-input"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="search-clear-btn" type="button">×</button>
          )}
        </div>
        <div className="time-range-selector">
          {[
            { id: '7d', label: '7 Days' },
            { id: '30d', label: '30 Days' },
            { id: '90d', label: '90 Days' },
            { id: 'all', label: 'All Time' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setTimeRange(tab.id)} className={`time-range-tab ${timeRange === tab.id ? 'active' : ''}`} type="button">
              {tab.label}
            </button>
          ))}
        </div>
        <div className="custom-multiselect-container" ref={dropdownRef}>
          <span className="multiselect-label">Recruiter</span>
          <button 
            type="button" 
            className="multiselect-trigger" 
            onClick={() => setShowOwnerDropdown(prev => !prev)}
          >
            <span className="multiselect-trigger-text">
              {selectedOwners.length === 0 
                ? 'All recruiters' 
                : selectedOwners.length === 1 
                  ? ownerOptions.find(([id]) => id === selectedOwners[0])?.[1] || selectedOwners[0]
                  : `${selectedOwners.length} recruiters selected`}
            </span>
            <span className="multiselect-arrow">v</span>
          </button>
          
          {showOwnerDropdown && (
            <div className="multiselect-dropdown-panel" onClick={e => e.stopPropagation()}>
              <input 
                type="text" 
                placeholder="Search recruiters..." 
                className="multiselect-search-input"
                value={recruiterSearch}
                onChange={e => setRecruiterSearch(e.target.value)}
              />
              <div className="multiselect-options-list">
                <label className="multiselect-option-all">
                  <input 
                    type="checkbox" 
                    checked={selectedOwners.length === 0} 
                    onChange={() => setSelectedOwners([])}
                  />
                  <span>All recruiters</span>
                </label>
                <div className="multiselect-options-divider" />
                {filteredRecruiterOptions.map(([id, name]) => {
                  const isChecked = selectedOwners.includes(id)
                  return (
                    <label key={id} className="multiselect-option">
                      <input 
                        type="checkbox" 
                        checked={isChecked} 
                        onChange={() => {
                          setSelectedOwners(prev => 
                            isChecked 
                              ? prev.filter(item => item !== id) 
                              : [...prev, id]
                          )
                        }}
                      />
                      <span>{name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <label>
          Candidate Stage
          <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
            {stageOptions.map(stage => <option key={stage}>{stage}</option>)}
          </select>
        </label>
        <label>
          Job Status
          <select value={jobStatusFilter} onChange={e => setJobStatusFilter(e.target.value)}>
            {jobStatusOptions.map(status => <option key={status}>{status}</option>)}
          </select>
        </label>
        <button className="dashboard-reset-btn" type="button" onClick={() => { setTimeRange('all'); setSelectedOwners([]); setStageFilter('All'); setJobStatusFilter('All'); setSearchQuery('') }}>
          Reset
        </button>
      </section>

      <section className="dashboard-stat-grid">
        {stats.map(stat => (
          <article className={`dashboard-stat ${stat.tone}`} key={stat.label}>
            <div className="stat-content">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <div className="stat-foot">
                <small>{stat.helper}</small>
                {stat.trend && (
                  <span className={`stat-trend ${stat.trend.dir}`}>
                    {stat.trend.dir === 'up' ? '+' : '-'}
                    {stat.trend.pct !== null ? ` ${stat.trend.pct > 999 ? '999+' : stat.trend.pct}%` : ''}
                  </span>
                )}
              </div>
            </div>
            <div className="stat-decorator" aria-hidden="true" />
          </article>
        ))}
      </section>

      <section className="dashboard-quick-actions">
        <div className="quick-actions-grid">
          {[
            { id: 'candidates', label: 'Candidates', desc: 'Profiles', tone: 'blue', badge: filteredCandidates.length },
            { id: 'pipeline', label: 'Pipeline', desc: 'Stages', tone: 'purple', badge: filteredCandidates.filter(c => ['Interview Scheduled','Interview Done','Shortlisted'].includes(c.internal_status)).length },
            { id: 'jobs', label: 'Jobs', desc: 'Roles', tone: 'green', badge: activeJobsCount },
            { id: 'reports', label: 'Reports', desc: 'Exports', tone: 'yellow' },
            { id: 'callbacks', label: 'Callbacks', desc: 'Tasks', tone: 'orange', badge: pendingCallbacks.length, urgent: todaysCallbacks.length > 0 },
          ].map(action => (
            <button key={action.id} onClick={() => onNavigate(action.id)} className={`quick-action-card ${action.tone}${action.urgent ? ' urgent' : ''}`} type="button">
              <div className="quick-action-copy">
                <strong>{action.label}</strong>
                <small>{action.desc}</small>
              </div>
              {action.badge > 0 && <span className="qa-badge">{action.badge > 99 ? '99+' : action.badge}</span>}
            </button>
          ))}
        </div>
      </section>

      {/* Today's Focus strip */}
      <section className="dashboard-focus-strip">
        <div className="focus-strip-header">
          <span className="focus-strip-label">Today's Focus</span>
          <span className="focus-strip-date">{dateStr}</span>
        </div>
        <div className="focus-strip-pills">
          {todayFocus.map(item => (
            <button key={item.id} type="button" onClick={() => onNavigate(item.page)} className={`focus-pill${item.urgent ? ' urgent' : ''}`}>
              <strong className="focus-pill-value">{item.value}</strong>
              <small className="focus-pill-label">{item.label}</small>
            </button>
          ))}
        </div>
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

          <Panel title="Recruiter Leaderboard" subtitle="Top performers by hires and submissions">
            <div className="leaderboard-container">
              {recruiterData.length === 0 ? (
                <EmptyLine text="No recruiter submissions in this period" />
              ) : (
                recruiterData.map((row, index) => {
                  const rankDisplay = String(index + 1).padStart(2, '0')
                  const initials = row.name
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                  const conversionPct = row.submissions > 0 ? Math.round((row.hires / row.submissions) * 100) : 0
                  return (
                    <div className="leaderboard-card" key={row.name}>
                      <div className="leaderboard-rank-badge">{rankDisplay}</div>
                      <div className="leaderboard-avatar-circle">{initials}</div>
                      <div className="leaderboard-info">
                        <div className="leaderboard-name-row">
                          <strong>{row.name}</strong>
                          <span className="leaderboard-conv-badge" title="Hire conversion rate">{conversionPct}% conversion</span>
                        </div>
                        <div className="leaderboard-stats-row">
                          <span className="leaderboard-stat-pill" title="Submissions"><b>{row.submissions}</b> submissions</span>
                          <span className="leaderboard-stat-pill" title="Interviews"><b>{row.interviews}</b> interviews</span>
                          <span className="leaderboard-stat-pill" title="Hires"><b>{row.hires}</b> hires</span>
                        </div>
                        <div className="leaderboard-progress-bg">
                          <div className="leaderboard-progress-fill" style={{ width: `${row.percentage}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Panel>

          <Panel title="Activity Feed" subtitle="Latest changes across your visible workspace">
            <div className="activity-timeline">
              {activity.length === 0 ? (
                <EmptyLine text="No activity yet" />
              ) : (
                activity.map(item => {
                  const actionLower = (item.action || '').toLowerCase()
                  
                  let typeClass = 'update'
                  
                  if (actionLower.includes('create') || actionLower.includes('add') || actionLower.includes('submit')) {
                    typeClass = 'create'
                  } else if (actionLower.includes('delete') || actionLower.includes('remove')) {
                    typeClass = 'delete'
                  } else if (actionLower.includes('schedule') || actionLower.includes('interview')) {
                    typeClass = 'interview'
                  } else if (actionLower.includes('call') || actionLower.includes('phone')) {
                    typeClass = 'call'
                  } else if (actionLower.includes('hire') || actionLower.includes('offer')) {
                    typeClass = 'success'
                  }

                  const actorInitials = (item.actor_name || 'System')
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)

                  return (
                    <div className={`activity-timeline-item ${typeClass}`} key={item.id}>
                      <div className="activity-item-left">
                        <div className="activity-action-icon" aria-hidden="true" />
                        <div className="activity-timeline-line" />
                      </div>
                      <div className="activity-item-content">
                        <div className="activity-item-meta">
                          <span className="activity-actor" title={item.actor_name || 'System'}>
                            <span className="activity-actor-avatar">{actorInitials}</span>
                            {item.actor_name || 'System'}
                          </span>
                          <span className="activity-time">{formatTime(item.created_at)}</span>
                        </div>
                        <p className="activity-summary">{item.summary || `${item.action} ${item.entity}`}</p>
                      </div>
                    </div>
                  )
                })
              )}
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
                        <strong>ðŸ“ž Callback: {item.candidate_name}</strong>
                        <small>{item.time || 'Schedule'} Â· {item.phone || 'No phone'}</small>
                      </div>
                      <div className="task-actions">
                        {item.phone && (
                          <a href={`tel:${item.phone}`} className="task-action-btn phone-btn" title="Call candidate">
                            ðŸ“ž
                          </a>
                        )}
                        <button onClick={() => handleCompleteCallback(item.id)} className="task-action-btn check-btn" title="Mark Done" type="button">
                          âœ“
                        </button>
                      </div>
                    </div>
                  ))}
                  {overdueFollowups.slice(0, 4).map(item => (
                    <div className="action-task-card red" key={`f-${item.id}`}>
                      <div className="task-content">
                        <strong>ðŸ”” Follow-up: {item.candidate_name}</strong>
                        <small>{item.date} Â· {item.priority || 'Medium'} priority</small>
                      </div>
                      <div className="task-actions">
                        <button onClick={() => handleCompleteFollowup(item.id)} className="task-action-btn check-btn" title="Mark Done" type="button">
                          âœ“
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
                      <small>{item.job_title} Â· {item.type}</small>
                    </div>
                    <button onClick={() => onNavigate('candidates')} className="task-action-btn view-btn" title="View Candidate Profile" type="button">
                      ðŸ‘ï¸
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
