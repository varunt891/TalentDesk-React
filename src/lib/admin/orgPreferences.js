// Phase 6 — organization-wide workspace/recruiting/branding preferences
// that have no backing Prisma field (currency, date format, business
// hours, email signature/offer letter defaults, table density, default
// list view, page size). Same "settings store + hook, localStorage,
// org-scoped" pattern as Phase 5.4's src/lib/ai/governance.js, so this
// isn't a new architecture — it's the same one applied to a second domain.
import { useState, useEffect, useCallback } from 'react'
import { organizationApi } from '../api'
import { getMarketConfig } from '../marketConfig'

function prefsKey(orgId) { return `td_org_preferences_${orgId || 'na'}` }

export const DEFAULT_ORG_PREFERENCES = {
  market: 'US',
  currency: 'USD',
  dateFormat: 'MM/DD/YYYY',
  language: 'en',
  timezone: 'America/New_York',
  businessHours: { start: '09:00', end: '18:00' },
  emailSignature: '',
  offerLetterDefaults: '',
  tableDensity: 'comfortable',
  pageSize: 25,
  defaultCandidateView: 'table',
  defaultJobView: 'table',
}

export function orgToPreferences(org, fallback = DEFAULT_ORG_PREFERENCES) {
  if (!org) return fallback
  const market = getMarketConfig(org.market || fallback.market)
  return {
    ...fallback,
    market: org.market || fallback.market || market.id,
    currency: org.currency || fallback.currency || market.currency,
    dateFormat: org.date_format || fallback.dateFormat || market.dateFormat,
    language: org.language || fallback.language || 'en',
    timezone: org.timezone || fallback.timezone || market.defaultTimezone,
    businessHours: {
      start: org.business_hours_start || fallback.businessHours?.start || market.businessHours.start,
      end: org.business_hours_end || fallback.businessHours?.end || market.businessHours.end,
    },
  }
}

export function preferencesToOrgPayload(prefs) {
  return {
    market: prefs.market,
    currency: prefs.currency,
    date_format: prefs.dateFormat,
    language: prefs.language,
    timezone: prefs.timezone,
    business_hours_start: prefs.businessHours?.start,
    business_hours_end: prefs.businessHours?.end,
  }
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

  useEffect(() => {
    let cancelled = false
    if (!orgId) return () => { cancelled = true }
    organizationApi.getOrg()
      .then(res => {
        if (cancelled || !res.data) return
        setPreferences(prev => {
          const next = orgToPreferences(res.data, prev)
          saveOrgPreferences(orgId, next)
          return next
        })
      })
      .catch(() => { /* local fallback remains available offline */ })
    return () => { cancelled = true }
  }, [orgId])

  const updatePreferences = useCallback((partial) => {
    setPreferences(prev => {
      const next = { ...prev, ...partial, businessHours: { ...prev.businessHours, ...(partial.businessHours || {}) } }
      saveOrgPreferences(orgId, next)
      return next
    })
  }, [orgId])

  const savePreferences = useCallback(async (partial) => {
    const next = { ...preferences, ...partial, businessHours: { ...preferences.businessHours, ...(partial.businessHours || {}) } }
    saveOrgPreferences(orgId, next)
    setPreferences(next)
    const res = await organizationApi.updateOrg(preferencesToOrgPayload(next))
    const synced = orgToPreferences(res.data, next)
    saveOrgPreferences(orgId, synced)
    setPreferences(synced)
    return { preferences: synced, organization: res.data }
  }, [orgId, preferences])

  return { preferences, updatePreferences, savePreferences }
}
