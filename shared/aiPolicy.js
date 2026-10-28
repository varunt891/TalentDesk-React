export const DEFAULT_AI_POLICY = {
  features: { chat: true, actions: true, automations: true },
  workspaces: { candidates: true, jobs: true, pipeline: true, tasks: true, communication: true },
  modelPreference: 'auto', streamingEnabled: true, responseStyle: 'balanced', dailyRequestLimit: null,
}
export function mergeAiPolicy(previous = DEFAULT_AI_POLICY, partial = {}) {
  const next = { ...DEFAULT_AI_POLICY, ...previous, features: { ...DEFAULT_AI_POLICY.features, ...previous.features }, workspaces: { ...DEFAULT_AI_POLICY.workspaces, ...previous.workspaces } }
  for (const group of ['features', 'workspaces']) for (const key of Object.keys(next[group])) if (typeof partial[group]?.[key] === 'boolean') next[group][key] = partial[group][key]
  if (typeof partial.streamingEnabled === 'boolean') next.streamingEnabled = partial.streamingEnabled
  if (['concise', 'balanced', 'detailed'].includes(partial.responseStyle)) next.responseStyle = partial.responseStyle
  if (partial.dailyRequestLimit === null || (Number.isInteger(partial.dailyRequestLimit) && partial.dailyRequestLimit > 0 && partial.dailyRequestLimit <= 100000)) next.dailyRequestLimit = partial.dailyRequestLimit
  return next
}
