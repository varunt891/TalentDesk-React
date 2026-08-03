import { Router } from 'express';
import { aiService } from '../services/aiService.js';
import { buildActionPrompt, toolIdForAction } from '../services/promptService.js';
import { parseResumeText } from '../services/resumeParsingService.js';
import { recordAiUsage } from '../services/usageService.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

// Shared identity fields every usage-event log needs, pulled off the
// authenticated request the same way logActivity() does in data.routes.js.
function usageContext(req) {
  return {
    orgId: req.organizationId || req.profile?.org_id,
    userId: req.user?.id,
    userName: req.profile?.full_name || req.user?.email,
  };
}

router.post('/generate', async (req, res) => {
  const startedAt = Date.now();
  try {
    const { prompt, toolId } = req.body;
    const result = await aiService.generate({ prompt, toolId });
    if (!result.cached) {
      recordAiUsage({ ...usageContext(req), type: 'action', toolId, provider: result.provider, model: result.model, success: true, durationMs: Date.now() - startedAt, totalTokens: result.totalTokens });
    }
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    recordAiUsage({ ...usageContext(req), type: 'action', toolId: req.body?.toolId, success: false, durationMs: Date.now() - startedAt, error: err.message });
    return res.status(status).json({
      success: false,
      provider: null,
      error: err.message || 'AI generation failed. Please try again.',
      code: err.code || `HTTP_${status}`
    });
  }
});

router.post('/submission-packet', async (req, res) => {
  const startedAt = Date.now();
  try {
    const { candidate, job, resumeText } = req.body;
    const prompt = `Candidate Details:
- Name: ${candidate.first_name || ''} ${candidate.last_name || ''}
- Current/Previous Title: ${candidate.job_title || ''}
- Experience: ${candidate.experience || 'Not specified'}
- Work Auth: ${candidate.work_auth || 'Not specified'}
- Location: ${candidate.location || 'Not specified'}
- Skills: ${Array.isArray(candidate.skills) ? candidate.skills.join(', ') : (candidate.skills || '')}
- Notes: ${candidate.notes || 'None'}

Job Requirement Details:
- Job Title: ${job.title || ''}
- Client: ${job.client || 'Confidential Client'}
- Location: ${job.location || ''}
- Rate/Pay: ${job.rate || 'Standard Market Rate'}
- Required Skills: ${Array.isArray(job.skills) ? job.skills.join(', ') : (job.skills || '')}
- Description: ${job.description || 'N/A'}

Candidate Resume Text:
${resumeText || candidate.resume_text || 'No raw resume text provided. Use candidate metadata.'}

Please generate a top-tier Client Submission Package based on these details.`;

    const result = await aiService.generate({ prompt, toolId: 'submission_packet' });
    if (!result.cached) {
      recordAiUsage({ ...usageContext(req), type: 'action', toolId: 'submission_packet', provider: result.provider, model: result.model, success: true, durationMs: Date.now() - startedAt, totalTokens: result.totalTokens });
    }
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    recordAiUsage({ ...usageContext(req), type: 'action', toolId: 'submission_packet', success: false, durationMs: Date.now() - startedAt, error: err.message });
    return res.status(status).json({
      success: false,
      error: err.message || 'Submission packet generation failed.',
      code: err.code || `HTTP_${status}`
    });
  }
});

