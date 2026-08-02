import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { db } from '../lib/api'
import { Button, Icon } from './ui'

const TZ_MAP = {
  EST: 'America/New_York',
  EDT: 'America/New_York',
  ET: 'America/New_York',
  CST: 'America/Chicago',
  CDT: 'America/Chicago',
  CT: 'America/Chicago',
  MST: 'America/Denver',
  MDT: 'America/Denver',
  MT: 'America/Denver',
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles',
  PT: 'America/Los_Angeles',
  IST: 'Asia/Kolkata',
  UTC: 'UTC',
  GMT: 'UTC',
}

function parseTime(timeStr) {
  if (!timeStr) return { hours: 9, minutes: 0 }
  const clean = String(timeStr).trim().toUpperCase()
  const isPM = clean.includes('PM')
  const isAM = clean.includes('AM')
  const match = clean.match(/(\d{1,2}):(\d{2})/)
  if (!match) return { hours: 9, minutes: 0 }
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  if (isPM && hours < 12) hours += 12
  if (isAM && hours === 12) hours = 0
  return { hours, minutes }
}

function getTargetUtcTimestamp(dateStr, timeStr, tzAbbr) {
  if (!dateStr) return null
  const { hours, minutes } = parseTime(timeStr)
  const parts = dateStr.slice(0, 10).split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  const [y, m, d] = parts

  const tzUpper = String(tzAbbr || 'EST').trim().toUpperCase()
  const ianaName = TZ_MAP[tzUpper] || 'America/New_York'

  try {
    const testUtc = new Date(Date.UTC(y, m - 1, d, hours, minutes, 0))
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaName,
      timeZoneName: 'shortOffset',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false
    })
    
    const formattedParts = formatter.formatToParts(testUtc)
    const tzPart = formattedParts.find(p => p.type === 'timeZoneName')?.value || ''
    
    let offsetMinutes = -240
    const offsetMatch = tzPart.match(/(GMT|UTC)?([+-])(\d{1,2})(?::(\d{2}))?/)
    if (offsetMatch) {
      const sign = offsetMatch[2] === '-' ? -1 : 1
      const offsetHours = parseInt(offsetMatch[3], 10)
      const offsetMins = parseInt(offsetMatch[4] || '0', 10)
      offsetMinutes = sign * (offsetHours * 60 + offsetMins)
    }

    return Date.UTC(y, m - 1, d, hours, minutes, 0) - offsetMinutes * 60000
  } catch {
    let offsetMins = -240
    if (['PST', 'PDT', 'PT'].includes(tzUpper)) offsetMins = -420
    else if (['CST', 'CDT', 'CT'].includes(tzUpper)) offsetMins = -300
    else if (['MST', 'MDT', 'MT'].includes(tzUpper)) offsetMins = -360
    else if (tzUpper === 'IST') offsetMins = 330
    else if (['UTC', 'GMT'].includes(tzUpper)) offsetMins = 0

    return Date.UTC(y, m - 1, d, hours, minutes, 0) - offsetMins * 60000
  }
}

