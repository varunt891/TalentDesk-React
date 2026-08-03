import { prisma } from '../prisma.js';

// Fire-and-forget AI usage recorder, called from route handlers right after
// an aiService call resolves (success or failure) — never awaited by the
// caller and never throws, so a logging hiccup can't turn into a broken AI
// response for the recruiter who was just trying to parse a resume.
export async function recordAiUsage({
  orgId,
  userId,
  userName,
  type,
  toolId,
  provider,
  model,
  success = true,
  durationMs,
  totalTokens,
  error,
}) {
  try {
    await prisma.aiUsageEvent.create({
      data: {
        org_id: orgId || null,
        user_id: userId || null,
        user_name: userName || null,
        type,
        tool_id: toolId || null,
        provider: provider || null,
        model: model || null,
        success,
        duration_ms: durationMs ?? null,
        total_tokens: totalTokens ?? null,
        error: error || null,
      },
    });
  } catch (err) {
    console.warn('[usageService] Failed to record AI usage event:', err.message);
  }
}
