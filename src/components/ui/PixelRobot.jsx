import React, { useState, useEffect, useRef } from 'react'
import { cn } from './utils'

// Recruitment & AI Copilot micro-messages
const ROBOT_MESSAGES = {
  hired: ["YOU'RE HIRED! 🎉✨", "Perfect fit! Offer sent! 🚀", "100% Match! Welcome to the team! ⭐"],
  review: ["Scanning resume... 📄 99.2% Fit!", "Great skill match! 🎯", "Verified experience! ✨"],
  coffee: ["Coffee break with candidate! ☕", "Recruiter fuel: 100%! ☕✨", "Networking chat ☕"],
  peek: ["Peeking at pipeline... 🎯", "Searching for top talent! 🔎", "AI Copilot online ⚡"],
  sit: ["Watching candidate flow... 🧘", "Keeping an eye on topbar 🌤️", "Ready for new hires! 💼"],
  sleep: ["Zzz... Copilot in sleep mode 💤", "Recharging AI engine... 🔋", "Sweet pixel dreams 😴"],
  work: ["Indexing candidate skills... 💻", "Parsing resumes... 📄", "Processing match scores... ⚡"],
  click: ["Recruitment Copilot ready! 🤖⚡", "Need to find a candidate? 🔎", "AI Match Score: 99.4%! ✨", "Let's source top talent! 💼"]
}

const APPLICANT_MESSAGES = [
  "Looking for a job! 📄",
  "Resume ready! Hire me! 💼",
  "Checking open roles... 🔍",
  "Available for interviews! 🌟",
  "Hoping for a great match! 🎯"
]

const ACTION_STATES = ['hire', 'review', 'coffee', 'peek', 'sit', 'sleep', 'work']
const APPLICANT_IDLE_ACTIONS = ['idle', 'wave', 'phone', 'coffee', 'look']

// Maps App.jsx's internal `currentPage` keys to a human label for the
// robot's page-change reaction (this app navigates via client state, not
// the URL, so the browser location never changes — currentPage is the only
// reliable signal for "the recruiter just went somewhere new").
const PAGE_LABELS = {
  dashboard: 'the Dashboard', tasks: 'Tasks', ai_center: 'the AI Copilot Center',
  candidates: 'Candidates', jobs: 'Job Openings', pipeline: 'the Pipeline Board',
  callbacks: 'Callbacks', followups: 'Follow-ups', reports: 'Reports',
  postings: 'Postings', directory: 'the Directory', resubmit: 'Resubmit',
  org_settings: 'Settings', team_management: 'Team Management', admin: 'Admin',
}

