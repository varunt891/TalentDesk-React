// Shared Recruiter Copilot chat logic — extracted so the floating Copilot
// widget (src/components/ai/Copilot.jsx) and the AI Center chat panel
// consume the exact same conversation state, memory, and streaming
// behavior instead of two divergent implementations. Conversations are
// stored per org+user (memory.js), so a conversation started in one surface
// is immediately visible in the other.
import { useState, useRef, useEffect, useMemo } from 'react'
import { streamCopilot } from './aiClient'
import { fetchWorkspaceSnapshot, buildWorkspaceContextText } from './workspaceSnapshot'
import { loadConversations, saveConversations, createConversation, recentPrompts, addRecentPrompt } from './memory'
import { logUsageEvent } from './usage'

const SNAPSHOT_TTL_MS = 2 * 60 * 1000

export function useCopilotChat({ orgId, userId, orgName, userName, role, currentPage, pageContext, streamingEnabled = true, behaviorInstruction, source }) {
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [errorMsg, setErrorMsg] = useState(null)
  const [recentPromptsList, setRecentPromptsList] = useState([])

  const abortRef = useRef(null)
  const snapshotDataRef = useRef(null)

  useEffect(() => {
    if (!orgId && !userId) return
    const loaded = loadConversations(orgId, userId)
    if (loaded.length) {
      setConversations(loaded)
      setActiveId(loaded[0].id)
    } else {
      const fresh = createConversation()
      setConversations([fresh])
      setActiveId(fresh.id)
    }
    setRecentPromptsList(recentPrompts(orgId, userId))
  }, [orgId, userId])

  const mutateConversations = (updaterFn) => {
    setConversations(prev => {
      const next = updaterFn(prev)
      saveConversations(orgId, userId, next)
      return next
    })
  }

  const activeConversation = conversations.find(c => c.id === activeId) || null
  const messages = activeConversation?.messages || []
  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.updatedAt) - new Date(a.updatedAt)),
    [conversations]
  )

  // Caches the raw snapshot data (candidates/jobs/tasks/...) for a couple
  // minutes, but always rebuilds the context TEXT fresh from the current
  // pageContext — otherwise a candidate switch mid-conversation wouldn't
  // reach the Copilot until the data cache itself expired.
  const getSnapshotContext = async () => {
    const now = new Date().getTime()
    let snapshot
    if (snapshotDataRef.current && now - snapshotDataRef.current.fetchedAtMs < SNAPSHOT_TTL_MS) {
      snapshot = snapshotDataRef.current.snapshot
    } else {
      snapshot = await fetchWorkspaceSnapshot()
      snapshotDataRef.current = { snapshot, fetchedAtMs: now }
    }
    return buildWorkspaceContextText(snapshot, { orgName, userName, role, currentPage, pageContext, behaviorInstruction })
  }

  const sendMessage = async (text, options = {}) => {
    const trimmed = (text || '').trim()
    if (!trimmed || streaming || !activeId) return
    const isRetry = Boolean(options.isRetry)
    setErrorMsg(null)
    addRecentPrompt(orgId, userId, trimmed)
    setRecentPromptsList(recentPrompts(orgId, userId))

    const userMsg = { id: `m_${new Date().getTime()}`, role: 'user', content: trimmed, createdAt: new Date().toISOString() }
    const historyForRequest = [...messages, userMsg].slice(-8).map(m => ({ role: m.role, content: m.content }))
    const conversationId = activeId

    mutateConversations(prev => prev.map(c => c.id === conversationId
      ? { ...c, messages: [...c.messages, userMsg], title: c.messages.length === 0 ? trimmed.slice(0, 60) : c.title, updatedAt: new Date().toISOString() }
      : c))

    setStreaming(true)
    setStreamingText('')
    const controller = new AbortController()
    abortRef.current = controller
    const startedAt = new Date().getTime()

    try {
      const context = await getSnapshotContext()
      const result = await streamCopilot({
        message: trimmed,
        history: historyForRequest,
        context,
        signal: controller.signal,
        // When streaming is disabled by AI Governance settings, the request
        // still streams over the wire (no backend change needed) but the UI
        // withholds incremental updates and reveals the full answer once —
        // the "thinking" state covers the wait.
        onDelta: streamingEnabled ? (_delta, full) => setStreamingText(full) : () => {},
      })
      const assistantMsg = { id: `m_${new Date().getTime() + 1}`, role: 'assistant', content: result.text, createdAt: new Date().toISOString(), provider: result.provider, model: result.model }
      mutateConversations(prev => prev.map(c => c.id === conversationId ? { ...c, messages: [...c.messages, assistantMsg], updatedAt: new Date().toISOString() } : c))
      logUsageEvent(orgId, userId, { type: 'chat', source, success: true, retry: isRetry, provider: result.provider, model: result.model, durationMs: new Date().getTime() - startedAt, preview: assistantMsg.content.slice(0, 140) })
      return assistantMsg
    } catch (err) {
      if (err.name === 'AbortError') {
        setStreamingText(current => {
          if (current) {
            const stoppedMsg = { id: `m_${new Date().getTime() + 1}`, role: 'assistant', content: current, stopped: true, createdAt: new Date().toISOString() }
            mutateConversations(prev => prev.map(c => c.id === conversationId ? { ...c, messages: [...c.messages, stoppedMsg], updatedAt: new Date().toISOString() } : c))
          }
          return current
        })
      } else {
        const message = err.message || 'Something went wrong. Please try again.'
        setErrorMsg(message)
        logUsageEvent(orgId, userId, { type: 'chat', source, success: false, retry: isRetry, error: message, durationMs: new Date().getTime() - startedAt })
      }
      return null
    } finally {
      setStreaming(false)
      setStreamingText('')
      abortRef.current = null
    }
  }

  const regenerate = () => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    if (lastUser) sendMessage(lastUser.content, { isRetry: true })
  }
  const stopStreaming = () => abortRef.current?.abort()

  const newChat = () => {
    const fresh = createConversation()
    mutateConversations(prev => [fresh, ...prev])
    setActiveId(fresh.id)
    setErrorMsg(null)
    return fresh.id
  }
  const switchConversation = (id) => { setActiveId(id); setErrorMsg(null) }
  const togglePin = (id) => mutateConversations(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c))
  const renameConversation = (id, title) => {
    const trimmed = (title || '').trim()
    if (!trimmed) return
    mutateConversations(prev => prev.map(c => c.id === id ? { ...c, title: trimmed } : c))
  }
  const deleteConversation = (id) => {
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== id)
      const next = filtered.length ? filtered : [createConversation()]
      saveConversations(orgId, userId, next)
      if (id === activeId) setActiveId(next[0].id)
      return next
    })
  }

  return {
    conversations, sortedConversations, activeConversation, activeId, messages,
    streaming, streamingText, errorMsg, recentPromptsList,
    sendMessage, regenerate, stopStreaming, newChat, switchConversation, togglePin, renameConversation, deleteConversation,
  }
}
