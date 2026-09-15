export const TIMEZONE_ALIASES = {
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
  'Asia/Calcutta': 'Asia/Kolkata',
  UTC: 'UTC',
  GMT: 'UTC',
}

export const DEFAULT_TIMEZONE = 'America/New_York'

export const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time - New York' },
  { value: 'America/Chicago', label: 'Central Time - Chicago' },
  { value: 'America/Denver', label: 'Mountain Time - Denver' },
  { value: 'America/Los_Angeles', label: 'Pacific Time - Los Angeles' },
  { value: 'Asia/Kolkata', label: 'India Standard Time - Kolkata' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'UTC', label: 'UTC' },
]

export function normalizeTimezone(timezone, fallback = DEFAULT_TIMEZONE) {
  const raw = String(timezone || '').trim()
  if (!raw) return fallback
  const upper = raw.toUpperCase()
  return TIMEZONE_ALIASES[upper] || TIMEZONE_ALIASES[raw] || raw
}

export function timezoneLabel(timezone) {
  const normalized = normalizeTimezone(timezone)
  return TIMEZONE_OPTIONS.find(option => option.value === normalized)?.label || normalized.replace(/_/g, ' ')
}

export function timezoneShortName(timezone, date = new Date()) {
  const normalized = normalizeTimezone(timezone)
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: normalized, timeZoneName: 'short' }).formatToParts(date)
    return parts.find(part => part.type === 'timeZoneName')?.value || normalized
  } catch {
    return normalized
  }
}

export function parseClockTime(timeStr) {
  if (!timeStr) return { hours: 9, minutes: 0 }
  const clean = String(timeStr).trim().toUpperCase()
  const isPM = clean.includes('PM')
  const isAM = clean.includes('AM')
  const match = clean.match(/(\d{1,2})(?::(\d{2}))?/)
  if (!match) return { hours: 9, minutes: 0 }
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2] || '0', 10)
  if (isPM && hours < 12) hours += 12
  if (isAM && hours === 12) hours = 0
  return { hours, minutes }
}

function getTimezoneOffsetMinutes(date, timezone) {
  const normalized = normalizeTimezone(timezone)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: normalized,
    timeZoneName: 'shortOffset',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(date)
  const tzPart = parts.find(part => part.type === 'timeZoneName')?.value || ''
  const match = tzPart.match(/(?:GMT|UTC)?([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!match) return 0
  const sign = match[1] === '-' ? -1 : 1
  return sign * (parseInt(match[2], 10) * 60 + parseInt(match[3] || '0', 10))
}

export function scheduledLocalToUtcMs(dateStr, timeStr, timezone) {
  if (!dateStr) return null
  const dateParts = String(dateStr).slice(0, 10).split('-').map(Number)
  if (dateParts.length !== 3 || dateParts.some(Number.isNaN)) return null
  const [year, month, day] = dateParts
  const { hours, minutes } = parseClockTime(timeStr)

  const firstGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0))
  try {
    const offset = getTimezoneOffsetMinutes(firstGuess, timezone)
    const candidate = Date.UTC(year, month - 1, day, hours, minutes, 0) - offset * 60000
    const correctedOffset = getTimezoneOffsetMinutes(new Date(candidate), timezone)
    return Date.UTC(year, month - 1, day, hours, minutes, 0) - correctedOffset * 60000
  } catch {
    return firstGuess.getTime()
  }
}

export function scheduledLocalToIso(dateStr, timeStr, timezone) {
  const ms = scheduledLocalToUtcMs(dateStr, timeStr, timezone)
  return ms ? new Date(ms).toISOString() : null
}
