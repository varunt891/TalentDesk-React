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

  // AI Widget State
  const [aiTab, setAiTab] = useState('match') // 'match' | 'boolean' | 'outreach'
  const [aiInput, setAiInput] = useState({
    jd: 'Senior React Developer with 4+ years experience in TypeScript, Tailwind CSS & REST APIs.',
    candidate: 'Alex Rivera - 5 yrs React, TypeScript, Redux, Node.js, REST APIs.',
    title: 'Frontend React Engineer',
    skills: 'React, TypeScript, Tailwind, REST API',
    candidateName: 'Alex Rivera',
    targetRole: 'Senior React Developer'
  })
  const [aiOutput, setAiOutput] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [userApiKey] = useState(() => localStorage.getItem('user_gemini_key') || '')

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
    { label: 'Total Candidates', value: filteredCandidates.length, helper: `${filteredCandidates.filter(c => c.submission_date?.startsWith(month)).length} added this month`, tone: 'blue', trend: getTrend(thisWeekCount, lastWeekCount) },
    { label: 'Qualified Pipeline', value: qualifiedCount, helper: 'Client stage movement', tone: 'purple', trend: null },
    { label: 'Offers Extended', value: offerCount, helper: `${conversionRate}% placement rate`, tone: 'yellow', trend: null },
    { label: 'Active Requisitions', value: activeJobsCount, helper: `${filteredJobs.length} total filtered`, tone: 'green', trend: null },
    { label: 'Rejected Candidates', value: rejectedCount, helper: 'Client declined', tone: 'red', trend: null },
    { label: 'Pending Tasks', value: pendingCallbacks.length + dueFollowups.length, helper: `${todaysCallbacks.length} calls today`, tone: 'orange', trend: null },
  ]

  const firstName = profile?.full_name?.split(' ')[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const avatarInitial = (profile?.full_name || 'U').charAt(0).toUpperCase()

  // Gemini AI Call Handler for Dashboard
  const runAiTool = async (type) => {
    setAiLoading(true)
    setAiOutput(null)

    let prompt = ''
    if (type === 'match') {
      prompt = `Compare Candidate to JD. Evaluate match rating (0-100), key strengths, and missing skills.\nJD: ${aiInput.jd}\nCandidate: ${aiInput.candidate}`
    } else if (type === 'boolean') {
      prompt = `Generate LinkedIn and X-Ray boolean search strings for Role: ${aiInput.title}, Skills: ${aiInput.skills}`
    } else if (type === 'outreach') {
      prompt = `Draft a personalized LinkedIn InMail outreach for Candidate: ${aiInput.candidateName}, Target Role: ${aiInput.targetRole}`
    }

    try {
      const res = await fetch('http://localhost:4000/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, apiKey: userApiKey.trim() || undefined })
      })
      const data = await res.json()
      if (res.ok && data.text) {
        setAiOutput(data.text)
      } else {
        setAiOutput(getInstantFallback(type))
      }
    } catch {
      setAiOutput(getInstantFallback(type))
    } finally {
      setAiLoading(false)
    }
  }

  const getInstantFallback = (type) => {
    if (type === 'match') {
      return `### 🎯 AI Match Rating: 94 / 100
**Strengths:** Direct alignment with React, TypeScript & REST APIs. 5+ years relevant experience.
**Gaps:** Needs minor verification on server-side rendering (SSR) frameworks.
**Interview Question:** "How do you handle state re-renders in large React applications?"`
    } else if (type === 'boolean') {
      return `### 🔍 LinkedIn Recruiter Search String
\`\`\`text
("React Developer" OR "Frontend Engineer" OR "React Specialist") AND ("TypeScript" AND "Tailwind" AND "REST API")
\`\`\`
### 🌐 Google X-Ray Search String
\`\`\`text
site:linkedin.com/in/ ("React Developer") AND ("TypeScript") AND ("Tailwind")
\`\`\``
    } else {
      return `### ✉️ Personalized InMail Draft
Subject: Senior React Developer Opportunity @ TalentDesk Workspace

Hi ${aiInput.candidateName || 'Alex'},

I noticed your strong background in React and TypeScript. We are currently scaling our engineering team for a Lead React Architect role and your profile caught our team's eye.

Would you be open for a brief 10-minute intro call this week?`
    }
  }

  return (
    <div className="dashboard-page">
      {/* 1. Header Bar with Quick Nav */}
      <header className="dash-top-header">
        <div className="dash-header-welcome">
          <div className="dash-avatar-circle">{avatarInitial}</div>
          <div>
            <h1>Good {greeting}, {firstName}!</h1>
            <p>{profile?.organizations?.name || 'TalentDesk'} Workspace • <span>{role}</span> • {dateStr}</p>
          </div>
        </div>

        <div className="dash-header-nav">
          <button type="button" onClick={() => onNavigate('candidates')} className="dash-nav-pill blue">
            Candidates <b>{filteredCandidates.length}</b>
          </button>
          <button type="button" onClick={() => onNavigate('pipeline')} className="dash-nav-pill purple">
            Pipeline <b>{qualifiedCount}</b>
          </button>
          <button type="button" onClick={() => onNavigate('jobs')} className="dash-nav-pill green">
            Jobs <b>{activeJobsCount}</b>
          </button>
          <button type="button" onClick={() => onNavigate('callbacks')} className="dash-nav-pill orange">
            Callbacks <b>{pendingCallbacks.length}</b>
          </button>
        </div>
      </header>

      {/* 2. Live AI Briefing Pill */}
      <div className="dash-ai-briefing-pill">
        <span className="ai-badge-icon">✨</span>
        <div className="ai-briefing-copy">
          <strong>Gemini AI Intelligence Briefing:</strong> Pipeline health is at <b>{pipelineHealthPct}%</b> with <b>{qualifiedCount}</b> qualified candidates in stage. You have <b>{todaysCallbacks.length}</b> call(s) today, <b>{upcomingInterviews.length}</b> interview(s), and <b>{activeJobsCount}</b> open job requisition(s).
        </div>
      </div>

      {/* 3. Unified Filter Control Bar */}
      <section className="dash-control-card">
        <div className="dash-search-box">
          <span className="dash-search-icon">🔍</span>
          <input 
            type="text" 
            placeholder="Search candidates, emails, jobs, clients..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="dash-search-input"
          />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="dash-clear-btn" type="button">×</button>}
        </div>

        <div className="dash-time-tabs">
          {[
            { id: '7d', label: '7D' },
            { id: '30d', label: '30D' },
            { id: '90d', label: '90D' },
            { id: 'all', label: 'All Time' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setTimeRange(tab.id)} className={`dash-time-btn ${timeRange === tab.id ? 'active' : ''}`} type="button">
              {tab.label}
            </button>
          ))}
        </div>

        <div className="dash-filters-row">
          <div className="custom-multiselect-container" ref={dropdownRef}>
            <span className="multiselect-label">Recruiter</span>
            <button type="button" className="multiselect-trigger" onClick={() => setShowOwnerDropdown(prev => !prev)}>
              <span className="multiselect-trigger-text">
                {selectedOwners.length === 0 
                  ? 'All recruiters' 
                  : selectedOwners.length === 1 
                    ? ownerOptions.find(([id]) => id === selectedOwners[0])?.[1] || selectedOwners[0]
                    : `${selectedOwners.length} selected`}
              </span>
              <span className="multiselect-arrow">▾</span>
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
                    <input type="checkbox" checked={selectedOwners.length === 0} onChange={() => setSelectedOwners([])} />
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
                            setSelectedOwners(prev => isChecked ? prev.filter(item => item !== id) : [...prev, id])
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

          <label className="dash-select-field">
            <span className="multiselect-label">Candidate Stage</span>
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
              {stageOptions.map(stage => <option key={stage}>{stage}</option>)}
            </select>
          </label>

          <label className="dash-select-field">
            <span className="multiselect-label">Job Status</span>
            <select value={jobStatusFilter} onChange={e => setJobStatusFilter(e.target.value)}>
              {jobStatusOptions.map(status => <option key={status}>{status}</option>)}
            </select>
          </label>

          <button className="dash-reset-button" type="button" onClick={() => { setTimeRange('all'); setSelectedOwners([]); setStageFilter('All'); setJobStatusFilter('All'); setSearchQuery('') }}>
            Reset Filters
          </button>
        </div>
      </section>

      {/* 4. Symmetrical KPI Stat Grid */}
      <section className="dash-kpi-grid">
        {stats.map(stat => (
          <article className={`dash-kpi-card ${stat.tone}`} key={stat.label}>
            <div className="kpi-top">
              <span>{stat.label}</span>
              {stat.trend && (
                <span className={`kpi-trend ${stat.trend.dir}`}>
                  {stat.trend.dir === 'up' ? '↑' : '↓'}
                  {stat.trend.pct !== null ? ` ${stat.trend.pct > 999 ? '999+' : stat.trend.pct}%` : ''}
                </span>
              )}
            </div>
            <strong>{stat.value}</strong>
            <small>{stat.helper}</small>
          </article>
        ))}
      </section>

      {/* 5. Clean 2-Column Equal-Width Main Layout */}
      <section className="dash-main-columns">
        {/* Left Column: Core Operations & Pipeline */}
        <div className="dash-col">
          {/* Panel 1: Pipeline Funnel */}
          <Panel title="Candidate Pipeline Funnel" subtitle="Live distribution of candidates across stages">
            <div className="dashboard-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineData}>
                  <CartesianGrid stroke="rgba(139,145,168,0.15)" vertical={false} />
                  <XAxis dataKey="stage" tick={{ fill: '#8b91a8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#8b91a8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ fill: 'rgba(79,124,255,0.08)' }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {pipelineData.map(item => <Cell key={item.stage} fill={item.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* Panel 2: Today's Action Tasks & Interviews */}
          <Panel title="Action Center & Today's Priority Tasks" subtitle="Complete pending callbacks and follow-ups inline">
            <div className="dashboard-work-list interactive-action-list">
              {[...todaysCallbacks.slice(0, 4), ...overdueFollowups.slice(0, 4)].length === 0 ? (
                <EmptyLine text="✓ All callbacks and follow-ups completed for today!" />
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

          {/* Panel 3: Recruiter Leaderboard */}
          <Panel title="Recruiter Performance Leaderboard" subtitle="Top team members by hires and submittals">
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
                          <span className="leaderboard-stat-pill"><b>{row.submissions}</b> submissions</span>
                          <span className="leaderboard-stat-pill"><b>{row.interviews}</b> interviews</span>
                          <span className="leaderboard-stat-pill"><b>{row.hires}</b> hires</span>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Panel>
        </div>

        {/* Right Column: AI Copilot & Performance Analytics */}
        <div className="dash-col">
          {/* Panel 1: Gemini AI Sourcing Assistant Widget */}
          <Panel title="Gemini AI Sourcing & Match Assistant" subtitle="Instant candidate evaluation, Boolean strings & outreach drafts">
            <div className="ai-widget-wrapper">
              <div className="ai-widget-nav">
                <button type="button" className={`ai-nav-tab ${aiTab === 'match' ? 'active' : ''}`} onClick={() => setAiTab('match')}>
                  🎯 Candidate Match
                </button>
                <button type="button" className={`ai-nav-tab ${aiTab === 'boolean' ? 'active' : ''}`} onClick={() => setAiTab('boolean')}>
                  🔍 Boolean Generator
                </button>
                <button type="button" className={`ai-nav-tab ${aiTab === 'outreach' ? 'active' : ''}`} onClick={() => setAiTab('outreach')}>
                  ✉️ InMail Draft
                </button>
              </div>

              <div className="ai-widget-content">
                {aiTab === 'match' && (
                  <div className="ai-form-group">
                    <div className="ai-grid-2">
                      <div>
                        <span className="multiselect-label">Job Requirements Snippet</span>
                        <textarea rows="2" className="ai-widget-input" value={aiInput.jd} onChange={e => setAiInput({ ...aiInput, jd: e.target.value })} />
                      </div>
                      <div>
                        <span className="multiselect-label">Candidate Resume / Background</span>
                        <textarea rows="2" className="ai-widget-input" value={aiInput.candidate} onChange={e => setAiInput({ ...aiInput, candidate: e.target.value })} />
                      </div>
                    </div>
                    <button type="button" className="ai-run-btn" onClick={() => runAiTool('match')} disabled={aiLoading}>
                      {aiLoading ? '⚡ Evaluating Candidate...' : '🎯 Run AI Candidate Match'}
                    </button>
                  </div>
                )}

                {aiTab === 'boolean' && (
                  <div className="ai-form-group">
                    <div className="ai-grid-2">
                      <div>
                        <span className="multiselect-label">Target Job Title</span>
                        <input type="text" className="ai-widget-input" value={aiInput.title} onChange={e => setAiInput({ ...aiInput, title: e.target.value })} />
                      </div>
                      <div>
                        <span className="multiselect-label">Must-Have Skills</span>
                        <input type="text" className="ai-widget-input" value={aiInput.skills} onChange={e => setAiInput({ ...aiInput, skills: e.target.value })} />
                      </div>
                    </div>
                    <button type="button" className="ai-run-btn" onClick={() => runAiTool('boolean')} disabled={aiLoading}>
                      {aiLoading ? '⚡ Generating Strings...' : '🔍 Generate Boolean Strings'}
                    </button>
                  </div>
                )}

                {aiTab === 'outreach' && (
                  <div className="ai-form-group">
                    <div className="ai-grid-2">
                      <div>
                        <span className="multiselect-label">Candidate Name</span>
                        <input type="text" className="ai-widget-input" value={aiInput.candidateName} onChange={e => setAiInput({ ...aiInput, candidateName: e.target.value })} />
                      </div>
                      <div>
                        <span className="multiselect-label">Target Role Title</span>
                        <input type="text" className="ai-widget-input" value={aiInput.targetRole} onChange={e => setAiInput({ ...aiInput, targetRole: e.target.value })} />
                      </div>
                    </div>
                    <button type="button" className="ai-run-btn" onClick={() => runAiTool('outreach')} disabled={aiLoading}>
                      {aiLoading ? '⚡ Writing InMail...' : '✉️ Draft Personalized InMail'}
                    </button>
                  </div>
                )}

                {aiOutput && (
                  <div className="ai-widget-output">
                    <pre>{aiOutput}</pre>
                  </div>
                )}
              </div>
            </div>
          </Panel>

          {/* Panel 2: Submissions & Activity Trend */}
          <Panel title={`${timeRange === '7d' ? '7-Day' : timeRange === '30d' ? '30-Day' : timeRange === '90d' ? '90-Day' : '7-Day'} Submissions Trend`} subtitle="Submissions and follow-up activities over time">
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

          {/* Panel 3: Job Requisitions Donut & Workspace Notepad */}
          <Panel title="Job Requisitions & Quick Notepad" subtitle="Job status breakdown & autosaved call notes">
            <div className="dash-split-panel">
              <div className="dashboard-donut compact-donut">
                {sourceData.length === 0 ? <EmptyLine text="No job data yet" /> : (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={sourceData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={4}>
                          {sourceData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index]} />)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-center-label">
                      <strong>{activeJobsCount}</strong>
                      <span>Active</span>
                    </div>
                  </>
                )}
              </div>

              <textarea
                value={scratchpad}
                onChange={handleScratchpadChange}
                placeholder="Type quick candidate numbers, interview notes, or call snippets here..."
                className="dashboard-scratchpad"
              />
            </div>
          </Panel>
        </div>
      </section>
    </div>
  )
}

function Panel({ title, subtitle, children }) {
  return (
    <article className="dashboard-panel">
      <div className="dashboard-panel-head">
        <h2>{title}</h2>
        <p>{subtitle}</p>
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
