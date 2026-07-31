import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { PageContainer } from '../components/layout/PageContainer'
import { Button, Card, CardHeader, PageHeader, Icon, Tabs, EmptyState, CollapsibleSection, Textarea, cn } from '../components/ui'
import { WorkspaceSearch, EntityDrawer } from '../components/workspace'
import MessageBubble from '../components/ai/MessageBubble'
import ActionsPanel from '../components/ai/ActionsPanel'
import AnalyticsPanel from '../components/ai/AnalyticsPanel'
import AutomationsPanel from '../components/ai/AutomationsPanel'
import SettingsPanel from '../components/ai/SettingsPanel'
import { useAIWorkspaceContext } from '../lib/ai/context'
import { useCopilotChat } from '../lib/ai/useCopilotChat'
import { runAiAction } from '../lib/ai/aiClient'
import { fetchWorkspaceSnapshot } from '../lib/ai/workspaceSnapshot'
import { SUGGESTED_PROMPTS } from '../lib/ai/memory'
import { getUsageSummary, loadUsageEvents } from '../lib/ai/usage'
import { loadSavedPrompts, savePrompt, deleteSavedPrompt, togglePinSavedPrompt, loadFavoriteTemplates, toggleFavoriteTemplate } from '../lib/ai/promptLibrary'
import { useAIGovernance, RESPONSE_STYLE_INSTRUCTIONS, isOverDailyLimit } from '../lib/ai/governance'
import { AI_CATEGORIES } from '../lib/ai/categories'
import { getAiAction } from '../lib/ai/prompts'

const ACTION_GROUPS = [
  { label: 'Write', ids: ['draft', 'rewrite', 'translate'] },
  { label: 'Analyze', ids: ['analyze', 'summarize', 'score', 'explain'] },
  { label: 'Transform', ids: ['improve', 'compare', 'recommend', 'extract'] },
]

function relTime(iso) {
  if (!iso) return ''
  const d = Math.max(0, Math.floor((new Date().getTime() - new Date(iso).getTime()) / 86400000))
  if (d === 0) return 'Today'
  if (d === 1) return '1d ago'
  return `${d}d ago`
}

/**
 * The AI Center — headquarters for every AI capability in TalentDesk.
 * Five modes share one page: Chat + Actions (the day-to-day workspace),
 * Analytics + Automations + Settings (Phase 5.4 — the platform's
 * measurement, automation, and governance surface). Everything consumes
 * the Phase 5.1/5.2 foundation as-is (useCopilotChat, ActionsPanel,
 * aiClient, workspaceSnapshot, memory, usage) — this page adds no new AI
 * service logic, only richer surfaces on top of it.
 */
