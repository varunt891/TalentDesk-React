// AI Governance & Administration (Phase 5.4) — organization-level AI
// settings. No backend table exists for this yet, so it persists to
// localStorage keyed by org only (not per-user), which is the honest
// architecture for "organization-level" settings until real backend sync
// exists: the interface below (load/save) is what a future API-backed
// version would keep, so swapping the storage layer later doesn't require
// touching any consumer.
import { useState, useEffect, useCallback } from 'react'

function governanceKey(orgId) { return `td_ai_governance_${orgId || 'na'}` }

export const DEFAULT_GOVERNANCE = {
  features: { chat: true, actions: true, automations: true },
  workspaces: { candidates: true, jobs: true, pipeline: true, tasks: true, communication: true },
  // Requests always try Gemini first with automatic Groq fallback today
  // (server-side, unchanged) — this preference is stored for when
  // provider routing becomes configurable, and is disclosed as such
  // wherever it's shown.
  modelPreference: 'auto',
  streamingEnabled: true,
  responseStyle: 'balanced',
  dailyRequestLimit: null,
}

export function loadGovernance(orgId) {
  try {
    const raw = localStorage.getItem(governanceKey(orgId))
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed) return DEFAULT_GOVERNANCE
    return {
      ...DEFAULT_GOVERNANCE,
      ...parsed,
      features: { ...DEFAULT_GOVERNANCE.features, ...(parsed.features || {}) },
      workspaces: { ...DEFAULT_GOVERNANCE.workspaces, ...(parsed.workspaces || {}) },
    }
  } catch { return DEFAULT_GOVERNANCE }
}

export function saveGovernance(orgId, settings) {
  try { localStorage.setItem(governanceKey(orgId), JSON.stringify(settings)) } catch { /* quota exceeded */ }
}

export const RESPONSE_STYLE_INSTRUCTIONS = {
  concise: 'Keep answers brief — 2-3 sentences or a short list wherever possible.',
  balanced: '',
  detailed: 'Provide thorough, detailed answers with supporting context and reasoning.',
}

export function isOverDailyLimit(settings, requestsToday) {
  if (!settings.dailyRequestLimit) return false
  return requestsToday >= settings.dailyRequestLimit
}

export function useAIGovernance(orgId) {
  const [settings, setSettings] = useState(() => loadGovernance(orgId))
  useEffect(() => { setSettings(loadGovernance(orgId)) }, [orgId])

  const updateSettings = useCallback((partial) => {
    setSettings(prev => {
      const next = {
        ...prev, ...partial,
        features: { ...prev.features, ...(partial.features || {}) },
        workspaces: { ...prev.workspaces, ...(partial.workspaces || {}) },
      }
      saveGovernance(orgId, next)
      return next
    })
  }, [orgId])

  return { settings, updateSettings }
}
