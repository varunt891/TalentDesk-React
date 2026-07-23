import { cacheService } from './cacheService.js';
import { getToolConfig } from './promptService.js';
import { geminiService } from './geminiService.js';
import { groqService } from './groqService.js';

export class AIService {
  async generate({ prompt, toolId }) {
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      const err = new Error('Prompt is required and must be a non-empty text string.');
      err.status = 400;
      err.code = 'INVALID_PROMPT';
      err.isRetryable = false;
      throw err;
    }

    const cleanPrompt = prompt.trim();
    const activeToolId = toolId || 'default';
    const toolConfig = getToolConfig(activeToolId);

    // 1. Response Caching Check
    const cachedResponse = cacheService.get(activeToolId, cleanPrompt);
    if (cachedResponse) {
      console.log(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:${cachedResponse.provider} | model:${cachedResponse.model} | latency:0ms (CACHE_HIT) | grounded:${cachedResponse.grounded} | fallback:false | status:200`);
      return {
        ...cachedResponse,
        cached: true
      };
    }

    const startTime = Date.now();

    // 2. Primary Provider: Google Gemini
    try {
      const result = await geminiService.generate({ prompt: cleanPrompt, toolConfig });
      const durationMs = Date.now() - startTime;

      console.log(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:${result.provider} | model:${result.model} | latency:${durationMs}ms | grounded:${result.grounded} | fallback:false | status:200`);

      const responsePayload = {
        success: true,
        provider: result.provider,
        model: result.model,
        grounded: result.grounded,
        sources: result.sources || [],
        text: result.text
      };

      cacheService.set(activeToolId, cleanPrompt, responsePayload);
      return { ...responsePayload, cached: false };
    } catch (geminiError) {
      // If Gemini error is NON-RETRYABLE (e.g. HTTP 400, Invalid Payload, Missing Gemini Key, Auth 401/403)
      if (geminiError.isRetryable === false) {
        const durationMs = Date.now() - startTime;
        const status = geminiError.status || 400;
        console.error(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:gemini | model:none | latency:${durationMs}ms | grounded:false | fallback:skipped | status:${status} | error:${geminiError.message}`);
        
        throw geminiError;
      }

      console.warn(`[AI Fallback Triggered] Gemini retryable error (${geminiError.message}). Attempting Groq fallback...`);
    }

    // 3. Fallback Provider: Groq
    try {
      const groqResult = await groqService.generate({ prompt: cleanPrompt, toolConfig });
      const durationMs = Date.now() - startTime;

      console.log(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:${groqResult.provider} | model:${groqResult.model} | latency:${durationMs}ms | grounded:false | fallback:true | status:200`);

      const responsePayload = {
        success: true,
        provider: groqResult.provider,
        model: groqResult.model,
        grounded: false,
        sources: [],
        text: groqResult.text
      };

      cacheService.set(activeToolId, cleanPrompt, responsePayload);
      return { ...responsePayload, cached: false };
    } catch (groqError) {
      const durationMs = Date.now() - startTime;
      const status = groqError.status || 502;
      console.error(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:groq | model:none | latency:${durationMs}ms | grounded:false | fallback:failed | status:${status} | error:${groqError.message}`);

      const combinedError = new Error(`Both Gemini and Groq AI providers failed: ${groqError.message}`);
      combinedError.status = 502;
      combinedError.code = 'ALL_PROVIDERS_FAILED';
      throw combinedError;
    }
  }
}

export const aiService = new AIService();
