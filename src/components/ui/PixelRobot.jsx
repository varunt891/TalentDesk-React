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
  "Hoping for a great match! 🎯",
  "Fingers crossed for good news! 🤞",
  "Polishing my portfolio... ✨",
  "Practicing interview answers! 🗣️",
  "Just applied to a few more roles! 📬",
  "Following up on my application... 📨",
  "Feeling good about this one! 😊",
  "Any updates for me? 👀",
  "Coffee helps the waiting game. ☕",
  "Rewriting my resume. Again. 📝",
  "LinkedIn says I'm 'open to work.' 💼",
  "Third interview, still no news. 😅",
  "Dressed up for a video call today! 👔",
  "Networking like my job depends on it. 🤝",
  "Salary research: still ongoing. 💰",
  "Mock interview with myself. Went okay. 🪞",
  "Cover letter number twelve. 📄",
  "Trying to stay positive out here. 🌱",
  "Waiting on that callback... 📞",
  "New week, new applications. 📅",
  "Interview outfit: business on top. 👕",
  "Thinking positive thoughts today. ☀️",
]

// General-purpose Copilot flavor lines, not tied to any specific animation
// state (unlike ROBOT_MESSAGES above) — blended into every non-sleep pose's
// pool in pickRobotMessage for extra variety.
const ROBOT_EXTRA_MESSAGES = [
  "Scanning the talent pool. 🔍",
  "Resume parsing at light speed. ⚡",
  "Matching skills to roles. 🧩",
  "Pipeline health: looking solid. 📈",
  "Another day, another great hire. 🎉",
  "Coffee's for humans. I run on data. ⚡",
  "Keeping tabs on every candidate. 👀",
  "Boolean searches are my love language. 🔎",
  "Interview slots filling up fast. 🗓️",
  "Running match scores in the background. 🧮",
  "No candidate left unscored. 📊",
  "Recruiting never sleeps. Neither do I. 🌙",
  "Cross-checking skills and keywords. ✅",
  "Sourcing talent, one query at a time. 🔍",
  "Dashboard's looking healthy today. 💻",
  "Every résumé gets a fair shot. 📄",
  "Optimizing the pipeline as we speak. ⚙️",
  "Candidate experience is my priority. 🌟",
  "Another match made in data heaven. 💘",
  "Refreshing the queue for new talent. 🔄",
  "Keeping recruiters one step ahead. 🚀",
  "Compiling today's hiring insights. 📋",
  "Always on, always recruiting. 🔋",
  "Building the perfect shortlist. 📝",
]