export default function AICenter() {
  const { user, profile, organization } = useAuth()
  const { currentPage, pageContext } = useAIWorkspaceContext()
  const orgId = organization?.id || profile?.org_id
  const userId = user?.id
  const userName = profile?.full_name || user?.email

  const { settings: aiSettings } = useAIGovernance(orgId)

  const chat = useCopilotChat({
    orgId, userId, orgName: organization?.name, userName, role: profile?.role, currentPage, pageContext,
    streamingEnabled: aiSettings.streamingEnabled,
    behaviorInstruction: RESPONSE_STYLE_INSTRUCTIONS[aiSettings.responseStyle],
    source: currentPage || 'ai_center',
  })
  const {
    sortedConversations, activeId, messages, streaming, streamingText, errorMsg, recentPromptsList,
    sendMessage, regenerate, stopStreaming, newChat, switchConversation, togglePin, renameConversation, deleteConversation,
  } = chat

  const [centerMode, setCenterMode] = useState('chat')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [input, setInput] = useState('')
  const [convSearch, setConvSearch] = useState('')

  const [savedPrompts, setSavedPrompts] = useState([])
  const [favoriteTemplates, setFavoriteTemplates] = useState([])
  const [usageSummary, setUsageSummary] = useState({ requestsToday: 0, totalRequests: 0, requestsThisWeek: 0, avgResponseMs: null, topAction: null, estimatedMinutesSaved: 0 })
  const [recentEvents, setRecentEvents] = useState([])
  const [snapshotCounts, setSnapshotCounts] = useState(null)
  const [previewPrompt, setPreviewPrompt] = useState(null)
  const [followupSuggestions, setFollowupSuggestions] = useState([])
  const lastProcessedMsgId = useRef(null)
  const prevStreamingRef = useRef(false)
  const listRef = useRef(null)

  const refreshLibrary = () => {
    setSavedPrompts(loadSavedPrompts(orgId, userId))
    setFavoriteTemplates(loadFavoriteTemplates(orgId, userId))
  }
  const refreshUsage = () => {
    setUsageSummary(getUsageSummary(orgId, userId))
    setRecentEvents(loadUsageEvents(orgId, userId).slice(0, 8))
  }

  useEffect(() => {
    if (orgId || userId) { refreshLibrary(); refreshUsage() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, userId])

  useEffect(() => {
    fetchWorkspaceSnapshot().then(snap => {
      setSnapshotCounts({
        candidates: snap.candidates.length,
        activeCandidates: snap.candidates.filter(c => !['Hired', 'Rejected'].includes(c.internal_status)).length,
        jobs: snap.jobs.length,
        openJobs: snap.jobs.filter(j => (j.status || 'Open') === 'Open').length,
        tasksDue: snap.tasks.filter(t => t.status !== 'Completed').length,
      })
    }).catch(() => { /* workspace context is supplementary */ })
  }, [])

  useEffect(() => {
    if (prevStreamingRef.current && !streaming) refreshUsage()
    prevStreamingRef.current = streaming
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length, streamingText])

  // Suggested Follow-up Questions — reuses the shared Action Framework
  // ('recommend') rather than inventing a new AI capability.
  useEffect(() => {
    if (streaming) return
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.stopped) return
    if (lastProcessedMsgId.current === lastMsg.id) return
    lastProcessedMsgId.current = lastMsg.id
    setFollowupSuggestions([])
    runAiAction({
      action: 'recommend',
      content: lastMsg.content,
      context: 'Suggest exactly 3 short, specific follow-up questions a recruiter might ask next. Return them ONLY as a markdown bullet list (each line starting with "- "), no extra commentary.',
    }).then(res => {
      if (res.success === false || !res.text) return
      const bullets = res.text.split('\n').map(l => l.trim())
        .filter(l => l.startsWith('- ') || l.startsWith('* '))
        .map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean).slice(0, 3)
      setFollowupSuggestions(bullets)
    }).catch(() => { /* follow-up suggestions are a nice-to-have, fail silently */ })
  }, [messages, streaming])

  const overLimit = isOverDailyLimit(aiSettings, usageSummary.requestsToday)
  const handleSend = (text) => {
    if (overLimit) return
    sendMessage(text)
    setInput('')
  }

  const launchCategory = (category) => {
    setSelectedCategory({ ...category, launchedAt: new Date().getTime() })
    if (category.mode === 'chat') {
      setCenterMode('chat')
      setInput(category.examplePrompt)
    } else {
      setCenterMode('actions')
    }
  }

  const runSavedPrompt = (prompt) => {
    setPreviewPrompt(null)
    if (!prompt.actionId || prompt.actionId === 'chat') {
      setCenterMode('chat')
      sendMessage(prompt.content)
    } else {
      setCenterMode('actions')
      setSelectedCategory({ id: `saved_${prompt.id}_${new Date().getTime()}`, mode: 'action', actionId: prompt.actionId, presetContent: prompt.content, presetContext: prompt.context })
    }
  }

  const handleSaveFromActions = ({ actionId, content, context }) => {
    savePrompt(orgId, userId, { title: content, actionId, content, context })
    refreshLibrary()
  }

  const filteredConversations = useMemo(() => {
    const q = convSearch.toLowerCase()
    if (!q) return sortedConversations
    return sortedConversations.filter(c => c.title.toLowerCase().includes(q) || c.messages.some(m => m.content.toLowerCase().includes(q)))
  }, [sortedConversations, convSearch])
  const pinnedConversations = useMemo(() => sortedConversations.filter(c => c.pinned), [sortedConversations])

  const modeTabs = [
    ...(aiSettings.features.chat !== false ? [{ id: 'chat', label: 'Chat' }] : []),
    ...(aiSettings.features.actions !== false ? [{ id: 'actions', label: 'Actions' }] : []),
    { id: 'analytics', label: 'Analytics' },
    ...(aiSettings.features.automations !== false ? [{ id: 'automations', label: 'Automations' }] : []),
    { id: 'settings', label: 'Settings' },
  ]
  const effectiveMode = modeTabs.some(t => t.id === centerMode) ? centerMode : (modeTabs[0]?.id || 'settings')
  const isWorkspaceMode = effectiveMode === 'chat' || effectiveMode === 'actions'

  return (
    <PageContainer>
      <PageHeader
        eyebrow="AI Platform"
        title="AI Center"
        subtitle="Discover, launch, and manage every AI capability across TalentDesk."
        actions={effectiveMode === 'chat' ? <Button variant="primary" leftIcon="plus" onClick={() => { newChat(); setCenterMode('chat') }}>New Chat</Button> : undefined}
      />

      <div className="my-4">
        <Tabs items={modeTabs} value={effectiveMode} onChange={setCenterMode} />
      </div>

      {isWorkspaceMode && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
          <MiniKPI label="Requests Today" value={usageSummary.requestsToday} icon="sparkles" tone="accent" />
          <MiniKPI label="Conversations" value={sortedConversations.length} icon="callbacks" tone="ai" />
          <MiniKPI label="Saved Prompts" value={savedPrompts.length} icon="pin" tone="accent" />
          <MiniKPI label="Favorites" value={favoriteTemplates.length} icon="checkCircle" tone="yellow" />
          <MiniKPI label="Avg Response" value={usageSummary.avgResponseMs ? `${(usageSummary.avgResponseMs / 1000).toFixed(1)}s` : '—'} icon="clock" tone="green" />
          <MiniKPI label="Time Saved (est.)" value={usageSummary.estimatedMinutesSaved > 0 ? `${usageSummary.estimatedMinutesSaved}m` : '—'} icon="trendUp" tone="orange" />
        </div>
      )}

      {effectiveMode === 'analytics' && <AnalyticsPanel orgId={orgId} userId={userId} conversations={sortedConversations} />}
      {effectiveMode === 'automations' && <AutomationsPanel orgId={orgId} userId={userId} />}
      {effectiveMode === 'settings' && <SettingsPanel orgId={orgId} userName={userName} />}

      {isWorkspaceMode && (
        <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr_280px] gap-4 items-start">
          {/* LEFT SIDEBAR */}
          <div className="flex flex-col gap-3 min-w-0 order-1">
            <CollapsibleSection title="Categories" count={AI_CATEGORIES.length} tone="accent">
              <div className="flex flex-col gap-0.5">
                {AI_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => launchCategory(cat)}
                    className={cn('group flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left transition-colors duration-[var(--duration-fast)]', selectedCategory?.id === cat.id ? 'bg-accent/10 text-accent' : 'hover:bg-surface2 text-text2')}
                  >
                    <Icon name={cat.icon} size={13} className="shrink-0" />
                    <span className="text-xs font-semibold truncate flex-1">{cat.label}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleFavoriteTemplate(orgId, userId, cat.id); refreshLibrary() }}
                      aria-label={favoriteTemplates.includes(cat.id) ? 'Unfavorite' : 'Favorite'}
                      className={cn('shrink-0', favoriteTemplates.includes(cat.id) ? 'text-yellow' : 'text-text3/40 opacity-0 group-hover:opacity-100 hover:text-yellow')}
                    >
                      <Icon name="pin" size={10} />
                    </button>
                  </button>
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Conversations" count={sortedConversations.length} tone="ai">
              <WorkspaceSearch value={convSearch} onChange={setConvSearch} storageKey="td_ai_center_conv" placeholder="Search conversations..." />
              <div className="flex flex-col gap-0.5 mt-2 max-h-64 overflow-y-auto">
                {filteredConversations.length === 0 ? (
                  <p className="text-xs text-text3 text-center py-4">No conversations found</p>
                ) : filteredConversations.map(c => (
                  <ConversationRow
                    key={c.id}
                    conversation={c}
                    active={c.id === activeId}
                    onSelect={() => { switchConversation(c.id); setCenterMode('chat') }}
                    onPin={() => togglePin(c.id)}
                    onDelete={() => deleteConversation(c.id)}
                    onRename={(title) => renameConversation(c.id, title)}
                  />
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Favorites" count={pinnedConversations.length + favoriteTemplates.length} tone="yellow" defaultOpen={false}>
              {pinnedConversations.length === 0 && favoriteTemplates.length === 0 ? (
                <EmptyState icon="pin" title="No favorites yet" description="Pin a conversation or a category to find it here fast." />
              ) : (
                <div className="flex flex-col gap-0.5">
                  {pinnedConversations.map(c => (
                    <ConversationRow key={c.id} conversation={c} active={c.id === activeId} onSelect={() => { switchConversation(c.id); setCenterMode('chat') }} onPin={() => togglePin(c.id)} onDelete={() => deleteConversation(c.id)} onRename={(title) => renameConversation(c.id, title)} />
                  ))}
                  {favoriteTemplates.map(id => {
                    const cat = AI_CATEGORIES.find(c => c.id === id)
                    if (!cat) return null
                    return (
                      <button key={id} type="button" onClick={() => launchCategory(cat)} className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left hover:bg-surface2 text-text2">
                        <Icon name={cat.icon} size={13} className="text-yellow shrink-0" />
                        <span className="text-xs font-semibold truncate">{cat.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Saved Prompts" count={savedPrompts.length} tone="accent" defaultOpen={false}>
              {savedPrompts.length === 0 ? (
                <EmptyState icon="pin" title="No saved prompts yet" description="Save a prompt from the Actions panel to reuse it later." />
              ) : (
                <div className="flex flex-col gap-0.5">
                  {savedPrompts.map(p => (
                    <SavedPromptRow
                      key={p.id}
                      prompt={p}
                      onPreview={() => setPreviewPrompt(p)}
                      onRun={() => runSavedPrompt(p)}
                      onPin={() => { togglePinSavedPrompt(orgId, userId, p.id); refreshLibrary() }}
                      onDelete={() => { deleteSavedPrompt(orgId, userId, p.id); refreshLibrary() }}
                    />
                  ))}
                </div>
              )}
            </CollapsibleSection>
          </div>

          {/* CENTER */}
          <div className="flex flex-col gap-3 min-w-0 order-2">
            <Card padding="none" className="flex flex-col overflow-hidden">
              {effectiveMode === 'chat' ? (
                <>
                  {streaming && (
                    <div className="flex items-center justify-end px-4 pt-2.5 shrink-0">
                      <span className="text-[10px] font-bold text-accent uppercase tracking-wide flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Streaming
                      </span>
                    </div>
                  )}
                  <div ref={listRef} className="overflow-y-auto px-5 py-4 flex flex-col gap-3.5" style={{ minHeight: 440, maxHeight: 560 }}>
                    {messages.length === 0 && !streaming ? (
                      <ChatEmptyState onPick={handleSend} recent={recentPromptsList} onLaunchCategory={launchCategory} />
                    ) : (
                      messages.map((m, i) => (
                        <MessageBubble key={m.id} message={m} onRegenerate={m.role === 'assistant' && i === messages.length - 1 ? regenerate : undefined} />
                      ))
                    )}
                    {streaming && <MessageBubble message={{ role: 'assistant', content: streamingText }} thinking={!streamingText} streaming />}
                    {!streaming && followupSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pl-8">
                        {followupSuggestions.map(q => (
                          <button key={q} type="button" onClick={() => handleSend(q)} className="text-[11px] font-medium text-accent bg-accent/10 hover:bg-accent/15 rounded-full px-2.5 py-1.5">{q}</button>
                        ))}
                      </div>
                    )}
                    {errorMsg && (
                      <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-red/25 bg-red/8 px-3 py-2.5">
                        <Icon name="alertCircle" size={14} className="text-red shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-red">{errorMsg}</p>
                          <button type="button" onClick={regenerate} className="text-[11px] font-bold text-red underline mt-1">Retry</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-4 py-3 border-t border-border shrink-0">
                    {overLimit && (
                      <p className="text-[11px] text-yellow mb-2">Daily AI request limit reached ({aiSettings.dailyRequestLimit}). Raise it in Settings, or try again tomorrow.</p>
                    )}
                    <div className="flex items-end gap-2">
                      <Textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input) } }}
                        placeholder="Ask Copilot anything about your workspace..."
                        rows={2}
                        className="flex-1 resize-none"
                        disabled={overLimit}
                      />
                      {streaming ? (
                        <Button variant="danger" iconOnly leftIcon="square" onClick={stopStreaming} aria-label="Stop generating" />
                      ) : (
                        <Button variant="primary" iconOnly leftIcon="send" onClick={() => handleSend(input)} disabled={!input.trim() || overLimit} aria-label="Send" />
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-5">
                  <ActionsPanel
                    key={selectedCategory?.id || 'default'}
                    orgId={orgId}
                    userId={userId}
                    source="ai_center"
                    initialActionId={selectedCategory?.actionId || 'summarize'}
                    initialContent={selectedCategory?.presetContent || ''}
                    initialContext={selectedCategory?.actionContext || selectedCategory?.presetContext || ''}
                    placeholder={selectedCategory?.placeholder}
                    onResult={refreshUsage}
                    onSavePrompt={handleSaveFromActions}
                  />
                </div>
              )}
            </Card>
          </div>

          {/* RIGHT SIDEBAR */}
          <div className="flex flex-col gap-3 min-w-0 order-3">
            <CollapsibleSection title="Quick Actions" tone="accent">
              <div className="flex flex-col gap-3">
                {ACTION_GROUPS.map(group => (
                  <div key={group.label}>
                    <div className="text-[10px] font-bold text-text3 uppercase tracking-wide mb-1.5">{group.label}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {group.ids.map(id => {
                        const a = getAiAction(id)
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => { setCenterMode('actions'); setSelectedCategory({ id: `qa_${a.id}_${new Date().getTime()}`, mode: 'action', actionId: a.id }) }}
                            className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-surface2 hover:border-accent/40 hover:text-accent px-2 py-2 text-left transition-colors duration-[var(--duration-fast)]"
                          >
                            <Icon name={a.icon} size={12} className="text-accent shrink-0" />
                            <span className="text-[11px] font-semibold text-text2 truncate">{a.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Recent Activity" count={recentEvents.length} tone="neutral">
              {recentEvents.length === 0 ? (
                <EmptyState icon="clock" title="No activity yet" description="Chat or run an action to see it here." />
              ) : (
                <div className="flex flex-col gap-2.5">
                  {recentEvents.map((e, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Icon name={e.type === 'chat' ? 'sparkles' : getAiAction(e.action).icon} size={11} className={e.success === false ? 'text-red shrink-0 mt-0.5' : 'text-accent shrink-0 mt-0.5'} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-text2 truncate">{e.type === 'chat' ? 'Copilot reply' : getAiAction(e.action).label}{e.success === false ? ' (failed)' : ''}</p>
                        {e.preview && <p className="text-[10px] text-text3 truncate">{e.preview}</p>}
                      </div>
                      <span className="text-[10px] text-text3 shrink-0">{relTime(e.at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Workspace Context" tone="ai">
              <div className="flex flex-col gap-2 text-xs">
                <ContextRow label="Recruiter" value={userName} />
                <ContextRow label="Organization" value={organization?.name} />
                <ContextRow label="Current Page" value="AI Center" />
                <ContextRow label="Candidates" value={snapshotCounts ? `${snapshotCounts.activeCandidates} active / ${snapshotCounts.candidates} total` : 'Loading...'} />
                <ContextRow label="Jobs" value={snapshotCounts ? `${snapshotCounts.openJobs} open / ${snapshotCounts.jobs} total` : 'Loading...'} />
                <ContextRow label="Tasks Due" value={snapshotCounts ? snapshotCounts.tasksDue : 'Loading...'} />
                <ContextRow label="Selected Records" value="None selected" muted />
                <ContextRow label="Filters" value="None active" muted />
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="AI Insights" tone="green" defaultOpen={false}>
              {usageSummary.totalRequests === 0 ? (
                <EmptyState icon="sparkles" title="No usage yet" description="Insights appear once you start using AI Center." />
              ) : (
                <div className="flex flex-col gap-1.5 text-xs text-text2">
                  <p>{usageSummary.requestsThisWeek} AI request{usageSummary.requestsThisWeek === 1 ? '' : 's'} this week.</p>
                  {usageSummary.topAction && <p>Most used action: <b className="text-text">{getAiAction(usageSummary.topAction.action).label}</b> ({usageSummary.topAction.count}×).</p>}
                  {usageSummary.avgResponseMs && <p>Average response time: <b className="text-text">{(usageSummary.avgResponseMs / 1000).toFixed(1)}s</b>.</p>}
                </div>
              )}
            </CollapsibleSection>
          </div>
        </div>
      )}

      {previewPrompt && (
        <EntityDrawer
          open={!!previewPrompt}
          onClose={() => setPreviewPrompt(null)}
          eyebrow="Saved Prompt"
          title={previewPrompt.title}
          subtitle={getAiAction(previewPrompt.actionId).label}
          size="md"
          actions={<Button variant="primary" leftIcon="send" onClick={() => runSavedPrompt(previewPrompt)}>Run</Button>}
        >
          <div className="flex flex-col gap-3">
            <Card><CardHeader title="Prompt" /><p className="text-sm text-text2 whitespace-pre-wrap">{previewPrompt.content}</p></Card>
            {previewPrompt.context && <Card><CardHeader title="Instructions" /><p className="text-sm text-text2 whitespace-pre-wrap">{previewPrompt.context}</p></Card>}
          </div>
        </EntityDrawer>
      )}
    </PageContainer>
  )
}

function MiniKPI({ label, value, icon, tone = 'accent' }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] bg-surface border border-border shadow-xs px-3 py-2.5 min-w-0 transition-shadow duration-[var(--duration-fast)] hover:shadow-sm">
      <span className="w-7 h-7 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, var(--${tone}) 12%, transparent)`, color: `var(--${tone})`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--${tone}) 18%, transparent)` }}>
        <Icon name={icon} size={13} />
      </span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-extrabold font-mono text-text leading-none truncate tabular-nums">{value}</div>
        <div className="text-[9px] font-bold text-text3 uppercase tracking-wider mt-1 truncate">{label}</div>
      </div>
    </div>
  )
}

function ConversationRow({ conversation, active, onSelect, onPin, onDelete, onRename }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(conversation.title)
  const commit = () => { onRename(value); setEditing(false) }
  return (
    <div onClick={!editing ? onSelect : undefined} className={cn('group flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 cursor-pointer', active ? 'bg-accent/10' : 'hover:bg-surface2')}>
      {editing ? (
        <input
          autoFocus value={value} onChange={e => setValue(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          onClick={e => e.stopPropagation()}
          className="flex-1 text-xs bg-surface2 border border-accent rounded px-1.5 py-1 outline-none min-w-0"
        />
      ) : (
        <span className={cn('text-xs font-semibold truncate flex-1', active ? 'text-accent' : 'text-text2')}>{conversation.title || 'New conversation'}</span>
      )}
      {!editing && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(true) }} aria-label="Rename" className="opacity-0 group-hover:opacity-100 text-text3 hover:text-text shrink-0"><Icon name="edit" size={10} /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onPin() }} aria-label={conversation.pinned ? 'Unpin' : 'Pin'} className={cn('shrink-0', conversation.pinned ? 'text-yellow' : 'opacity-0 group-hover:opacity-100 text-text3 hover:text-yellow')}><Icon name="pin" size={10} /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete() }} aria-label="Delete" className="opacity-0 group-hover:opacity-100 text-text3 hover:text-red shrink-0"><Icon name="trash" size={10} /></button>
        </>
      )}
    </div>
  )
}

function SavedPromptRow({ prompt, onPreview, onRun, onPin, onDelete }) {
  return (
    <div className="group flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-surface2 cursor-pointer" onClick={onPreview}>
      <Icon name={getAiAction(prompt.actionId).icon} size={11} className="text-accent shrink-0" />
      <span className="text-xs font-medium text-text2 truncate flex-1">{prompt.title}</span>
      <button type="button" onClick={(e) => { e.stopPropagation(); onRun() }} aria-label="Run" className="opacity-0 group-hover:opacity-100 text-text3 hover:text-accent shrink-0"><Icon name="send" size={10} /></button>
      <button type="button" onClick={(e) => { e.stopPropagation(); onPin() }} aria-label={prompt.pinned ? 'Unpin' : 'Pin'} className={cn('shrink-0', prompt.pinned ? 'text-yellow' : 'opacity-0 group-hover:opacity-100 text-text3 hover:text-yellow')}><Icon name="pin" size={10} /></button>
      <button type="button" onClick={(e) => { e.stopPropagation(); onDelete() }} aria-label="Delete" className="opacity-0 group-hover:opacity-100 text-text3 hover:text-red shrink-0"><Icon name="trash" size={10} /></button>
    </div>
  )
}

function ContextRow({ label, value, muted }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text3">{label}</span>
      <span className={cn('font-semibold text-right truncate max-w-[60%]', muted ? 'text-text3 italic font-normal' : 'text-text')}>{value ?? '—'}</span>
    </div>
  )
}

function ChatEmptyState({ onPick, recent, onLaunchCategory }) {
  const featured = AI_CATEGORIES.slice(0, 4)
  return (
    <div className="flex flex-col items-center justify-center text-center gap-5 py-10">
      <span
        className="relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-[var(--shadow-md)]"
        style={{ background: 'linear-gradient(135deg, var(--accent), var(--ai))', boxShadow: '0 0 0 6px color-mix(in srgb, var(--ai) 8%, transparent), var(--shadow-md)' }}
      >
        <Icon name="sparkles" size={24} className="text-white" />
      </span>
      <div>
        <p className="text-[16px] font-extrabold text-text tracking-tight">Ask Copilot anything</p>
        <p className="text-[12.5px] text-text3 mt-1.5 max-w-xs mx-auto leading-relaxed">Workspace-aware — it can see your live candidates, jobs, and tasks.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5 max-w-md">
        {SUGGESTED_PROMPTS.map(p => <button key={p} type="button" onClick={() => onPick(p)} className="text-[11.5px] font-semibold text-accent bg-accent/10 border border-accent/15 hover:bg-accent/15 hover:border-accent/30 transition-colors duration-[var(--duration-fast)] rounded-full px-3 py-1.5">{p}</button>)}
      </div>
      {recent.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 max-w-md">
          {recent.map(p => <button key={p} type="button" onClick={() => onPick(p)} className="text-[11.5px] font-medium text-text2 bg-surface2 border border-border shadow-xs hover:text-text hover:border-border-strong transition-colors duration-[var(--duration-fast)] rounded-full px-3 py-1.5">{p}</button>)}
        </div>
      )}
      <div className="w-full max-w-sm pt-4 border-t border-border">
        <p className="text-[10.5px] font-bold text-text3 uppercase tracking-wider mb-2.5">Or launch a workflow</p>
        <div className="grid grid-cols-2 gap-2">
          {featured.map(cat => (
            <button key={cat.id} type="button" onClick={() => onLaunchCategory(cat)} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface shadow-xs hover:border-ai/30 hover:shadow-sm hover:-translate-y-px px-3 py-2.5 text-left transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)]">
              <span className="w-6 h-6 rounded-[var(--radius-sm)] bg-ai-soft text-ai flex items-center justify-center shrink-0"><Icon name={cat.icon} size={12} /></span>
              <span className="text-[11.5px] font-semibold text-text2 truncate">{cat.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
