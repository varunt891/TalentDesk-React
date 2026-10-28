// Organization AI policy is persisted and enforced by the API. localStorage
// is a display cache, never the authorization authority.
import { useState, useEffect, useCallback } from 'react'
import { apiRequest } from '../api'
import { useAuth } from '../../context/AuthContext'
import { DEFAULT_AI_POLICY, mergeAiPolicy } from '../../../shared/aiPolicy.js'

function governanceKey(orgId) { return `td_ai_governance_${orgId || 'na'}` }

export const DEFAULT_GOVERNANCE = DEFAULT_AI_POLICY

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
  window.dispatchEvent(new CustomEvent('td:ai-preferences', { detail: { orgId } }))
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

const pendingLoads = new Map()
const saveQueues = new Map()
async function fetchPolicy(orgId) {
  if (pendingLoads.has(orgId)) return pendingLoads.get(orgId)
  const pending = apiRequest('/organization/ai-policy').then(response => {
    if (response.organization_id !== orgId || !response.data || Array.isArray(response.data)) return null
    const settings = mergeAiPolicy(DEFAULT_GOVERNANCE, response.data)
    saveGovernance(orgId, settings)
    return settings
  }).finally(() => pendingLoads.delete(orgId))
  pendingLoads.set(orgId, pending)
  return pending
}
export function useAIGovernance(orgId) {
  const { profile } = useAuth()
  const canEdit = ['OWNER', 'ADMIN', 'SUPERADMIN'].includes(String(profile?.role || '').toUpperCase())
  const [settings, setSettings] = useState(() => loadGovernance(orgId))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setSettings(loadGovernance(orgId))
    let active = true
    const refresh = () => { if (orgId) fetchPolicy(orgId).then(policy => { if (active && policy) setSettings(policy) }).catch(() => {}) }
    refresh()
    window.addEventListener('focus', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh) }
  }, [orgId])
  useEffect(() => {
    const sync = event => { if (event.type === 'storage' || event.detail?.orgId === orgId) setSettings(loadGovernance(orgId)) }
    window.addEventListener('storage', sync)
    window.addEventListener('td:ai-preferences', sync)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('td:ai-preferences', sync) }
  }, [orgId])
  const updateSettings = useCallback(async partial => {
    if (!orgId || !canEdit) { setError('Only company Owners and Admins can change AI policy'); return }
    setSaving(true); setError(null)
    const operation = (saveQueues.get(orgId) || Promise.resolve()).catch(() => {}).then(async () => {
      const response = await apiRequest('/organization/ai-policy', { method: 'PUT', body: partial })
      if (response.organization_id === orgId && response.data) saveGovernance(orgId, mergeAiPolicy(DEFAULT_GOVERNANCE, response.data))
    })
    saveQueues.set(orgId, operation)
    try { await operation } catch (failure) { setError(failure.message) } finally { setSaving(false) }
  }, [orgId, canEdit])
  return { settings, updateSettings, canEdit, error, saving }
}