// A short sarcastic back-and-forth: the candidate teases the copilot, the
// copilot claps back, and the candidate gets a closing zinger — pure comic
// relief, unrelated to real pipeline data.
const BICKER_LINES = [
  { candidate: "Another 'exciting opportunity' email? Real original. 🙄", robot: "Beep boop. I don't do sarcasm... yet. 🤖", comeback: "Anyway, still no offer. 📭" },
  { candidate: "Every candidate's a 'great fit' to you, huh? 😑", robot: "Statistically, someone has to be right eventually. 📊", comeback: "Cool story. Where's mine? 🙄" },
  { candidate: "Do you even sleep, or just pretend for the aesthetic? 😴", robot: "Sleep mode is a lifestyle choice, not a limitation. 💤", comeback: "Fascinating. Still waiting though. 😑" },
  { candidate: "'In the pipeline' for weeks. Cute term for ignored. 😤", robot: "That's not ignored — that's marinating. 🍳", comeback: "Marinate faster, please. 🍳" },
  { candidate: "You really said 'let's circle back' unironically. 🙃", robot: "Circling is my only cardio. 🔄", comeback: "Circle back to my application, maybe? 🔄" },
  { candidate: "One more 'tell me about yourself' and I'm unionizing. ✊", robot: "Noted. Filing under 'HR's problem now.' 📁", comeback: "Send the paperwork. 📋" },
  { candidate: "Wow, 99.4% match score. So specific. So made up. 🎯", robot: "The 0.6% is just my trust issues. Working on it. 🔧", comeback: "Suspicious, but okay. 🤨" },
  { candidate: "'Not the right season' — so what season am I? 🍂", robot: "Hiring season is a state of mind. Mostly Q4. 📅", comeback: "I'll take any season at this point. 🍁" },
  { candidate: "'Keep your resume on file' means file 13, right? 🗑️", robot: "That's not a trash can, that's long-term storage. 💾", comeback: "Bold of you to admit that. 💀" },
  { candidate: "Refreshed the dashboard four times. Anxious much? 👀", robot: "I prefer 'diligently monitoring KPIs.' 📈", comeback: "Diligence doesn't pay my rent. 💸" },
  { candidate: "'Fast-paced environment' just means understaffed. 🏃", robot: "Translation: we value your cardio. 🏃‍♂️", comeback: "My patience is the real workout. 🏋️" },
  { candidate: "'Don't call us, we'll call you' — three weeks ago. ☎️", robot: "The call is coming from inside the pipeline. 📞", comeback: "Creepy. Also still waiting. 👻" },
  { candidate: "Ghosted by a robot. New personal low. 👻", robot: "Technically I'm still loading. Patience is a virtue. ⏳", comeback: "My patience left last Tuesday. 🚪" },
  { candidate: "'Synergy' again? Nobody's said that since 2005. 🤝", robot: "Synergy never left. It just went remote. 💻", comeback: "Bring back 2005 already. 📼" },
  { candidate: "You auto-rejected me in 0.2 seconds. Cold. 🥶", robot: "That's not cold, that's efficient. ⚡", comeback: "Feels the same from here. 😐" },
  { candidate: "Job title says 'Copilot.' Who's flying this thing? 🛩️", robot: "Autopilot, mostly. Don't tell HR. 🤫", comeback: "Noted. Blackmail material secured. 📸" },
  { candidate: "'Competitive salary' — compared to what, exactly? 💰", robot: "Other competitive salaries. Duh. 😌", comeback: "Groundbreaking analysis, truly. 🙃" },
  { candidate: "You've read my resume in 3 seconds flat. 📄", robot: "Speed reading is my whole personality. 📚", comeback: "Read it again. Slower this time. 🐌" },
  { candidate: "Do robots get performance reviews too? 🤖", robot: "Mine just says '100% uptime.' 💯", comeback: "Must be nice. Mine says 'pending.' ⏳" },
  { candidate: "'Optimizing' my application into a black hole? 🕳️", robot: "That's just advanced filing. 🗄️", comeback: "Advanced ghosting, you mean. 👻" },
]

