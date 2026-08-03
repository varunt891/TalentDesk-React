import { aiService } from './aiService.js';
import { recordAiUsage } from './usageService.js';

function stripJsonFence(rawText) {
  let cleaned = (rawText || '').trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned;
}

// Shared by /api/ai/parse-resume and the resume upload routes (single +
// bulk) so the prompt + JSON-fence-stripping logic, and the usage logging
// for every resume-parsing call regardless of entry point, only live in one
// place. Text-only (no file vision), so it gets the full Gemini -> Groq ->
// OpenRouter -> Mistral fallback chain in aiService, unlike direct
// file-based parsing.
export async function parseResumeText(resumeText, context = {}) {
  const startedAt = Date.now();
  const prompt = `Parse the following raw resume text and extract candidate profile details into raw JSON:\n\n${resumeText}`;

  let result;
  try {
    result = await aiService.generate({ prompt, toolId: 'resume_parser' });
  } catch (err) {
    recordAiUsage({ ...context, type: 'action', toolId: 'resume_parser', success: false, durationMs: Date.now() - startedAt, error: err.message });
    throw err;
  }

  const cleaned = stripJsonFence(result.text);
  try {
    const profile = JSON.parse(cleaned);
    if (!result.cached) {
      recordAiUsage({ ...context, type: 'action', toolId: 'resume_parser', provider: result.provider, model: result.model, success: true, durationMs: Date.now() - startedAt, totalTokens: result.totalTokens });
    }
    return profile;
  } catch {
    recordAiUsage({ ...context, type: 'action', toolId: 'resume_parser', provider: result.provider, model: result.model, success: false, durationMs: Date.now() - startedAt, error: 'AI response was not valid JSON.' });
    const err = new Error('AI response was not valid JSON.');
    err.status = 502;
    err.code = 'AI_INVALID_JSON';
    throw err;
  }
}
