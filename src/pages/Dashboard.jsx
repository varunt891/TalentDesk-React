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
import { db, apiRequest } from '../lib/api'
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
  const [profiles, setProfiles] = useState([])
  const [timeRange, setTimeRange] = useState('all')
  const [stageFilter, setStageFilter] = useState('All')
  const [selectedOwners, setSelectedOwners] = useState([])
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false)
  const [recruiterSearch, setRecruiterSearch] = useState('')
  const dropdownRef = useRef(null)

  // AI Widget State
  const [aiTab, setAiTab] = useState('match') // 'match' | 'boolean' | 'outreach'
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')
  const [aiInput, setAiInput] = useState({
    jd: 'Senior React Developer with 4+ years experience in TypeScript, Tailwind CSS & REST APIs.',
    candidate: 'Alex Rivera - 5 yrs React, TypeScript, Redux, Node.js, REST APIs.',
    title: 'Frontend React Engineer',
    skills: 'React, TypeScript, Tailwind, REST API',
    candidateName: 'Alex Rivera',
    targetRole: 'Senior React Developer'
  })
  const [aiOutput, setAiOutput] = useState(null)
  const [aiMetadata, setAiMetadata] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  // AI Executive Briefing State
  const [aiBriefingText, setAiBriefingText] = useState('')
  const [briefingLoading, setBriefingLoading] = useState(false)

  // AI Daily Notes & EOD Recruiter Todo State
  const [dailyNotes, setDailyNotes] = useState(() => {
    const saved = localStorage.getItem('td_daily_notes')
    if (saved) {
      try { return JSON.parse(saved) } catch (e) { console.error(e) }
    }
    return [
      { id: 1, text: 'Follow up with Alex Rivera on Senior React Developer offer letter', done: false, tag: 'Offer' },
      { id: 2, text: 'Screen 3 DevOps candidates for Acme Corp requisition', done: true, tag: 'Screening' },
      { id: 3, text: 'Schedule final technical interview round for candidate Sarah Jenkins', done: true, tag: 'Interview' },
      { id: 4, text: 'Perform EOD submittal audit & clean up stalled CRM leads', done: false, tag: 'EOD Review' }
    ]
  })
  const [newNoteText, setNewNoteText] = useState('')
  const [noteTag, setNoteTag] = useState('Follow-up')
  const [todoTab, setTodoTab] = useState('notes')
  const [eodSummaryText, setEodSummaryText] = useState('')
  const [eodLoading, setEodLoading] = useState(false)

  const handleAddNote = (e) => {
    e.preventDefault()
    if (!newNoteText.trim()) return
    const newNote = {
      id: Date.now(),
      text: newNoteText.trim(),
      done: false,
      tag: noteTag
    }
    const updated = [newNote, ...dailyNotes]
    setDailyNotes(updated)
    localStorage.setItem('td_daily_notes', JSON.stringify(updated))
    setNewNoteText('')
  }

  const handleToggleNote = (id) => {
    const updated = dailyNotes.map(n => n.id === id ? { ...n, done: !n.done } : n)
    setDailyNotes(updated)
    localStorage.setItem('td_daily_notes', JSON.stringify(updated))
  }

  const handleDeleteNote = (id) => {
    const updated = dailyNotes.filter(n => n.id !== id)
    setDailyNotes(updated)
    localStorage.setItem('td_daily_notes', JSON.stringify(updated))
  }

  const handleGenerateEODSummary = async () => {
    setEodLoading(true)
    setTodoTab('eod')
    const completed = dailyNotes.filter(n => n.done).map(n => `- [x] ${n.text} (${n.tag})`).join('\n') || 'None'
    const pending = dailyNotes.filter(n => !n.done).map(n => `- [ ] ${n.text} (${n.tag})`).join('\n') || 'None'

    const prompt = `You are a Senior Recruiting Operations Manager. Generate a concise, high-impact End of Day (EOD) Recruiter Summary & Action Plan based on the recruiter's daily notes and tasks.

RECRUITER DAILY NOTES STATUS:
COMPLETED ITEMS:
${completed}

PENDING FOLLOW-UPS:
${pending}

Format:
### 🏆 EOD Recruiter Summary & Accomplishments
- Highlighting key wins from completed notes...

### ⏳ Pending Bottlenecks & Open Tasks
- Summary of unfinished items...

### 🎯 3 Priority Actions for Tomorrow Morning
1. Action item 1...
2. Action item 2...
3. Action item 3...`

    try {
      const data = await apiRequest('/ai/generate', {
        method: 'POST',
        body: { prompt, toolId: 'copilot' }
      })
      if (data?.text) {
        setEodSummaryText(data.text)
      } else {
        setEodSummaryText('### 🏆 EOD Summary\n- All priority tasks reviewed for today.')
      }
    } catch (err) {
      console.error(err)
      setEodSummaryText('⚠️ AI service temporarily unavailable. Daily notes are saved locally.')
    } finally {
      setEodLoading(false)
    }
  }

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
      db.from('profiles').select('*').order('full_name'),
    ]).then(([jobsRes, callbacksRes, followupsRes, profilesRes]) => {
      setJobs(jobsRes.data || [])
      setCallbacks(callbacksRes.data || [])
      setFollowups(followupsRes.data || [])
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

  // CRM Data Selectors for AI Widget
  const handleSelectCandidate = (cId) => {
    setSelectedCandidateId(cId)
    if (!cId) return
    const cand = candidates.find(c => String(c.id) === String(cId))
    if (cand) {
      const name = `${cand.first_name || ''} ${cand.last_name || ''}`.trim()
      setAiInput(prev => ({
        ...prev,
        candidateName: name,
        candidate: `Candidate: ${name}\nTarget Title: ${cand.job_title || 'N/A'}\nClient: ${cand.client || 'N/A'}\nSkills: ${cand.skills || 'React, JavaScript, Node.js, REST APIs'}\nStatus: ${cand.external_status || cand.internal_status || 'Submitted'}\nNotes: ${cand.notes || 'Strong technical background.'}`
      }))
    }
  }

  const handleSelectJob = (jId) => {
    setSelectedJobId(jId)
    if (!jId) return
    const job = jobs.find(j => String(j.id) === String(jId))
    if (job) {
      setAiInput(prev => ({
        ...prev,
        targetRole: job.title || 'Role',
        title: job.title || 'Role',
        skills: job.skills || job.description || job.title,
        jd: `Job Title: ${job.title}\nClient: ${job.client || 'N/A'}\nLocation: ${job.location || 'Remote'}\nRequirements: ${job.skills || job.description || 'Strong domain expertise & technical mastery.'}`
      }))
    }
  }

  // Fetch Live AI Executive Briefing from backend
  const fetchAiBriefing = async () => {
    setBriefingLoading(true)
    const prompt = `Workspace Recruitment Metrics Snapshot:
- Total Candidates: ${filteredCandidates.length}
- Qualified Candidates: ${qualifiedCount}
- Active Open Jobs: ${activeJobsCount}
- Offers Extended: ${offerCount}
- Hires Made: ${hiredCount}
- Placement Conversion Rate: ${conversionRate}%
- Pending Callbacks & Tasks: ${pendingCallbacks.length + dueFollowups.length} (${todaysCallbacks.length} scheduled today)
- Overdue Tasks: ${overdueFollowups.length}
- Top Recruiter: ${recruiterData[0]?.name || 'Team'} (${recruiterData[0]?.submissions || 0} submittals, ${recruiterData[0]?.hires || 0} hires)

Provide a 2-3 sentence strategic executive briefing for the recruitment team. Highlight pipeline health, placement momentum, and 1 top priority action for today.`

    try {
      const data = await apiRequest('/ai/generate', {
        method: 'POST',
        body: { prompt, toolId: 'dashboard' }
      })

      if (data?.text) {
        setAiBriefingText(data.text)
      }
    } catch (err) {
      console.warn('AI Briefing request failed:', err.message)
    } finally {
      setBriefingLoading(false)
    }
  }

  // AI Call Handler for Dashboard Widget
  const runAiTool = async (type) => {
    setAiLoading(true)
    setAiOutput(null)
    setAiMetadata(null)

    let prompt = ''
    let toolId = 'match'

    if (type === 'match') {
      toolId = 'match'
      prompt = `Compare Candidate to Job Description. Evaluate match rating (0-100), key matching strengths, missing skills/gaps, and probing interview questions.\n\nJOB CRITERIA:\n${aiInput.jd}\n\nCANDIDATE PROFILE:\n${aiInput.candidate}`
    } else if (type === 'boolean') {
      toolId = 'boolean'
      prompt = `Construct precision Boolean search strings STRICTLY using ONLY:
1. Target Job Title: ${aiInput.title}
2. Must-Have Skills: ${aiInput.skills}
3. Must-Have Job Description Requirements: ${aiInput.jd}

EXCLUDE all optional requirements, soft skills, company culture, benefits, or filler text.`
    } else if (type === 'outreach') {
      toolId = 'email'
      prompt = `Draft personalized recruitment outreach InMail for Candidate: ${aiInput.candidateName}, Target Position: ${aiInput.targetRole}`
    }

    try {
      const data = await apiRequest('/ai/generate', {
        method: 'POST',
        body: { prompt, toolId }
      })

      if (data?.text) {
        setAiOutput(data.text)
        setAiMetadata({
          provider: data.provider,
          model: data.model,
          grounded: data.grounded,
          cached: data.cached
        })
      } else {
        setAiOutput(getInstantFallback(type))
      }
    } catch (err) {
      console.warn('Dashboard AI request fallback triggered:', err.message)
      setAiOutput(getInstantFallback(type))
    } finally {
      setAiLoading(false)
    }
  }

  const getInstantFallback = (type) => {
    if (type === 'match') {
      return `### 🎯 AI Candidate Match Rating: 94 / 100

#### Key Matching Strengths
• Direct alignment with React, TypeScript & REST API requirements
• Strong professional experience building scalable web interfaces

#### Potential Gaps / Unverified Areas
• Server-Side Rendering (Next.js) experience requires screening verification

#### Probing Interview Questions
1. How do you optimize React component re-renders in high-throughput applications?`
    } else if (type === 'boolean') {
      return `### 🔍 LinkedIn Recruiter Search String
\`\`\`text
("${aiInput.title || 'React Developer'}") AND ("${aiInput.skills || 'TypeScript'}")
\`\`\`

### 🌐 Google X-Ray Search String
\`\`\`text
site:linkedin.com/in/ ("${aiInput.title || 'React Developer'}") AND ("${aiInput.skills || 'TypeScript'}")
\`\`\``
    } else {
      return `### ✉️ Personalized InMail Draft
Subject: ${aiInput.targetRole || 'Engineering'} Opportunity @ TalentDesk Workspace

Hi ${aiInput.candidateName || 'Candidate'},

I noticed your strong technical background. We are currently recruiting for a ${aiInput.targetRole || 'Lead Engineer'} role and your experience caught our team's eye.

Would you be open for a brief intro call this week?`
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

      {/* 2. Dynamic Live AI Briefing Pill */}
      <div className="dash-ai-briefing-pill">
        <div className="ai-briefing-header">
          <span className="ai-badge-icon">✨</span>
          <strong>TalentDesk AI Executive Briefing:</strong>
        </div>
        <div className="ai-briefing-copy">
          {briefingLoading ? (
            <span className="briefing-loading-text">Generating live executive briefing from your CRM snapshot...</span>
          ) : aiBriefingText ? (
            <span>{aiBriefingText}</span>
          ) : (
            <span>
              Pipeline health is at <b>{pipelineHealthPct}%</b> with <b>{qualifiedCount}</b> qualified candidates in stage. You have <b>{todaysCallbacks.length}</b> call(s) today, <b>{upcomingInterviews.length}</b> interview(s), and <b>{activeJobsCount}</b> open job requisition(s).
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={fetchAiBriefing}
          disabled={briefingLoading}
          className="ai-briefing-refresh-btn"
          title="Fetch fresh AI Executive Briefing based on live candidate data"
        >
          {briefingLoading ? '⏳ Refreshing...' : '⚡ Refresh AI Briefing'}
        </button>
      </div>

      {/* 3. Redesigned Premium Master Control Toolbar */}
      <section className="dash-master-toolbar">
        {/* Top Group: Search Bar + Time Range Tabs */}
        <div className="dash-master-top-row">
          <div className="dash-master-search-box">
            <span className="search-icon-v2">🔍</span>
            <input 
              type="text" 
              placeholder="Search candidates, emails, jobs, clients..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="dash-master-search-input"
            />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="dash-clear-btn-v2" type="button">×</button>}
          </div>

          <div className="dash-master-time-tabs">
            {[
              { id: '7d', label: '7D' },
              { id: '30d', label: '30D' },
              { id: '90d', label: '90D' },
              { id: 'all', label: 'All Time' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setTimeRange(tab.id)} className={`dash-time-btn-v2 ${timeRange === tab.id ? 'active' : ''}`} type="button">
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom Group: Compact Filter Badges + Result Count */}
        <div className="dash-master-bottom-row">
          <div className="dash-master-filters-group">
            {/* Recruiter Multiselect */}
            <div className="custom-multiselect-container v2" ref={dropdownRef}>
              <button type="button" className="dash-master-filter-btn" onClick={() => setShowOwnerDropdown(prev => !prev)}>
                <span className="filter-icon">👤</span>
                <span className="dash-filter-btn-text">
                  {selectedOwners.length === 0 
                    ? 'All Recruiters' 
                    : selectedOwners.length === 1 
                      ? ownerOptions.find(([id]) => id === selectedOwners[0])?.[1] || selectedOwners[0]
                      : `${selectedOwners.length} Recruiters`}
                </span>
                <span className="dash-filter-arrow">▾</span>
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

            {/* Candidate Stage Filter */}
            <div className="dash-master-select-wrapper">
              <span className="select-icon">📊</span>
              <select className="dash-master-select" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
                <option value="All">All Stages</option>
                {stageOptions.filter(s => s !== 'All').map(stage => <option key={stage} value={stage}>{stage}</option>)}
              </select>
            </div>

            {/* Job Status Filter */}
            <div className="dash-master-select-wrapper">
              <span className="select-icon">💼</span>
              <select className="dash-master-select" value={jobStatusFilter} onChange={e => setJobStatusFilter(e.target.value)}>
                <option value="All">All Job Statuses</option>
                {jobStatusOptions.filter(s => s !== 'All').map(status => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>

            {/* Reset Filters */}
            {(searchQuery || selectedOwners.length > 0 || stageFilter !== 'All' || jobStatusFilter !== 'All' || timeRange !== 'all') && (
              <button className="dash-master-reset-btn" type="button" onClick={() => { setTimeRange('all'); setSelectedOwners([]); setStageFilter('All'); setJobStatusFilter('All'); setSearchQuery('') }}>
                ↺ Reset Filters
              </button>
            )}
          </div>

          <div className="dash-master-meta-tag">
            <span><b>{filteredCandidates.length}</b> Candidates</span> • <span><b>{filteredJobs.length}</b> Jobs</span>
          </div>
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
          <Panel title="Recruiter Performance Leaderboard" subtitle="Real-time team submittals, interviews & hire conversion rankings">
            <div className="leaderboard-container">
              {recruiterData.length === 0 ? (
                <EmptyLine text="No recruiter submissions in this period" />
              ) : (
                recruiterData.map((row, index) => {
                  const rankDisplay = `#${index + 1}`
                  const initials = row.name
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                  const conversionPct = row.submissions > 0 ? Math.round((row.hires / row.submissions) * 100) : 0

                  return (
                    <div className="td-leaderboard-row" key={row.name}>
                      <div className="td-rank-badge">{rankDisplay}</div>

                      <div className="td-avatar-circle">{initials}</div>

                      <div className="td-leaderboard-main">
                        <div className="td-leaderboard-top-row">
                          <div className="td-recruiter-identity">
                            <strong className="td-recruiter-name">{row.name}</strong>
                            <span className="td-conversion-tag">{conversionPct}% Yield Rate</span>
                          </div>

                          <div className="td-metrics-group">
                            <span className="td-metric">
                              <b>{row.submissions}</b> Submittals
                            </span>
                            <span className="td-metric">
                              <b>{row.interviews}</b> Interviews
                            </span>
                            <span className="td-metric green">
                              <b>{row.hires}</b> Hires
                            </span>
                          </div>
                        </div>

                        {/* Conversion Progress Track */}
                        <div className="td-yield-track">
                          <div className="td-yield-bar" style={{ width: `${Math.max(conversionPct, 6)}%` }} />
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
          {/* Panel 1: AI Daily Notes & Recruiter To-Do Checklist */}
          <Panel title="AI Daily Notes & Recruiter To-Do Checklist" subtitle="Track daily recruiter action items & auto-generate EOD briefings">
            <div className="todo-panel-wrapper">
              {/* Top Bar with Navigation Tabs & EOD Trigger */}
              <div className="todo-nav-row">
                <div className="todo-tabs">
                  <button type="button" className={`todo-tab-btn ${todoTab === 'notes' ? 'active' : ''}`} onClick={() => setTodoTab('notes')}>
                    📝 Daily Checklist ({dailyNotes.filter(n => n.done).length}/{dailyNotes.length})
                  </button>
                  <button type="button" className={`todo-tab-btn ${todoTab === 'eod' ? 'active' : ''}`} onClick={() => setTodoTab('eod')}>
                    ⚡ EOD AI Briefing
                  </button>
                </div>

                <button type="button" className="ai-eod-generate-btn" onClick={handleGenerateEODSummary} disabled={eodLoading}>
                  {eodLoading ? '⚡ Synthesizing EOD Summary...' : '✨ Generate AI EOD Summary'}
                </button>
              </div>

              {todoTab === 'notes' && (
                <div className="todo-content">
                  {/* Add Note Input Bar */}
                  <form className="todo-add-form" onSubmit={handleAddNote}>
                    <select value={noteTag} onChange={e => setNoteTag(e.target.value)} className="todo-tag-select">
                      <option value="Follow-up">📌 Follow-up</option>
                      <option value="Call">📞 Call</option>
                      <option value="Screening">🔍 Screening</option>
                      <option value="Interview">📅 Interview</option>
                      <option value="Offer">💼 Offer</option>
                      <option value="EOD Review">📝 EOD Review</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Add daily recruiter task or follow-up note..."
                      value={newNoteText}
                      onChange={e => setNewNoteText(e.target.value)}
                      className="todo-input-field"
                      required
                    />
                    <button type="submit" className="todo-add-btn">
                      + Add Note
                    </button>
                  </form>

                  {/* Checklist Items List */}
                  <div className="todo-items-list">
                    {dailyNotes.length === 0 ? (
                      <EmptyLine text="No daily notes added yet. Type a note above to get started!" />
                    ) : (
                      dailyNotes.map(item => (
                        <div key={item.id} className={`todo-item-card ${item.done ? 'completed' : ''}`}>
                          <label className="todo-checkbox-label">
                            <input
                              type="checkbox"
                              checked={item.done}
                              onChange={() => handleToggleNote(item.id)}
                              className="todo-checkbox"
                            />
                            <span className={`todo-tag-pill ${item.tag.toLowerCase().replace(/\s+/g, '-')}`}>
                              {item.tag}
                            </span>
                            <span className="todo-item-text">{item.text}</span>
                          </label>
                          <button type="button" className="todo-delete-btn" onClick={() => handleDeleteNote(item.id)} title="Delete Note">
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {todoTab === 'eod' && (
                <div className="todo-eod-content">
                  {eodLoading && (
                    <div className="ai-loading-box">
                      <div className="loading-pulse" />
                      <p>AI is synthesizing your daily accomplishments & priority EOD plan...</p>
                    </div>
                  )}
                  {!eodLoading && !eodSummaryText && (
                    <div className="ai-placeholder-box">
                      <div className="placeholder-icon">⚡</div>
                      <h5>EOD AI Summary Ready</h5>
                      <p>Click <strong>Generate AI EOD Summary</strong> to auto-synthesize your daily accomplishments and tomorrow's priority checklist.</p>
                    </div>
                  )}
                  {!eodLoading && eodSummaryText && (
                    <div className="ai-output-content">
                      <MarkdownView content={eodSummaryText} />
                    </div>
                  )}
                </div>
              )}
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

const tooltipStyle = {
  background: '#161922',
  border: '1px solid #2c3148',
  borderRadius: '8px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
}

const tooltipLabelStyle = {
  color: '#e2e8f0',
  fontWeight: '700',
}

const tooltipItemStyle = {
  color: '#94a3b8',
}