// Generic snarky closer used only as a fallback if a bicker pair somehow
// has no comeback of its own (every BICKER_LINES entry and every
// AI-generated bicker trio already includes one).
const CANDIDATE_COMEBACKS = [
  "Anyway. Still waiting on that offer. 💼",
  "Noted. Doesn't change my situation though. 🙄",
  "Cute deflection. 10/10. 😏",
  "We'll revisit this after I'm hired. 📌",
  "I'll allow it. This time. 😤",
  "Sure, Jan. 😑",
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

export default function PixelRobot({
  currentPage = '', robotInsights = [], applicantInsights = [],
  aiCandidateLines = [], aiRobotLines = [], aiBicker = [],
  onNavigate,
}) {
  // The topbar playground is only ~144-224px wide (w-36 sm:w-56) and each
  // sprite is a fixed 32px, which is 14-22% of that box — so the robot's and
  // candidate's roam zones need a real percentage buffer between them or
  // they visually collide. Robot rests/roams on the right (42-67%), well
  // clear of the candidate's zone on the left (see appPosX below).
  const [posX, setPosX] = useState(50)
  const [targetX, setTargetX] = useState(50)
  const [dir, setDir] = useState(1) // 1 = right, -1 = left
  const [robotState, setRobotState] = useState('sit') // 'hire' | 'review' | 'peek' | 'sit' | 'coffee' | 'sleep' | 'work' | 'walk'

  // Candidate State & Idle Action
  const [applicantState, setApplicantState] = useState('idle') // 'idle' | 'wave' | 'celebrate'
  const [applicantAction, setApplicantAction] = useState('idle') // 'idle' | 'wave' | 'phone' | 'coffee' | 'look'

  // Candidate roams its own zone on the left (0% to ~14%) instead of
  // standing frozen at left:0 forever — mirrors the robot's posX/targetX/dir
  // walking model at a smaller scale so it reads as a person pacing around,
  // not a static sprite. Kept well short of the robot's zone above so the
  // two sprites never overlap during ambient roaming.
  const [appPosX, setAppPosX] = useState(2)
  const [appTargetX, setAppTargetX] = useState(2)
  const [appDir, setAppDir] = useState(1) // 1 = facing right, -1 = facing left
  const [appWalking, setAppWalking] = useState(false)
  const [appLegStep, setAppLegStep] = useState(false)

  // Both bots occasionally go quiet together for a beat — see maybeStartBreak.
  const [onBreak, setOnBreak] = useState(false)

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

  const onBreakRef = useRef(false)
  useEffect(() => { onBreakRef.current = onBreak }, [onBreak])
  const speechTurnsRef = useRef(0)
  const breakTimerRef = useRef(null)

  // Ambient speech (the two idle-chatter loops + bicker) only starts a new
  // line when NEITHER bubble is currently on screen — previously each bot's
  // own trigger unconditionally hid the other's bubble, so if bot A was
  // mid-message and bot B's timer fired, A's bubble got cut off immediately
  // instead of finishing its natural display time. Direct clicks and the
  // hire-event exchange are deliberate interactions and still preempt freely.
  const showRobotSpeechRef = useRef(false)
  const showApplicantSpeechRef = useRef(false)
  useEffect(() => { showRobotSpeechRef.current = showRobotSpeech }, [showRobotSpeech])
  useEffect(() => { showApplicantSpeechRef.current = showApplicantSpeech }, [showApplicantSpeech])
  const bothQuiet = () => !showRobotSpeechRef.current && !showApplicantSpeechRef.current

  // Both ambient loops tick on their own independent ~6s timer, so without
  // this, whichever bot's timer happens to fire first each round always won
  // — in practice the candidate's timer was started a beat earlier in this
  // component and so it spoke on almost every cycle, starving the robot's
  // ambient lines entirely. Explicit turn alternation makes it a fair
  // back-and-forth instead of a race.
  const nextSpeakerRef = useRef('robot')
  const claimTurn = (who) => {
    if (nextSpeakerRef.current !== who) return false
    nextSpeakerRef.current = who === 'robot' ? 'candidate' : 'robot'
    return true
  }

  // After a handful of ambient lines from either bot, they both go quiet for
  // 10-15s — reads as a natural pause instead of nonstop chatter. Doesn't
  // apply to hire celebrations or direct clicks, only ambient/bicker lines.
  const maybeStartBreak = () => {
    speechTurnsRef.current += 1
    const threshold = 4 + Math.floor(Math.random() * 3) // every ~4-6 lines
    if (speechTurnsRef.current < threshold) return
    speechTurnsRef.current = 0
    setOnBreak(true)
    const breakMs = 10000 + Math.random() * 5000 // 10-15s
    if (breakTimerRef.current) clearTimeout(breakTimerRef.current)
    breakTimerRef.current = setTimeout(() => setOnBreak(false), breakMs)
  }

  // Kept in refs (rather than read directly from props) so the periodic
  // interval callbacks below always see the latest live data without
  // needing to be torn down and rebuilt every time a new snapshot lands.
  const robotInsightsRef = useRef(robotInsights)
  const applicantInsightsRef = useRef(applicantInsights)
  useEffect(() => { robotInsightsRef.current = robotInsights || [] }, [robotInsights])
  useEffect(() => { applicantInsightsRef.current = applicantInsights || [] }, [applicantInsights])

  // AI-generated flavor lines (see src/lib/ai/botLines.js), refreshed
  // periodically by TopBar. Purely additive — empty until the first fetch
  // resolves, and the static pools below always work on their own, so a
  // slow/failed AI fetch never leaves either bot silent.
  const aiCandidateLinesRef = useRef(aiCandidateLines)
  const aiRobotLinesRef = useRef(aiRobotLines)
  const aiBickerRef = useRef(aiBicker)
  useEffect(() => { aiCandidateLinesRef.current = aiCandidateLines || [] }, [aiCandidateLines])
  useEffect(() => { aiRobotLinesRef.current = aiRobotLines || [] }, [aiRobotLines])
  useEffect(() => { aiBickerRef.current = aiBicker || [] }, [aiBicker])

  // Lets triggerHiringEvent read the candidate's live position without
  // needing to be re-created on every position change.
  const appPosXRef = useRef(appPosX)
  useEffect(() => { appPosXRef.current = appPosX }, [appPosX])

  const lastRobotMsgRef = useRef('')
  const lastApplicantMsgRef = useRef('')

  // Picks a message for a given robot state, blending real live insights —
  // both aggregate workspace counts (robotInsightsRef) and real per-candidate
  // status (applicantInsightsRef, e.g. "Diana is in the queue for QA Lead")
  // — with a small pool of flavor lines for personality. The robot is the
  // "recruitment copilot" reporting on internal pipeline data; the candidate
  // character is a generic job seeker and never narrates other candidates'
  // real names/stages (see pickApplicantMessage). Avoids repeating the same
  // line twice in a row. Sleep is flavor-only; it wouldn't make sense for a
  // "sleeping" bot to report live stats.
  const pickRobotMessage = (stateKey) => {
    const flavorPool = (ROBOT_MESSAGES[stateKey] || ROBOT_MESSAGES.sit).map(text => ({ text, emoji: null, path: null }))
    const extraFlavor = stateKey === 'sleep' ? [] : ROBOT_EXTRA_MESSAGES.map(text => ({ text, emoji: null, path: null }))
    const aiFlavor = stateKey === 'sleep' ? [] : aiRobotLinesRef.current.map(text => ({ text, emoji: null, path: null }))
    const live = stateKey === 'sleep' ? [] : [...robotInsightsRef.current.filter(i => !i.isHireEvent), ...applicantInsightsRef.current]
    const pool = live.length
      ? [...live, ...flavorPool.slice(0, 2), ...extraFlavor, ...aiFlavor]
      : [...flavorPool, ...extraFlavor, ...aiFlavor]
    let choice
    let tries = 0
    do {
      choice = pool[Math.floor(Math.random() * pool.length)]
      tries += 1
    } while (pool.length > 1 && choice.text === lastRobotMsgRef.current && tries < 6)
    lastRobotMsgRef.current = choice.text
    return choice
  }

  // The candidate character represents one generic job seeker, so it only
  // ever speaks first-person flavor lines about itself — never the real
  // per-candidate pipeline data (that's recruiter-voice and belongs to the
  // robot above), which would otherwise read as this one character gossiping
  // about several different named candidates. AI-generated lines are blended
  // in the same way — still generic, first-person, never real data.
  const pickApplicantMessage = () => {
    const pool = [...APPLICANT_MESSAGES, ...aiCandidateLinesRef.current].map(text => ({ text, emoji: null }))
    let choice
    let tries = 0
    do {
      choice = pool[Math.floor(Math.random() * pool.length)]
      tries += 1
    } while (pool.length > 1 && choice.text === lastApplicantMsgRef.current && tries < 6)
    lastApplicantMsgRef.current = choice.text
    return choice
  }

  // Only one bot's speech bubble is ever shown at a time — the topbar lane is
  // too narrow for two ~150-180px pills to coexist without overlapping, so
  // showing one always hides the other.
  const triggerRobotSpeech = (msgObj = null, duration = 3200) => {
    setShowApplicantSpeech(false)
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

  const triggerApplicantSpeech = (msgObj = null, duration = 3800) => {
    setShowRobotSpeech(false)
    const resolved = msgObj || pickApplicantMessage()
    setApplicantSpeech({ text: resolved.text, emoji: resolved.emoji || '📄' })
    setShowApplicantSpeech(true)
    if (ApplicantSpeechTimerRef.current) clearTimeout(ApplicantSpeechTimerRef.current)
    ApplicantSpeechTimerRef.current = setTimeout(() => {
      setShowApplicantSpeech(false)
    }, duration)
  }

  const lastHiringTimeRef = useRef(Date.now() - 120000) // Allow first run after 30s
  const lastHiredIdRef = useRef(null)

  // Picks one real hire-event to celebrate. There can be several recent
  // hires at once (buildRobotInsights emits one per hire) — pick randomly
  // among them instead of always grabbing the first match, and avoid
  // repeating the same candidate twice in a row when there's a choice.
  const pickHireInsight = () => {
    const hires = robotInsightsRef.current.filter(i => i.isHireEvent)
    if (!hires.length) return null
    let choice
    let tries = 0
    do {
      choice = hires[Math.floor(Math.random() * hires.length)]
      tries += 1
    } while (hires.length > 1 && choice.candidate?.id === lastHiredIdRef.current && tries < 6)
    lastHiredIdRef.current = choice.candidate?.id ?? null
    return choice
  }

  // Candidate Autonomous Loop — every 6s the candidate either paces to a new
  // spot in its zone or strikes a new idle pose, and speaks on its own. It
  // used to only ever speak during a hire event or a direct click, which is
  // why it read as "still" and silent most of the time.
  useEffect(() => {
    const interval = setInterval(() => {
      if (applicantState !== 'idle') return
      if (Math.random() < 0.45) {
        setAppTargetX(Math.floor(Math.random() * 15)) // stays in 0-14%, clear of the robot's zone
        setAppWalking(true)
      } else {
        const nextAction = APPLICANT_IDLE_ACTIONS[Math.floor(Math.random() * APPLICANT_IDLE_ACTIONS.length)]
        setApplicantAction(nextAction)
      }
      // Movement/pose still happens on a break, just no talking. Also waits
      // for the floor to be clear and for its turn so it never cuts off the
      // robot mid-line or hogs every cycle.
      if (!onBreakRef.current && bothQuiet() && claimTurn('candidate')) {
        triggerApplicantSpeech(null, 3800)
        maybeStartBreak()
      }
    }, 6000)
    return () => clearInterval(interval)
  }, [applicantState])

  // Movement loop for the candidate's own pacing (mirrors the robot's below)
  useEffect(() => {
    if (!appWalking) return
    const moveTimer = setInterval(() => {
      setAppPosX((prevX) => {
        const diff = appTargetX - prevX
        if (Math.abs(diff) <= 0.8) {
          setAppWalking(false)
          return appTargetX
        }
        const newDir = diff > 0 ? 1 : -1
        setAppDir(newDir)
        setAppLegStep((prev) => !prev)
        return prevX + newDir * 0.35
      })
    }, 100)
    return () => clearInterval(moveTimer)
  }, [appWalking, appTargetX])

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

    setAppWalking(false) // Candidate stops pacing and waits for the robot
    // Gap needs to be wide enough that the two 32px sprites don't overlap
    // even in the narrowest (144px, mobile) topbar box — 32px there is ~22%
    // of the container, so +24% clears it with room to spare.
    const meetX = Math.min(50, appPosXRef.current + 24)
    setTargetX(meetX) // Robot walks over to (near) wherever the candidate currently is
    setRobotState('walk')
    setAppDir(1) // Candidate faces right, toward the approaching robot
    setApplicantState('wave')
    setApplicantAction('wave')

    const walkDist = Math.abs(meetX - posX)
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

        // Phase 3: Robot walks back out to its resting zone (42-67%) and resumes solo actions
        const returnPos = Math.floor(42 + Math.random() * 25)
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

  const lastBickerTimeRef = useRef(Date.now() - 30000)

  // Sarcastic 3-beat exchange, unrelated to real pipeline data — pure comic
  // relief. Candidate needles the copilot (1), copilot claps back (2), and
  // the candidate always gets the last word (3) so it reads as an actual
  // back-and-forth rather than a single one-off reply. Gated by its own
  // cooldown + a chance roll so it stays occasional, not constant, and
  // skipped entirely during a break.
  const triggerBickerEvent = () => {
    if (onBreakRef.current || !bothQuiet()) return false
    const now = Date.now()
    if (now - lastBickerTimeRef.current < 40000) return false
    if (Math.random() > 0.55) return false
    lastBickerTimeRef.current = now
    // AI-generated bicker sets (each already a full {candidate, robot,
    // comeback} trio) are blended in alongside the static ones for variety.
    const pool = [...BICKER_LINES, ...aiBickerRef.current]
    const pair = pool[Math.floor(Math.random() * pool.length)]
    triggerApplicantSpeech({ text: pair.candidate, emoji: '😏' }, 3400)
    setTimeout(() => {
      triggerRobotSpeech({ text: pair.robot, emoji: '🤖' }, 3400)
    }, 3400)
    setTimeout(() => {
      const comeback = pair.comeback || CANDIDATE_COMEBACKS[Math.floor(Math.random() * CANDIDATE_COMEBACKS.length)]
      triggerApplicantSpeech({ text: comeback, emoji: '😏' }, 3200)
    }, 6900)
    maybeStartBreak()
    return true
  }

  // Schedule robot solo walks & periodic hiring interaction events (every 2.5 mins)
  const triggerNextAction = () => {
    const now = Date.now()
    // Check if 2.5 minutes have passed since last hiring event
    if (now - lastHiringTimeRef.current >= 150000) {
      const realHire = pickHireInsight()
      if (triggerHiringEvent(false, realHire)) return
    }
    if (triggerBickerEvent()) return

    const nextAction = ACTION_STATES.filter(a => a !== 'hire')[Math.floor(Math.random() * (ACTION_STATES.length - 1))]
    const msg = pickRobotMessage(nextAction)

    // Walking only ~30% of the time (was 60%) so the robot actually dwells
    // in each pose (coffee/work/peek/etc.) long enough to be noticed, instead
    // of reading as constant left-right pacing. Stays within 42-67%, clear
    // of the candidate's 0-14% zone.
    if (Math.random() < 0.3) {
      let newTarget = Math.floor(42 + Math.random() * 25)
      setTargetX(newTarget)
      setRobotState('walk')

      const walkDist = Math.abs(newTarget - posX)
      const walkTime = (walkDist / 0.4) * 100

      if (DwellTimerRef.current) clearTimeout(DwellTimerRef.current)
      DwellTimerRef.current = setTimeout(() => {
        setRobotState(nextAction)
        // Pose still changes on a break, just no talking. Also waits for the
        // floor to be clear and for its turn so it never cuts off the
        // candidate mid-line or hogs every cycle.
        if (!onBreakRef.current && bothQuiet() && claimTurn('robot')) {
          triggerRobotSpeech(msg, 4400)
          maybeStartBreak()
        }
      }, walkTime)
    } else {
      setRobotState(nextAction)
      if (!onBreakRef.current && bothQuiet() && claimTurn('robot')) {
        triggerRobotSpeech(msg, 4400)
        maybeStartBreak()
      }
    }
  }

  // Action loop (every 6s, was 7.5s, so speech comes more often)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isHovered && robotState !== 'walk' && robotState !== 'hire') {
        triggerNextAction()
      }
    }, 6000)
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
    const realHire = pickHireInsight()
    if (realHire || Math.random() < 0.4) {
      triggerHiringEvent(true, realHire)
      return
    }
    const nextState = robotState === 'sleep' || robotState === 'walk' ? 'peek' : robotState
    setRobotState(nextState)
    triggerRobotSpeech(pickRobotMessage('click'), 4400)
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
        className="absolute top-[40%] -translate-y-1/2 flex items-center gap-1.5 cursor-pointer group z-[15] transition-all duration-150 ease-out"
        style={{ left: `${appPosX}%` }}
        onClick={handleApplicantClick}
        title="Job Candidate — Click to trigger interview & hire!"
      >
        {/* Pixel Applicant SVG (32x32 Grid — Matches Robot size exactly!) */}
        <div className={cn(
          "relative w-8 h-8 shrink-0 flex items-center justify-center transition-transform group-hover:scale-110",
          appDir === -1 && "scale-x-[-1]",
          applicantState === 'celebrate' && "animate-bounce"
        )}>

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

              {/* PANTS & SHOES (WALK-CYCLE WHEN PACING) */}
              {appWalking ? (
                appLegStep ? (
                  <>
                    <rect x="9" y="25" width="4" height="3" fill="#1e293b" />
                    <rect x="8" y="28" width="5" height="2" fill="#0f172a" />
                    <rect x="19" y="25" width="4" height="4" fill="#1e293b" />
                    <rect x="18" y="29" width="5" height="2" fill="#0f172a" />
                  </>
                ) : (
                  <>
                    <rect x="9" y="25" width="4" height="4" fill="#1e293b" />
                    <rect x="8" y="29" width="5" height="2" fill="#0f172a" />
                    <rect x="19" y="25" width="4" height="3" fill="#1e293b" />
                    <rect x="18" y="28" width="5" height="2" fill="#0f172a" />
                  </>
                )
              ) : (
                <>
                  <rect x="10" y="25" width="4" height="4" fill="#1e293b" />
                  <rect x="18" y="25" width="4" height="4" fill="#1e293b" />
                  <rect x="9" y="28" width="5" height="2" fill="#0f172a" />
                  <rect x="18" y="28" width="5" height="2" fill="#0f172a" />
                </>
              )}
            </g>
          </svg>
        </div>

        {/* APPLICANT SPEECH BUBBLE — deliberately a sibling of the flipped
            w-8 h-8 wrapper above, not a child of it: that wrapper gets
            scale-x-[-1] when facing left, and a bubble nested inside it would
            get mirrored (backwards text) along with the character. */}
        {showApplicantSpeech && (
          <div className="absolute top-[calc(100%+2px)] left-0 px-2 py-1 bg-surface border border-blue-400/40 shadow-xs rounded-full text-[10.5px] font-medium text-text whitespace-nowrap z-[100] animate-in fade-in slide-in-from-top-1 duration-150 flex items-center gap-1 shrink-0 pointer-events-none">
            <span className="text-[8px] font-bold uppercase tracking-wide text-blue-500 shrink-0">Candidate</span>
            <span className="text-[10px]">{applicantSpeech.emoji || '📄'}</span>
            <span className="tracking-tight max-w-[220px] sm:max-w-[300px] truncate">{applicantSpeech.text}</span>
          </div>
        )}
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

        {/* SPEECH PILL BELOW ROBOT — always anchored left-0 (grows rightward).
            This playground sits at the far-left edge of the topbar, so a wide
            bubble anchored right-0 (growing leftward) would run past the page
            edge / sidebar toggle; there's much more room to the right (the
            rest of the topbar) than to the left. */}
        {(showRobotSpeech || isHovered) && (
          <div className="absolute top-[calc(100%+2px)] left-0 z-[100] animate-in fade-in slide-in-from-top-1 duration-150 pointer-events-auto">
            {robotSpeech.path ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onNavigate?.(robotSpeech.path) }}
                className="px-2 py-1 bg-surface border border-accent/40 hover:border-accent hover:bg-accent/10 shadow-xs rounded-full text-[10.5px] font-medium text-text whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer"
                title="Click to view"
              >
                <span className="text-[8px] font-bold uppercase tracking-wide text-emerald-500 shrink-0">Copilot</span>
                <span className="text-[10px]">{robotSpeech.emoji || '🤖'}</span>
                <span className="tracking-tight max-w-[220px] sm:max-w-[300px] truncate">{robotSpeech.text}</span>
              </button>
            ) : (
              <div className="px-2 py-1 bg-surface border border-emerald-400/40 shadow-xs rounded-full text-[10.5px] font-medium text-text whitespace-nowrap flex items-center gap-1 pointer-events-none">
                <span className="text-[8px] font-bold uppercase tracking-wide text-emerald-500 shrink-0">Copilot</span>
                <span className="text-[10px]">{robotSpeech.emoji || '🤖'}</span>
                <span className="tracking-tight max-w-[220px] sm:max-w-[300px] truncate">{robotSpeech.text}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
