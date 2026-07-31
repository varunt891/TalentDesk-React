// Phase 6 — organization-wide workspace/recruiting/branding preferences
// that have no backing Prisma field (currency, date format, business
// hours, email signature/offer letter defaults, table density, default
// list view, page size). Same "settings store + hook, localStorage,
// org-scoped" pattern as Phase 5.4's src/lib/ai/governance.js, so this
// isn't a new architecture — it's the same one applied to a second domain.
import { useState, useEffect, useCallback } from 'react'

function prefsKey(orgId) { return `td_org_preferences_${orgId || 'na'}` }

export const DEFAULT_ORG_PREFERENCES = {
  currency: 'USD',
  dateFormat: 'MM/DD/YYYY',
  language: 'en',
  businessHours: { start: '09:00', end: '18:00' },
  emailSignature: '',
  offerLetterDefaults: '',
  tableDensity: 'comfortable',
  pageSize: 25,
  defaultCandidateView: 'table',
  defaultJobView: 'table',
}

export function loadOrgPreferences(orgId) {
  try {
    const raw = localStorage.getItem(prefsKey(orgId))
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed) return DEFAULT_ORG_PREFERENCES
    return { ...DEFAULT_ORG_PREFERENCES, ...parsed, businessHours: { ...DEFAULT_ORG_PREFERENCES.businessHours, ...(parsed.businessHours || {}) } }
  } catch { return DEFAULT_ORG_PREFERENCES }
}

export function saveOrgPreferences(orgId, prefs) {
  try { localStorage.setItem(prefsKey(orgId), JSON.stringify(prefs)) } catch { /* quota exceeded */ }
}

export function useOrgPreferences(orgId) {
  const [preferences, setPreferences] = useState(() => loadOrgPreferences(orgId))
  useEffect(() => { setPreferences(loadOrgPreferences(orgId)) }, [orgId])

  const updatePreferences = useCallback((partial) => {
    setPreferences(prev => {
      const next = { ...prev, ...partial, businessHours: { ...prev.businessHours, ...(partial.businessHours || {}) } }
      saveOrgPreferences(orgId, next)
      return next
    })
  }, [orgId])

  return { preferences, updatePreferences }
}