export default function PixelRobot({ currentPage = '', robotInsights = [], applicantInsights = [], onNavigate }) {
  const [posX, setPosX] = useState(30) // Position % inside Left TopBar Space (8% to 75%)
  const [targetX, setTargetX] = useState(30)
  const [dir, setDir] = useState(1) // 1 = right, -1 = left
  const [robotState, setRobotState] = useState('sit') // 'hire' | 'review' | 'peek' | 'sit' | 'coffee' | 'sleep' | 'work' | 'walk'

  // Candidate State & Idle Action
  const [applicantState, setApplicantState] = useState('idle') // 'idle' | 'wave' | 'celebrate'
  const [applicantAction, setApplicantAction] = useState('idle') // 'idle' | 'wave' | 'phone' | 'coffee' | 'look'

  const [blink, setBlink] = useState(false)
  const [legStep, setLegStep] = useState(false)
  const [showRobotSpeech, setShowRobotSpeech] = useState(false)
  const [robotSpeech, setRobotSpeech] = useState({ text: '', emoji: '🤖', path: null })
  const [showApplicantSpeech, setShowApplicantSpeech] = useState(false)
  const [applicantSpeech, setApplicantSpeech] = useState({ text: '', emoji: '📄' })
  const [isHovered, setIsHovered] = useState(false)

  const DwellTimerRef = useRef(null)
  const SpeechTimerRef = useRef(null)
  const ApplicantSpeechTimerRef = useRef(null)
  const PrevPageRef = useRef(currentPage)

  // Kept in refs (rather than read directly from props) so the periodic
  // interval callbacks below always see the latest live data without
  // needing to be torn down and rebuilt every time a new snapshot lands.
  const robotInsightsRef = useRef(robotInsights)
  const applicantInsightsRef = useRef(applicantInsights)
  useEffect(() => { robotInsightsRef.current = robotInsights || [] }, [robotInsights])
  useEffect(() => { applicantInsightsRef.current = applicantInsights || [] }, [applicantInsights])

  const lastRobotMsgRef = useRef('')
  const lastApplicantMsgRef = useRef('')

  // Picks a message for a given robot state, blending real live insights
  // (workspace counts, real candidate/job names) with a small pool of
  // flavor lines for personality — and avoids repeating the same line twice
  // in a row. Sleep is flavor-only; it wouldn't make sense for a "sleeping"
  // bot to report live stats.
  const pickRobotMessage = (stateKey) => {
    const flavorPool = (ROBOT_MESSAGES[stateKey] || ROBOT_MESSAGES.sit).map(text => ({ text, emoji: null, path: null }))
    const live = stateKey === 'sleep' ? [] : robotInsightsRef.current.filter(i => !i.isHireEvent)
    const pool = live.length ? [...live, ...flavorPool.slice(0, 2)] : flavorPool
    let choice
    let tries = 0
    do {
      choice = pool[Math.floor(Math.random() * pool.length)]
      tries += 1
    } while (pool.length > 1 && choice.text === lastRobotMsgRef.current && tries < 6)
    lastRobotMsgRef.current = choice.text
    return choice
  }

  const pickApplicantMessage = () => {
    const flavorPool = APPLICANT_MESSAGES.map(text => ({ text, emoji: null }))
    const pool = applicantInsightsRef.current.length ? applicantInsightsRef.current : flavorPool
    let choice
    let tries = 0
    do {
      choice = pool[Math.floor(Math.random() * pool.length)]
      tries += 1
    } while (pool.length > 1 && choice.text === lastApplicantMsgRef.current && tries < 6)
    lastApplicantMsgRef.current = choice.text
    return choice
  }

  const triggerRobotSpeech = (msgObj = null, duration = 3200) => {
    setShowApplicantSpeech(false) // Hide applicant bubble when robot speaks
    const resolved = msgObj || pickRobotMessage(robotState)
    setRobotSpeech({
      text: resolved.text,
      emoji: resolved.emoji || (robotState === 'hire' ? '🎉' : '🤖'),
      path: resolved.path || null,
    })
    setShowRobotSpeech(true)
    if (SpeechTimerRef.current) clearTimeout(SpeechTimerRef.current)
    SpeechTimerRef.current = setTimeout(() => {
      setShowRobotSpeech(false)
    }, duration)
  }

  const triggerApplicantSpeech = (msgObj = null, duration = 3000) => {
    setShowRobotSpeech(false) // Hide robot bubble when applicant speaks
    const resolved = msgObj || pickApplicantMessage()
    setApplicantSpeech({ text: resolved.text, emoji: resolved.emoji || '📄' })
    setShowApplicantSpeech(true)
    if (ApplicantSpeechTimerRef.current) clearTimeout(ApplicantSpeechTimerRef.current)
    ApplicantSpeechTimerRef.current = setTimeout(() => {
      setShowApplicantSpeech(false)
    }, duration)
  }

  const lastHiringTimeRef = useRef(Date.now() - 120000) // Allow first run after 30s

  // Candidate Idle Action Loop (Changes candidate activity on the left every 6 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (applicantState === 'idle') {
        const nextAction = APPLICANT_IDLE_ACTIONS[Math.floor(Math.random() * APPLICANT_IDLE_ACTIONS.length)]
        setApplicantAction(nextAction)
      }
    }, 6000)
    return () => clearInterval(interval)
  }, [applicantState])

  // Trigger robot to walk to the applicant on extreme left and say "YOU'RE HIRED!"
  // When a real recently-hired candidate is passed in (hireInsight), the whole
  // exchange is personalized with their actual name and job title.
  const triggerHiringEvent = (force = false, hireInsight = null) => {
    const now = Date.now()
    // Unless clicked manually (force=true), enforce a 2.5 minute (150,000ms) cooldown between automated hiring walks
    if (!force && (now - lastHiringTimeRef.current < 150000)) {
      return false
    }
    lastHiringTimeRef.current = now

    setTargetX(10) // Walk over to applicant at 10%
    setRobotState('walk')
    setApplicantState('wave')
    setApplicantAction('wave')

    const walkDist = Math.abs(10 - posX)
    const walkTime = Math.max(1000, (walkDist / 0.4) * 100)

    const candidateName = hireInsight?.candidate?.first_name?.trim()
    const jobTitle = hireInsight?.candidate?.job_title

    // Phase 1: Applicant asks for resume review while robot is walking
    triggerApplicantSpeech(
      candidateName
        ? { text: `Hey Copilot, how's my application for ${jobTitle || 'the role'}?`, emoji: '📄' }
        : { text: 'Hey Copilot, check my resume!', emoji: '📄' },
      walkTime
    )

    if (DwellTimerRef.current) clearTimeout(DwellTimerRef.current)
    DwellTimerRef.current = setTimeout(() => {
      // Phase 2: Robot arrives, turns to candidate, and celebrates "YOU'RE HIRED!" for 2.5s
      setDir(-1) // Face applicant on left
      setRobotState('hire')
      setApplicantState('celebrate')
      triggerRobotSpeech(
        candidateName
          ? { text: `${candidateName}, YOU'RE HIRED for ${jobTitle || 'the role'}! 🎉`, emoji: '🎉' }
          : { text: ROBOT_MESSAGES.hired[Math.floor(Math.random() * ROBOT_MESSAGES.hired.length)], emoji: '🎉' },
        2800
      )

      setTimeout(() => {
        setApplicantState('idle')
        setApplicantAction('idle')

        // Phase 3: Robot walks back out to main topbar playground (20% to 40%) and resumes solo actions
        const returnPos = Math.floor(20 + Math.random() * 20)
        setTargetX(returnPos)
        setRobotState('walk')
        setTimeout(() => setRobotState('sit'), 2000)
      }, 2600)
    }, walkTime)

    return true
  }

  // Periodic eye blink for robot
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      if (Math.random() < 0.4 && robotState !== 'sleep') {
        setBlink(true)
        setTimeout(() => setBlink(false), 180)
      }
    }, 3500)
    return () => clearInterval(blinkInterval)
  }, [robotState])

  // React dynamically to in-app page navigation. This app routes via
  // App.jsx's `currentPage` state rather than the URL, so this listens to
  // that instead of the browser location (which never changes here).
  useEffect(() => {
    if (currentPage && currentPage !== PrevPageRef.current) {
      PrevPageRef.current = currentPage
      setRobotState('peek')
      const label = PAGE_LABELS[currentPage] || 'this page'
      const relevant = pickRobotMessage('peek')
      const showLabel = Math.random() < 0.5 || !relevant?.text
      triggerRobotSpeech(showLabel ? { text: `Now viewing ${label} 👀`, emoji: '🧭' } : relevant, 3500)
    }
  }, [currentPage])

  // Schedule robot solo walks & periodic hiring interaction events (every 2.5 mins)
  const triggerNextAction = () => {
    const now = Date.now()
    // Check if 2.5 minutes have passed since last hiring event
    if (now - lastHiringTimeRef.current >= 150000) {
      const realHire = robotInsightsRef.current.find(i => i.isHireEvent)
      if (triggerHiringEvent(false, realHire)) return
    }

    const nextAction = ACTION_STATES.filter(a => a !== 'hire')[Math.floor(Math.random() * (ACTION_STATES.length - 1))]
    const msg = pickRobotMessage(nextAction)

    if (Math.random() < 0.6) {
      let newTarget = Math.floor(20 + Math.random() * 20)
      setTargetX(newTarget)
      setRobotState('walk')

      const walkDist = Math.abs(newTarget - posX)
      const walkTime = (walkDist / 0.4) * 100

      if (DwellTimerRef.current) clearTimeout(DwellTimerRef.current)
      DwellTimerRef.current = setTimeout(() => {
        setRobotState(nextAction)
        triggerRobotSpeech(msg, 3400)
      }, walkTime)
    } else {
      setRobotState(nextAction)
      triggerRobotSpeech(msg, 3400)
    }
  }

  // Action loop (Every 7.5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isHovered && robotState !== 'walk' && robotState !== 'hire') {
        triggerNextAction()
      }
    }, 7500)
    return () => clearInterval(interval)
  }, [posX, robotState, isHovered])

  // Movement loop for walking
  useEffect(() => {
    if (robotState !== 'walk') return

    const moveTimer = setInterval(() => {
      setPosX((prevX) => {
        const diff = targetX - prevX
        if (Math.abs(diff) <= 0.8) {
          return targetX
        }
        const newDir = diff > 0 ? 1 : -1
        setDir(newDir)
        setLegStep((prev) => !prev)
        return prevX + newDir * 0.4
      })
    }, 90)

    return () => clearInterval(moveTimer)
  }, [robotState, targetX])

  // Handle direct click interaction on Robot. If there's a real, not-yet-
  // celebrated hire in the live data it always gets the walk-over dance;
  // otherwise there's a smaller chance of the dance for fun, and most
  // clicks instead give an instant fresh, data-driven reaction — clicking
  // repeatedly should feel responsive, not replay the same animation.
  const handleRobotClick = (e) => {
    e.stopPropagation()
    const realHire = robotInsightsRef.current.find(i => i.isHireEvent)
    if (realHire || Math.random() < 0.4) {
      triggerHiringEvent(true, realHire)
      return
    }
    const nextState = robotState === 'sleep' || robotState === 'walk' ? 'peek' : robotState
    setRobotState(nextState)
    triggerRobotSpeech(pickRobotMessage('click'), 3400)
  }

  // Handle direct click on Job Seeker
  const handleApplicantClick = (e) => {
    e.stopPropagation()
    triggerApplicantSpeech()
    triggerHiringEvent(true)
  }

  return (
    <div className="relative w-full h-full flex items-center select-none overflow-visible">
      {/* 1. EXTREME LEFT PIXELATED JOB APPLICANT (EXACT SAME SIZE AS ROBOT: w-8 h-8 / 32x32px) */}
      <div
        className="absolute left-0 top-[40%] -translate-y-1/2 flex items-center gap-1.5 cursor-pointer group z-[15]"
        onClick={handleApplicantClick}
        title="Job Candidate — Click to trigger interview & hire!"
      >
        {/* Pixel Applicant SVG (32x32 Grid — Matches Robot size exactly!) */}
        <div className={cn(
          "relative w-8 h-8 shrink-0 flex items-center justify-center transition-transform group-hover:scale-110",
          applicantState === 'celebrate' && "animate-bounce"
        )}>

          {/* APPLICANT SPEECH BUBBLE */}
          {showApplicantSpeech && (
            <div className="absolute top-[calc(100%+2px)] left-0 px-2 py-0.5 bg-surface border border-border shadow-xs rounded-full text-[10.5px] font-medium text-text whitespace-nowrap z-[100] animate-in fade-in slide-in-from-top-1 duration-150 flex items-center gap-1 shrink-0 pointer-events-none">
              <span className="text-[10px]">{applicantSpeech.emoji || '📄'}</span>
              <span className="tracking-tight max-w-[130px] sm:max-w-[170px] truncate">{applicantSpeech.text}</span>
            </div>
          )}

          <svg
            width="32"
            height="32"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="rendering-pixelated drop-shadow-xs"
            style={{ imageRendering: 'pixelated' }}
          >
            {/* Ground Shadow */}
            <ellipse cx="16" cy="30" rx="8" ry="1.8" fill="currentColor" className="text-text3/20" />

            {/* CELEBRATION CONFETTI WHEN HIRED */}
            {applicantState === 'celebrate' && (
              <g className="animate-ping">
                <circle cx="5" cy="5" r="1.5" fill="#3b82f6" />
                <circle cx="27" cy="6" r="1.5" fill="#10b981" />
                <circle cx="16" cy="2" r="1" fill="#f59e0b" />
              </g>
            )}

            {/* APPLICANT CHARACTER BODY */}
            <g className={cn(
              "transition-transform duration-200 origin-bottom",
              applicantAction === 'coffee' && "rotate-1",
              applicantAction === 'phone' && "translate-y-0.5"
            )}>
              {/* HAIR */}
              <rect x="9" y="3" width="14" height="5" fill="#1e293b" rx="1" />
              <rect x="8" y="5" width="4" height="4" fill="#1e293b" />

              {/* HEAD / FACE */}
              <rect x="10" y="7" width="12" height="9" fill="#fed7aa" rx="1" />

              {/* EYES (REACT TO LOOK ACTION) */}
              {applicantAction === 'look' ? (
                <>
                  <rect x="11" y="10" width="2" height="2" fill="#0f172a" />
                  <rect x="17" y="10" width="2" height="2" fill="#0f172a" />
                </>
              ) : (
                <>
                  <rect x="12" y="10" width="2" height="2" fill="#0f172a" />
                  <rect x="18" y="10" width="2" height="2" fill="#0f172a" />
                </>
              )}

              {/* ROSY CHEEKS */}
              <rect x="10" y="12" width="2" height="1" fill="#f43f5e" opacity="0.4" />
              <rect x="20" y="12" width="2" height="1" fill="#f43f5e" opacity="0.4" />

              {/* SMILE */}
              {applicantState === 'celebrate' ? (
                <path d="M14 13 Q16 16 18 13" stroke="#e11d48" strokeWidth="1.5" fill="none" />
              ) : (
                <rect x="15" y="13" width="2" height="1" fill="#e11d48" opacity="0.8" />
              )}

              {/* SHIRT / SUIT */}
              <rect x="8" y="16" width="16" height="9" fill="#2563eb" rx="1" />
              <rect x="14" y="16" width="4" height="5" fill="#ffffff" />
              <rect x="15" y="17" width="2" height="4" fill="#e11d48" /> {/* Tie */}

              {/* IDLE ACTION PROPS */}
              {/* 1. RESUME PAPER IN HAND */}
              <g className={cn("transition-transform", (applicantAction === 'wave' || applicantState === 'wave') && "animate-bounce")}>
                <rect x="2" y="14" width="7" height="9" fill="#ffffff" stroke="#94a3b8" strokeWidth="1" rx="0.5" />
                <line x1="3.5" y1="16" x2="7.5" y2="16" stroke="#334155" strokeWidth="0.8" />
                <line x1="3.5" y1="18" x2="7.5" y2="18" stroke="#334155" strokeWidth="0.8" />
                <line x1="3.5" y1="20" x2="6.5" y2="20" stroke="#38bdf8" strokeWidth="0.8" />
              </g>

              {/* 2. PHONE ACTION */}
              {applicantAction === 'phone' && (
                <g className="animate-pulse">
                  <rect x="23" y="13" width="4" height="6" fill="#0f172a" rx="0.5" />
                  <rect x="24" y="14" width="2" height="4" fill="#38bdf8" />
                </g>
              )}

              {/* 3. COFFEE MUG ACTION */}
              {applicantAction === 'coffee' && (
                <g>
                  <rect x="23" y="18" width="5" height="5" fill="#f97316" rx="0.5" />
                  <rect x="27" y="19" width="2" height="3" fill="#ea580c" />
                  <path d="M25 16 C25 15 26 15 26 14" stroke="#fdba74" strokeWidth="0.8" strokeDasharray="1 1" className="animate-pulse" />
                </g>
              )}

              {/* PANTS & SHOES */}
              <rect x="10" y="25" width="4" height="4" fill="#1e293b" />
              <rect x="18" y="25" width="4" height="4" fill="#1e293b" />
              <rect x="9" y="28" width="5" height="2" fill="#0f172a" />
              <rect x="18" y="28" width="5" height="2" fill="#0f172a" />
            </g>
          </svg>
        </div>
      </div>

      {/* 2. RECRUITMENT PIXEL ROBOT & INLINE HORIZONTAL SPEECH PILL (EXACT SAME SIZE: w-8 h-8 / 32x32px) */}
      <div
        className="absolute top-[40%] -translate-y-1/2 flex items-center gap-2 cursor-pointer transition-all duration-150 ease-out z-[20]"
        style={{ left: `${posX}%` }}
        onClick={handleRobotClick}
        onMouseEnter={() => {
          setIsHovered(true)
          triggerRobotSpeech(null, 3200)
        }}
        onMouseLeave={() => setIsHovered(false)}
        title="Recruitment Copilot — Click to trigger interview & hire! 🎯"
      >
        {/* CHIBI RECRUITMENT PIXEL ROBOT SVG (32x32 Grid) */}
        <div
          className={cn(
            "relative w-8 h-8 shrink-0 flex items-center justify-center transition-all duration-200",
            dir === -1 && "scale-x-[-1]", // Flip horizontally when walking left
            robotState === 'peek' && "translate-y-2 opacity-90",
            robotState === 'sit' && "translate-y-0.5",
            robotState === 'hire' && "animate-bounce"
          )}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="rendering-pixelated drop-shadow-xs"
            style={{ imageRendering: 'pixelated' }}
          >
            {/* Shadow */}
            {robotState !== 'peek' && (
              <ellipse cx="16" cy="30" rx="9" ry="1.8" fill="currentColor" className="text-text3/20" />
            )}

            {/* ROBOT BODY */}
            <g className={cn(
              "transition-transform duration-200 origin-bottom",
              robotState === 'work' && "animate-pulse",
              robotState === 'sleep' && "rotate-2"
            )}>

              {/* FLOATING SLEEP ZZZ PARTICLES */}
              {robotState === 'sleep' && (
                <g className="animate-pulse">
                  <text x="22" y="5" fill="#a855f7" fontSize="7" fontWeight="bold" fontFamily="monospace">Z</text>
                  <text x="27" y="2" fill="#c084fc" fontSize="5" fontWeight="bold" fontFamily="monospace">z</text>
                </g>
              )}

              {/* FLOATING STAR PARTICLES WHEN HIRING */}
              {robotState === 'hire' && (
                <g className="animate-ping">
                  <circle cx="5" cy="6" r="1.5" fill="#f59e0b" />
                  <circle cx="27" cy="8" r="1.5" fill="#10b981" />
                </g>
              )}

              {/* ANTENNA WITH GLOWING TECH TIP */}
              <rect x="15" y="3" width="2" height="4" fill="#475569" />
              <rect
                x="14"
                y="1"
                width="4"
                height="2"
                className={cn(
                  "transition-colors duration-300",
                  robotState === 'hire' ? "fill-amber-400 animate-ping" :
                  robotState === 'sleep' ? "fill-slate-500" :
                  robotState === 'coffee' ? "fill-emerald-400" :
                  "fill-sky-400 animate-pulse"
                )}
              />
              <rect x="15" y="0" width="2" height="1" fill="#38bdf8" />

              {/* CHIBI HEAD */}
              <rect x="7" y="5" width="18" height="12" rx="2" fill="#334155" />
              <rect x="8" y="6" width="16" height="10" fill="#1e293b" />

              {/* FACE SCREEN */}
              <rect x="9" y="7" width="14" height="8" fill="#0f172a" />

              {/* EXPRESSIVE RECRUITING EYES */}
              {blink ? (
                <>
                  <rect x="11" y="11" width="3" height="1" fill="#38bdf8" />
                  <rect x="18" y="11" width="3" height="1" fill="#38bdf8" />
                </>
              ) : robotState === 'hire' ? (
                // Star Eyes (⭐ ⭐)
                <>
                  <rect x="11" y="9" width="3" height="3" fill="#f59e0b" />
                  <rect x="18" y="9" width="3" height="3" fill="#f59e0b" />
                  <rect x="12" y="8" width="1" height="5" fill="#fbbf24" />
                  <rect x="19" y="8" width="1" height="5" fill="#fbbf24" />
                </>
              ) : robotState === 'sleep' ? (
                <>
                  <rect x="11" y="11" width="3" height="1" fill="#94a3b8" />
                  <rect x="18" y="11" width="3" height="1" fill="#94a3b8" />
                </>
              ) : robotState === 'peek' ? (
                <>
                  <rect x="10" y="8" width="4" height="4" fill="#38bdf8" />
                  <rect x="18" y="8" width="4" height="4" fill="#38bdf8" />
                  <rect x="11" y="9" width="2" height="2" fill="#ffffff" />
                  <rect x="19" y="9" width="2" height="2" fill="#ffffff" />
                </>
              ) : robotState === 'coffee' || robotState === 'sit' ? (
                <>
                  <path d="M11 11 L13 9 L15 11" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="square" fill="none" />
                  <path d="M17 11 L19 9 L21 11" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="square" fill="none" />
                </>
              ) : (
                <>
                  <rect x="11" y="9" width="3" height="3" fill="#38bdf8" className="animate-pulse" />
                  <rect x="18" y="9" width="3" height="3" fill="#38bdf8" className="animate-pulse" />
                  <rect x="11" y="9" width="1" height="1" fill="#ffffff" />
                  <rect x="18" y="9" width="1" height="1" fill="#ffffff" />
                </>
              )}

              {/* CHEEK ACCENTS */}
              <rect x="8" y="12" width="2" height="1" fill="#38bdf8" opacity="0.4" />
              <rect x="22" y="12" width="2" height="1" fill="#38bdf8" opacity="0.4" />

              {/* MOUTH */}
              <rect x="15" y="13" width="2" height="1" fill="#38bdf8" opacity="0.8" />

              {/* NECK */}
              <rect x="14" y="17" width="4" height="2" fill="#64748b" />

              {/* CHIBI BODY */}
              <rect x="9" y="19" width="14" height="8" rx="1" fill="#334155" />
              <rect x="10" y="20" width="12" height="6" fill="#1e293b" />

              {/* CHEST AI TECH INDICATOR SCREEN */}
              <rect x="13" y="21" width="6" height="4" fill="#0f172a" />
              <rect
                x="15"
                y="22"
                width="2"
                height="2"
                className={cn(
                  robotState === 'hire' ? "fill-amber-400 animate-ping" :
                  robotState === 'sleep' ? "fill-slate-600" :
                  robotState === 'coffee' ? "fill-emerald-400" :
                  "fill-sky-400 animate-pulse"
                )}
              />

              {/* CHIBI FEET */}
              {robotState === 'walk' ? (
                legStep ? (
                  <>
                    <rect x="10" y="27" width="4" height="3" fill="#475569" />
                    <rect x="9" y="29" width="5" height="2" fill="#0f172a" />
                    <rect x="18" y="27" width="4" height="2" fill="#334155" />
                    <rect x="19" y="28" width="4" height="2" fill="#0f172a" />
                  </>
                ) : (
                  <>
                    <rect x="11" y="27" width="3" height="2" fill="#334155" />
                    <rect x="10" y="28" width="4" height="2" fill="#0f172a" />
                    <rect x="17" y="27" width="4" height="3" fill="#475569" />
                    <rect x="17" y="29" width="5" height="2" fill="#0f172a" />
                  </>
                )
              ) : robotState === 'sit' ? (
                <>
                  <rect x="9" y="26" width="5" height="3" fill="#475569" />
                  <rect x="18" y="26" width="5" height="3" fill="#475569" />
                  <rect x="8" y="28" width="5" height="2" fill="#0f172a" />
                  <rect x="19" y="28" width="5" height="2" fill="#0f172a" />
                </>
              ) : (
                <>
                  <rect x="10" y="27" width="4" height="3" fill="#475569" />
                  <rect x="18" y="27" width="4" height="3" fill="#475569" />
                  <rect x="9" y="29" width="5" height="2" fill="#0f172a" />
                  <rect x="18" y="29" width="5" height="2" fill="#0f172a" />
                </>
              )}

              {/* STATE PROPS */}
              {robotState === 'work' && (
                <>
                  <rect x="3" y="22" width="7" height="5" fill="#475569" />
                  <rect x="4" y="23" width="5" height="3" fill="#38bdf8" opacity="0.9" />
                  <rect x="2" y="26" width="9" height="2" fill="#0f172a" />
                </>
              )}

              {robotState === 'coffee' && (
                <>
                  <rect x="3" y="21" width="5" height="6" fill="#f97316" />
                  <rect x="2" y="23" width="2" height="2" fill="#ea580c" />
                  <path d="M4 19 C4 18 5 18 5 17" stroke="#fdba74" strokeWidth="1" strokeDasharray="1 1" className="animate-pulse" />
                </>
              )}
            </g>
          </svg>

          {/* Status Indicator Dot */}
          <span
            className={cn(
              "absolute -top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-background shadow-xs",
              robotState === 'sleep' ? "bg-slate-500" :
              robotState === 'hire' ? "bg-amber-400 animate-ping" :
              "bg-emerald-400 animate-pulse"
            )}
          />
        </div>

        {/* SPEECH PILL BELOW ROBOT — sits in bottom space of TopBar */}
        {(showRobotSpeech || isHovered) && !showApplicantSpeech && (
          <div className={cn(
            "absolute top-[calc(100%+2px)] z-[100] animate-in fade-in slide-in-from-top-1 duration-150 pointer-events-auto",
            posX > 35 ? "right-0" : "left-0"
          )}>
            {robotSpeech.path ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onNavigate?.(robotSpeech.path) }}
                className="px-2 py-0.5 bg-surface border border-accent/40 hover:border-accent hover:bg-accent/10 shadow-xs rounded-full text-[10.5px] font-medium text-text whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer"
                title="Click to view"
              >
                <span className="text-[10px]">{robotSpeech.emoji || '🤖'}</span>
                <span className="tracking-tight max-w-[130px] sm:max-w-[180px] truncate">{robotSpeech.text}</span>
              </button>
            ) : (
              <div className="px-2 py-0.5 bg-surface border border-border shadow-xs rounded-full text-[10.5px] font-medium text-text whitespace-nowrap flex items-center gap-1 pointer-events-none">
                <span className="text-[10px]">{robotSpeech.emoji || '🤖'}</span>
                <span className="tracking-tight max-w-[130px] sm:max-w-[180px] truncate">{robotSpeech.text}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
