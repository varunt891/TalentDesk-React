// Phase 6 — per-user notification category preferences. The Notification
// table itself is real (see notifications.js); which categories a
// recruiter wants surfaced has no backing field, so it's stored per-user
// in localStorage, same pattern as the rest of Phase 5/6's settings.
import { useState, useEffect, useCallback } from 'react'

const KEY_PREFIX = 'td_notification_prefs_'

export const NOTIFICATION_CATEGORIES = [
  { id: 'task_due', label: 'Task Due' },
  { id: 'interview_scheduled', label: 'Interview Scheduled' },
  { id: 'candidate_submitted', label: 'Candidate Submitted' },
  { id: 'followup_due', label: 'Follow-up Due' },
  { id: 'job_assigned', label: 'Job Assigned' },
  { id: 'pipeline_updates', label: 'Pipeline Updates' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'ai_automation', label: 'AI Automation Results' },
]

function key(userId) { return `${KEY_PREFIX}${userId || 'na'}` }

export function loadNotificationPreferences(userId) {
  try {
    const raw = localStorage.getItem(key(userId))
    const parsed = raw ? JSON.parse(raw) : null
    const defaults = Object.fromEntries(NOTIFICATION_CATEGORIES.map(c => [c.id, true]))
    return parsed ? { ...defaults, ...parsed } : defaults
  } catch {
    return Object.fromEntries(NOTIFICATION_CATEGORIES.map(c => [c.id, true]))
  }
}

export function saveNotificationPreferences(userId, prefs) {
  try { localStorage.setItem(key(userId), JSON.stringify(prefs)) } catch { /* quota exceeded */ }
}

export function useNotificationPreferences(userId) {
  const [preferences, setPreferences] = useState(() => loadNotificationPreferences(userId))
  useEffect(() => { setPreferences(loadNotificationPreferences(userId)) }, [userId])

  const updatePreferences = useCallback((partial) => {
    setPreferences(prev => {
      const next = { ...prev, ...partial }
      saveNotificationPreferences(userId, next)
      return next
    })
  }, [userId])

  return { preferences, updatePreferences }
}
