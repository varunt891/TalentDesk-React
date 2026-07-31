import { Router } from 'express';
import { aiService } from '../services/aiService.js';
import { buildActionPrompt, toolIdForAction } from '../services/promptService.js';
import { requireAuth } from '../auth.js';
import { createRequire } from 'module';
import mammoth from 'mammoth';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const router = Router();
router.use(requireAuth);

router.post('/generate', async (req, res) => {
  try {
    const { prompt, toolId } = req.body;
    const result = await aiService.generate({ prompt, toolId });
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      provider: null,
      error: err.message || 'AI generation failed. Please try again.',
      code: err.code || `HTTP_${status}`
    });
  }
});

router.post('/submission-packet', async (req, res) => {
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
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: err.message || 'Submission packet generation failed.',
      code: err.code || `HTTP_${status}`
    });
  }
});

router.post('/match-evaluator', async (req, res) => {
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
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
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

    const prompt = `Parse the following raw resume text and extract candidate profile details into raw JSON:\n\n${resumeText}`;
    const result = await aiService.generate({ prompt, toolId: 'resume_parser' });

    let rawText = (result.text || '').trim();
    if (rawText.startsWith('```json')) {
      rawText = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    try {
      const parsedProfile = JSON.parse(rawText);
      return res.json({ success: true, profile: parsedProfile });
    } catch {
      return res.json({ success: false, error: 'AI response was not valid JSON.', rawText: result.text });
    }
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: err.message || 'Resume parsing failed.',
    });
  }
});

function sanitizeExtractedText(text) {
  if (!text) return '';
  let cleaned = text
    .replace(/%PDF-[\d\.]+/gi, '')
    .replace(/<<[\s\S]*?>>/g, ' ')
    .replace(/\b\d+\s+\d+\s+R\b/gi, ' ')
    .replace(/\b\d+\s+\d+\s+obj\b/gi, ' ')
    .replace(/\bendobj\b/gi, ' ')
    .replace(/\bstream[\s\S]*?endstream\b/gi, ' ')
    .replace(/\[\s*\d+(\s+\d+)*\s*\]/g, ' ')
    .replace(/\d+\[[\d\s]+\]/g, ' ')
    .replace(/\/[\w\d]+\b/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

router.post('/parse-resume-file', async (req, res) => {
  try {
    const { fileBase64, fileName } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ success: false, error: 'No file data provided.' });
    }

    let cleanBase64 = fileBase64;
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1];
    }
    cleanBase64 = cleanBase64.trim();
    const nameLower = (fileName || '').toLowerCase();
    let mimeType = 'application/pdf';
    if (nameLower.endsWith('.docx')) mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (nameLower.endsWith('.doc')) mimeType = 'application/msword';
    else if (nameLower.endsWith('.txt')) mimeType = 'text/plain';

    const prompt = `You are a Senior Talent Acquisition AI Resume Reader.
Read the attached candidate resume document file completely.
Extract the full clean, human-readable plain text of the resume (without any binary formatting artifacts, stream noise, or code).
Also parse candidate profile details.

Output ONLY a valid raw JSON object with keys:
"clean_resume_text": "full clean readable plain text of the resume here...",
"first_name": "First Name",
"last_name": "Last Name",
"email": "Email Address",
"phone": "Phone Number",
"location": "City, State",
"job_title": "Primary Target Role / Job Title",
"experience": 5 (number in years),
"work_auth": "Work Visa status",
"rate": "Hourly/Annual pay expectation",
"skills": ["Skill1", "Skill2", "Skill3"]`;

    const result = await aiService.generate({
      prompt,
      fileInlineData: {
        mimeType,
        data: cleanBase64
      },
      toolId: 'resume_parser'
    });

    let rawText = (result.text || '').trim();
    if (rawText.startsWith('```json')) {
      rawText = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsedProfile = {};
    try {
      parsedProfile = JSON.parse(rawText);
    } catch {
      /* ignore JSON parse error */
    }

    const extractedText = parsedProfile.clean_resume_text || '';

    return res.json({
      success: true,
      extractedText: sanitizeExtractedText(extractedText),
      profile: parsedProfile
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: err.message || 'File parsing failed.',
      code: err.code || `HTTP_${status}`
    });
  }
});

// Recruiter Copilot — streams the answer back over SSE so the panel can
// render tokens as they arrive instead of waiting for the full response.
router.post('/copilot/stream', async (req, res) => {
  const { message, history, context } = req.body || {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({ success: false, error: 'A message is required.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  const send = (event) => { res.write(`data: ${JSON.stringify(event)}\n\n`); };

  try {
    const historyBlock = Array.isArray(history) && history.length
      ? `\n\nRECENT CONVERSATION:\n${history.slice(-8).map(m => `${m.role === 'user' ? 'Recruiter' : 'Copilot'}: ${m.content}`).join('\n')}`
      : '';
    const contextBlock = context ? `\n\nWORKSPACE CONTEXT:\n${context}` : '';
    const prompt = `${String(message).trim()}${historyBlock}${contextBlock}`;

    const result = await aiService.generateStream({
      prompt,
      toolId: 'copilot_chat',
      signal: controller.signal,
      onDelta: (text) => send({ delta: text }),
    });

    send({ done: true, provider: result.provider, model: result.model });
    res.end();
  } catch (err) {
    if (err.name === 'AbortError') {
      res.end();
      return;
    }
    send({ error: err.message || 'AI response failed. Please try again.', code: err.code || 'STREAM_ERROR' });
    res.end();
  }
});

// AI Action Framework — one endpoint for every reusable content action
// (Summarize/Rewrite/Improve/Compare/Explain/Score/Analyze/Recommend/
// Draft/Translate/Extract), so no page has to hand-build its own prompt.
router.post('/action', async (req, res) => {
  try {
    const { action, content, context } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ success: false, error: 'Content is required.' });
    }
    const prompt = buildActionPrompt(action, content, context);
    const result = await aiService.generate({ prompt, toolId: toolIdForAction(action) });
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: err.message || 'AI action failed. Please try again.',
      code: err.code || `HTTP_${status}`
    });
  }
});

export default router;
