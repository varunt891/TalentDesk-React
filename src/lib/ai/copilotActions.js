/**
 * useCopilotActions — shared hook used by both the Dashboard Copilot widget
 * and the AI Center chat panel. Encapsulates:
 *   1. Building the structured AI prompt
 *   2. Parsing the structured JSON response (isAction / pendingAction)
 *   3. Executing confirmed CRM operations via executeCrmAction
 *
 * The caller provides live workspace data (candidates, jobs, etc.) and a set
 * of UI callbacks (addMessage, markExecuted, markCancelled) so this hook
 * remains pure business-logic with no rendering.
 */
import { useCallback } from 'react'
import { apiRequest } from '../api'
import { executeCrmAction, parseCrmActionFromText } from '../executeCrmAction'

// Build the structured copilot prompt identical to the Dashboard widget
function buildCopilotPrompt({ q, candidates = [], jobs = [], callbacks = [], historyMessages = [] }) {
  const candidateContextList = candidates.slice(0, 100).map(c => ({
    id: c.id,
    name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
    recruiter: c.recruiter_name || 'Unassigned',
    job: c.job_title || 'N/A',
    client: c.client || 'N/A',
    stage: c.internal_status || c.external_status || 'Submitted',
    submitted_date: c.submission_date || 'N/A',
  }))
  const jobContextList = jobs.slice(0, 100).map(j => ({
    id: j.id, job_id: j.job_id, title: j.title, client: j.client,
    location: j.location, type: j.type, status: j.status, rate: j.rate,
  }))
  const openJobsCount = jobs.filter(j => j.status === 'Open').length
  const historyContext = historyMessages
    .slice(-6)
    .map(m => `${(m.role || m.sender) === 'user' ? 'Recruiter' : 'Copilot'}: ${m.content || m.text || ''}`)
    .join('\n')

  return `You are the TalentDesk AI Action Copilot, an intelligent recruiting controller inspired by ChatGPT and Cursor.

RECENT CONVERSATION HISTORY (Session Context):
${historyContext}

CONVERSATIONAL & FORMATTING RULES:
1. Provide a direct, concise 1-2 sentence answer in "summary".
2. DO NOT include "snapshot", "insight", or "nextBestAction" unless the user explicitly asks an analytical/metric question. For simple questions or action triggers, omit these or set them to null.
3. Use the Recent Conversation History to resolve implicit references like "it", "reopen it", "that job", or "schedule him".
4. When asked which recruiter submitted a candidate, search the Available Candidates context array below.

RULES FOR REQUEST CLASSIFICATION:

1. ACTION REQUESTS:
Detect if the user wants to perform an operation such as:
- Post / Create Job ("post job Software Developer in New York", "add job React Engineer rate $90/hr")
- Close Job ("close senior react developer", "close job #1", "close it")
- Reopen Job ("reopen lead devops", "reopen it")
- Create Task / Add Note ("remind me to call Alex tomorrow", "add task review submittals")
- Log Callback ("log callback for Sarah Jenkins")
- Update Candidate Stage / Schedule Interview ("move Alex Rivera to Interview stage", "schedule interview for Sarah", "schedule phone interview for John on 2026-09-20 at 2:00 PM", "set up video interview for Alex tomorrow at 10am")
- Schedule Interview (when the user says "schedule interview" with a date/time, use type=schedule_interview and populate interview_date, interview_time, interview_type in params)
- Delete Task / Note ("delete note #1")

For Action Requests, set isAction = true and populate pendingAction:
{
  "summary": "Short explanation of the requested operation.",
  "isAction": true,
  "pendingAction": {
    "type": "create_job | close_job | reopen_job | create_task | log_callback | update_candidate_stage | schedule_interview | delete_note",
    "entity": "job | candidate | callback | task",
    "entityId": "matched_id_string_or_null",
    "entityName": "name_or_title_or_text",
    "params": { "title": "Job Title", "client": "Client Name", "location": "City/Remote", "type": "Full-time", "status": "Open", "rate": "$ salary or rate", "priority": "High", "description": "Job details", "stage": "Interview Scheduled", "text": "description", "interview_date": "YYYY-MM-DD (extract from user message, e.g. tomorrow = next date, or null)", "interview_time": "HH:MM 24h or natural like '2:00 PM' (extract from user message or null)", "interview_type": "Phone | Video | In-Person | Panel (extract from user message or default to Phone)" },
    "requiresConfirmation": true,
    "confirmTitle": "Confirmation Required Title",
    "confirmPrompt": "Clear prompt asking user if they want to execute this operation.",
    "successMessage": "Action completed successfully."
  },
  "snapshot": null,
  "insight": null,
  "nextBestAction": null,
  "actions": [ { "label": "Confirm Action", "action": "confirm_action" } ],
  "followup": "Would you like me to notify team members?"
}

2. INFORMATIONAL / ANALYTICAL REQUESTS:
For questions, analytics, candidate submittal inquiries, or search queries, set isAction = false, pendingAction = null.

User Question: "${q}"
Available Candidates: ${JSON.stringify(candidateContextList)}
Available Jobs: ${JSON.stringify(jobContextList)}
Workspace Metrics: Candidates (${candidates.length}), Active Jobs (${openJobsCount}), Callbacks (${callbacks.length}).`
}

/**
 * Parse the raw AI text response into a structured object.
 * Falls back to the text-based intent parser if JSON parsing fails.
 */
export function parseCopilotResponse(rawReply, q) {
  // Try JSON parse first
  try {
    const clean = rawReply.replace(/```json\s*|\s*```/g, '').trim()
    const parsed = JSON.parse(clean)
    // Ensure confirmation is always required
    if (parsed.pendingAction) parsed.pendingAction.requiresConfirmation = true
    return parsed
  } catch {
    // JSON failed — try fallback text parser
    const cleanText = rawReply.replace(/```|\*\*|###|---/g, '').trim()
    const fallbackAction = parseCrmActionFromText(q)
    return {
      summary: fallbackAction
        ? `I've prepared the following action. Please review and confirm below.`
        : (cleanText || `Here is the Copilot response for "${q}".`),
      isAction: !!fallbackAction,
      pendingAction: fallbackAction,
      snapshot: null, insight: null, nextBestAction: null,
      actions: fallbackAction ? [{ label: 'Confirm Action', action: 'confirm_action' }] : [],
      followup: null,
    }
  }
}

/**
 * Send a user message through the structured copilot AI and return a parsed response.
 * Returns null on error (caller should handle).
 */
export async function runCopilotQuery({ q, candidates, jobs, callbacks, historyMessages }) {
  const prompt = buildCopilotPrompt({ q, candidates, jobs, callbacks, historyMessages })
  const data = await apiRequest('/ai/generate', {
    method: 'POST',
    body: { prompt, toolId: 'copilot' },
  })
  const rawReply = data?.text || ''
  return parseCopilotResponse(rawReply, q)
}

/**
 * Execute a confirmed pending CRM action.
 * Wraps executeCrmAction with the workspace snapshot data.
 */
export async function confirmCrmAction(pendingAction, { candidates, jobs, callbacks, followups, userId, orgId, profile, onRefresh }) {
  return executeCrmAction(pendingAction, {
    candidates, jobs, callbacks, followups, userId, orgId, profile, onRefresh,
  })
}