router.post('/match-evaluator', async (req, res) => {
  const startedAt = Date.now();
  try {
    const { candidate, job, resumeText } = req.body;
    const prompt = `Perform a deep technical candidate evaluation comparing candidate background against client requisition.

Candidate Profile:
- Name: ${candidate.first_name || ''} ${candidate.last_name || ''}
- Current/Previous Title: ${candidate.job_title || ''}
- Experience: ${candidate.experience || 'Unspecified'} yrs
- Work Authorization: ${candidate.work_auth || 'Unspecified'}
- Location: ${candidate.location || 'Unspecified'}
- Target Rate: ${candidate.rate || 'Flexible'}
- Key Skills: ${Array.isArray(candidate.skills) ? candidate.skills.join(', ') : (candidate.skills || '')}

Job Requisition Details:
- Job ID: ${job.job_id || 'REQ-001'}
- Job Title: ${job.title || ''}
- Client: ${job.client || 'Client Account'}
- Location: ${job.location || ''}
- Rate/Budget: ${job.rate || 'Market Rate'}
- Required Skills: ${Array.isArray(job.skills) ? job.skills.join(', ') : (job.skills || '')}
- Job Description: ${job.description || 'N/A'}

Candidate Resume Text:
${resumeText || candidate.resume_text || 'No full raw resume attached. Evaluate using candidate metadata.'}

Format the response strictly in Markdown with sections:
### Overall Fit Score: [XX / 100]
### Placement Probability & Executive Verdict
### Core Matching Strengths
### Critical Skill Gaps & Hiring Risks
### Recruiter Screening Call Script (4 Probing Questions to ask Candidate on call)`;

    const result = await aiService.generate({ prompt, toolId: 'match' });
    if (!result.cached) {
      recordAiUsage({ ...usageContext(req), type: 'action', toolId: 'match', provider: result.provider, model: result.model, success: true, durationMs: Date.now() - startedAt, totalTokens: result.totalTokens });
    }
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    recordAiUsage({ ...usageContext(req), type: 'action', toolId: 'match', success: false, durationMs: Date.now() - startedAt, error: err.message });
    return res.status(status).json({
      success: false,
      error: err.message || 'AI Match Evaluation failed.',
      code: err.code || `HTTP_${status}`
    });
  }
});

router.post('/parse-resume', async (req, res) => {
  try {
    const { resumeText } = req.body;
    if (!resumeText || !resumeText.trim()) {
      return res.status(400).json({ success: false, error: 'No resume text provided.' });
    }

    const profile = await parseResumeText(resumeText, usageContext(req));
    return res.json({ success: true, profile });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: err.message || 'Resume parsing failed.',
    });
  }
});

// File-based resume parsing (upload + local text extraction + AI field
// parsing) now lives at POST /api/upload/resume, see upload.routes.js. That
// route reuses parseResumeText() above plus documentTextService's local
// pdf-parse/mammoth/html-to-text extraction, which gives every file format
// the full Gemini -> Groq -> OpenRouter -> Mistral fallback chain instead of
// being hard-coupled to Gemini's file-vision input like this route used to be.

// Playful mascot dialogue for the top-bar pixel bots (see promptService's
// `bot_lines` config). Fixed prompt text + a 24h cache TTL (well past
// aiService's normal 15-min default) means this only actually calls Gemini
// once a day at most, regardless of how often the client polls — this is
// flavor text, not something that needs to be fresh minute-to-minute, so
// there's no reason to spend tokens on it more often than that. Never tied
// to real user/candidate data, so a failure here just means the client
// falls back to its (large) static line pool.
const BOT_LINES_MAX_LEN = 60; // must fit the topbar speech bubble on one line
const BOT_LINES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

router.get('/bot-lines', async (_req, res) => {
  try {
    const result = await aiService.generate({
      prompt: 'Generate a fresh batch of playful mascot dialogue now.',
      toolId: 'bot_lines',
      cacheTtlMs: BOT_LINES_CACHE_TTL_MS,
    });

    let rawText = (result.text || '').trim();
    if (rawText.startsWith('```json')) {
      rawText = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(rawText);
    const isShortLine = (l) => typeof l === 'string' && l.trim() && l.length <= BOT_LINES_MAX_LEN;
    const candidateLines = Array.isArray(parsed.candidateLines)
      ? parsed.candidateLines.filter(isShortLine).slice(0, 12)
      : [];
    const robotLines = Array.isArray(parsed.robotLines)
      ? parsed.robotLines.filter(isShortLine).slice(0, 12)
      : [];
    const bicker = Array.isArray(parsed.bicker)
      ? parsed.bicker
        .filter(b => b && isShortLine(b.candidate) && isShortLine(b.robot) && isShortLine(b.comeback))
        .slice(0, 8)
      : [];

    return res.json({ success: true, candidateLines, robotLines, bicker });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, error: err.message || 'Bot line generation failed.' });
  }
});