export default function GlobalCallbackAlert() {
  const [callbacks, setCallbacks] = useState([])
  const [activeAlert, setActiveAlert] = useState(null)
  const dismissedAlertsRef = useRef(new Set())

  // Web Audio Synth Chime
  const playAlertChime = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      if (ctx.state === 'suspended') {
        ctx.resume()
      }
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15)
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.6)
    } catch {
      // Audio fallback
    }
  }

  // Load pending callbacks
  const loadCallbacks = async () => {
    try {
      const { data } = await db.from('callbacks').select('*')
      if (Array.isArray(data)) {
        setCallbacks(data)
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadCallbacks()
    const interval = setInterval(loadCallbacks, 2000)
    const handleUpdate = () => loadCallbacks()
    window.addEventListener('callback-updated', handleUpdate)
    return () => {
      clearInterval(interval)
      window.removeEventListener('callback-updated', handleUpdate)
    }
  }, [])

  const getAlertKey = (cb) => `${cb.id}_${cb.date}_${cb.time}_${cb.timezone}`

  // Check for due callbacks every 1 second
  useEffect(() => {
    const checkDue = () => {
      if (!callbacks.length) return
      const now = new Date()
      const due = callbacks.find(cb => {
        if ((cb.status || '').toLowerCase() === 'done') return false
        const key = getAlertKey(cb)
        if (dismissedAlertsRef.current.has(key)) return false
        const targetUtc = getTargetUtcTimestamp(cb.date, cb.time, cb.timezone)
        if (!targetUtc) return false
        const diffMs = targetUtc - now.getTime()
        // Trigger popup ONLY when scheduled time has arrived or passed
        return diffMs <= 0 && diffMs >= -48 * 60 * 60 * 1000
      })

      if (due) {
        if (!activeAlert || activeAlert.id !== due.id) {
          setActiveAlert(due)
          playAlertChime()
        }
      }
    }

    checkDue()
    const interval = setInterval(checkDue, 1000)
    return () => clearInterval(interval)
  }, [callbacks, activeAlert])

  const dismissAlert = () => {
    if (activeAlert) {
      dismissedAlertsRef.current.add(getAlertKey(activeAlert))
    }
    setActiveAlert(null)
  }

  const completeAlertCb = async () => {
    if (!activeAlert) return
    const id = activeAlert.id
    dismissedAlertsRef.current.add(getAlertKey(activeAlert))
    setActiveAlert(null)
    setCallbacks(prev => prev.map(c => c.id === id ? { ...c, status: 'done' } : c))
    window.dispatchEvent(new CustomEvent('callback-updated'))
    await db.from('callbacks').update({ status: 'done' }).eq('id', id)
  }

  const snoozeAlertCb = (mins = 10) => {
    if (!activeAlert) return
    const key = getAlertKey(activeAlert)
    dismissedAlertsRef.current.add(key)
    setActiveAlert(null)
    setTimeout(() => {
      dismissedAlertsRef.current.delete(key)
    }, mins * 60 * 1000)
  }

  if (!activeAlert) return null

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in" style={{ zIndex: 999999 }}>
      <div
        className="relative w-[420px] max-w-[calc(100vw-32px)] bg-surface border-2 border-accent rounded-[var(--radius-lg)] shadow-[0_25px_70px_rgba(0,0,0,0.7)] p-6 flex flex-col items-center text-center gap-4 animate-scale-up"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={dismissAlert}
          className="absolute top-3 right-3 text-text3 hover:text-text p-1.5 rounded-full hover:bg-surface2 transition-colors"
        >
          <Icon name="x" size={16} />
        </button>

        {/* Animated Phone Beacon */}
        <div className="relative flex items-center justify-center w-14 h-14 rounded-full bg-red/15 text-red border border-red/30">
          <span className="absolute inset-0 rounded-full bg-red/20 animate-ping" />
          <Icon name="callbacks" size={26} className="relative z-10" />
        </div>

        {/* Header */}
        <div>
          <span className="text-[11px] font-black text-red uppercase tracking-widest block mb-1">
            📞 CALLBACK DUE NOW
          </span>
          <h2 className="text-xl font-bold text-text tracking-tight">
            {activeAlert.candidate_name}
          </h2>
          <p className="text-xs text-text3 mt-0.5">
            {activeAlert.phone || activeAlert.job || 'Scheduled Recruiter Callback'}
          </p>
        </div>

        {/* Time Card */}
        <div className="w-full bg-surface2/90 border border-border rounded-[var(--radius-md)] p-3 flex flex-col items-center gap-1 font-mono">
          <div className="text-[10.5px] font-extrabold text-accent uppercase tracking-wider">
            Scheduled Target Time
          </div>
          <div className="text-base font-black text-text">
            {activeAlert.time || '10:00 AM'} <span className="text-xs text-accent font-bold">{activeAlert.timezone || 'EST'}</span>
          </div>
          {activeAlert.date && (
            <div className="text-[11px] text-text3 font-semibold">
              Date: {activeAlert.date}
            </div>
          )}
        </div>

        {activeAlert.notes && (
          <p className="text-xs text-text2 italic bg-surface2/40 px-3 py-2 rounded border border-border/60 w-full line-clamp-2">
            "{activeAlert.notes}"
          </p>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5 w-full pt-1">
          <Button
            size="md"
            variant="primary"
            leftIcon="checkCircle"
            onClick={completeAlertCb}
            className="w-full justify-center text-xs font-bold"
          >
            Mark Done
          </Button>
          <Button
            size="md"
            variant="secondary"
            leftIcon="clock"
            onClick={() => snoozeAlertCb(10)}
            className="w-full justify-center text-xs font-bold"
          >
            Snooze 10m
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