// AI Action Framework — one endpoint for every reusable content action
// (Summarize/Rewrite/Improve/Compare/Explain/Score/Analyze/Recommend/
// Draft/Translate/Extract), so no page has to hand-build its own prompt.
router.post('/action', async (req, res) => {
  const startedAt = Date.now();
  const { action, content, context } = req.body || {};
  const toolId = toolIdForAction(action);
  try {
    if (!content || !String(content).trim()) {
      return res.status(400).json({ success: false, error: 'Content is required.' });
    }
    const prompt = buildActionPrompt(action, content, context);
    const result = await aiService.generate({ prompt, toolId });
    if (!result.cached) {
      recordAiUsage({ ...usageContext(req), type: 'action', toolId, provider: result.provider, model: result.model, success: true, durationMs: Date.now() - startedAt, totalTokens: result.totalTokens });
    }
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    recordAiUsage({ ...usageContext(req), type: 'action', toolId, success: false, durationMs: Date.now() - startedAt, error: err.message });
    return res.status(status).json({
      success: false,
      error: err.message || 'AI action failed. Please try again.',
      code: err.code || `HTTP_${status}`
    });
  }
});

// Shared SSE scaffold for every streaming AI surface (Recruiter Copilot,
// the Action Framework, purpose-built tools like Market Salary & Demand) —
// tokens render as they arrive instead of the UI going silent until the
// whole response is done. `buildRequest(req)` validates the body and
// returns { prompt, toolId, type }; it may throw an Error with a `.status`
// to short-circuit with a normal JSON error response before SSE headers go
// out. No token counts here — this app's SSE parsing doesn't capture a
// usage field from the streamed response, unlike the non-streaming routes.
function streamingRoute(buildRequest) {
  return async (req, res) => {
    const startedAt = Date.now();
    let prompt, toolId, type;
    try {
      ({ prompt, toolId, type } = buildRequest(req));
    } catch (err) {
      return res.status(err.status || 400).json({ success: false, error: err.message });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const controller = new AbortController();
    req.on('close', () => controller.abort());
    const send = (event) => { res.write(`data: ${JSON.stringify(event)}\n\n`); };

    try {
      const result = await aiService.generateStream({
        prompt,
        toolId,
        signal: controller.signal,
        onDelta: (text) => send({ delta: text }),
      });
      send({ done: true, provider: result.provider, model: result.model });
      recordAiUsage({ ...usageContext(req), type, toolId, provider: result.provider, model: result.model, success: true, durationMs: Date.now() - startedAt });
      res.end();
    } catch (err) {
      if (err.name === 'AbortError') {
        res.end();
        return;
      }
      recordAiUsage({ ...usageContext(req), type, toolId, success: false, durationMs: Date.now() - startedAt, error: err.message });
      send({ error: err.message || 'AI request failed. Please try again.', code: err.code || 'STREAM_ERROR' });
      res.end();
    }
  };
}

// Recruiter Copilot — conversational chat.
router.post('/copilot/stream', streamingRoute((req) => {
  const { message, history, context } = req.body || {};
  if (!message || !String(message).trim()) {
    const err = new Error('A message is required.');
    err.status = 400;
    throw err;
  }
  const historyBlock = Array.isArray(history) && history.length
    ? `\n\nRECENT CONVERSATION:\n${history.slice(-8).map(m => `${m.role === 'user' ? 'Recruiter' : 'Copilot'}: ${m.content}`).join('\n')}`
    : '';
  const contextBlock = context ? `\n\nWORKSPACE CONTEXT:\n${context}` : '';
  return { prompt: `${String(message).trim()}${historyBlock}${contextBlock}`, toolId: 'copilot_chat', type: 'chat' };
}));

// Streaming twin of POST /action — same prompt building, incremental output.
router.post('/action/stream', streamingRoute((req) => {
  const { action, content, context } = req.body || {};
  if (!content || !String(content).trim()) {
    const err = new Error('Content is required.');
    err.status = 400;
    throw err;
  }
  return { prompt: buildActionPrompt(action, content, context), toolId: toolIdForAction(action), type: 'action' };
}));

// Streaming twin of POST /generate — for purpose-built tools (e.g. Market
// Salary & Demand) that call a specific toolId with a client-built prompt.
router.post('/generate/stream', streamingRoute((req) => {
  const { prompt, toolId } = req.body || {};
  if (!prompt || !String(prompt).trim()) {
    const err = new Error('Prompt is required.');
    err.status = 400;
    throw err;
  }
  return { prompt, toolId, type: 'action' };
}));

export default router;
