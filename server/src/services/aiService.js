import { cacheService } from './cacheService.js';
import { getToolConfig } from './promptService.js';
import { groqService } from './groqService.js';
import { geminiService } from './geminiService.js';
import { openRouterService } from './openRouterService.js';
import { mistralService } from './mistralService.js';

export class AIService {
  // Streaming path for the Recruiter Copilot — Groq as primary, then Gemini -> OpenRouter -> Mistral
  async generateStream({ prompt, toolId, onDelta, signal }) {
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
    const startTime = Date.now();

    // 1. Primary Attempt: Groq Stream / Generate
    try {
      let groqResult;
      try {
        groqResult = await groqService.generateStream({ prompt: cleanPrompt, toolConfig, onDelta, signal });
      } catch (groqStreamErr) {
        if (groqStreamErr.name === 'AbortError') throw groqStreamErr;
        groqResult = await groqService.generate({ prompt: cleanPrompt, toolConfig });
        if (groqResult?.text && onDelta) {
          onDelta(groqResult.text);
        }
      }

      const durationMs = Date.now() - startTime;
      console.log(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:${groqResult.provider} | model:${groqResult.model} | latency:${durationMs}ms | stream:true | status:200`);
      return { success: true, provider: groqResult.provider, model: groqResult.model, text: groqResult.text };
    } catch (groqErr) {
      if (groqErr.name === 'AbortError') throw groqErr;
      console.warn(`[AI Stream Fallback 1 Triggered] Groq stream failed (${groqErr.message}). Attempting Gemini fallback...`);
    }

    // 2. Fallback 1: Gemini Stream
    try {
      const result = await geminiService.generateStream({ prompt: cleanPrompt, toolConfig, onDelta, signal });
      const durationMs = Date.now() - startTime;
      console.log(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:${result.provider} | model:${result.model} | latency:${durationMs}ms | stream:fallback | status:200`);
      return { success: true, provider: result.provider, model: result.model, text: result.text };
    } catch (geminiErr) {
      if (geminiErr.name === 'AbortError') throw geminiErr;
      console.warn(`[AI Stream Fallback 2 Triggered] Gemini stream failed (${geminiErr.message}). Attempting OpenRouter fallback...`);
    }

    // 3. Fallback 2: OpenRouter Stream / Generate
    try {
      let routerResult;
      try {
        routerResult = await openRouterService.generateStream({ prompt: cleanPrompt, toolConfig, onDelta, signal });
      } catch (routerStreamErr) {
        if (routerStreamErr.name === 'AbortError') throw routerStreamErr;
        routerResult = await openRouterService.generate({ prompt: cleanPrompt, toolConfig });
        if (routerResult?.text && onDelta) {
          onDelta(routerResult.text);
        }
      }

      const durationMs = Date.now() - startTime;
      console.log(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:${routerResult.provider} | model:${routerResult.model} | latency:${durationMs}ms | stream:fallback2 | status:200`);
      return { success: true, provider: routerResult.provider, model: routerResult.model, text: routerResult.text };
    } catch (routerErr) {
      if (routerErr.name === 'AbortError') throw routerErr;
      console.warn(`[AI Stream Fallback 3 Triggered] OpenRouter failed (${routerErr.message}). Attempting Mistral fallback...`);
    }

    // 4. Fallback 3: Mistral Stream / Generate
    try {
      let mistralResult;
      try {
        mistralResult = await mistralService.generateStream({ prompt: cleanPrompt, toolConfig, onDelta, signal });
      } catch (mistralStreamErr) {
        if (mistralStreamErr.name === 'AbortError') throw mistralStreamErr;
        mistralResult = await mistralService.generate({ prompt: cleanPrompt, toolConfig });
        if (mistralResult?.text && onDelta) {
          onDelta(mistralResult.text);
        }
      }

      const durationMs = Date.now() - startTime;
      console.log(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:${mistralResult.provider} | model:${mistralResult.model} | latency:${durationMs}ms | stream:fallback3 | status:200`);
      return { success: true, provider: mistralResult.provider, model: mistralResult.model, text: mistralResult.text };
    } catch (mistralErr) {
      if (mistralErr.name === 'AbortError') throw mistralErr;
      const durationMs = Date.now() - startTime;
      console.error(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:mistral | latency:${durationMs}ms | stream:failed | status:502 | error:${mistralErr.message}`);

      const combinedErr = new Error(`All AI providers (Groq, Gemini, OpenRouter, Mistral) failed: ${mistralErr.message}`);
      combinedErr.status = 502;
      combinedErr.code = 'ALL_PROVIDERS_FAILED';
      throw combinedErr;
    }
  }

  async generate({ prompt, fileInlineData, toolId, cacheTtlMs }) {
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
    if (!fileInlineData) {
      const cachedResponse = cacheService.get(activeToolId, cleanPrompt);
      if (cachedResponse) {
        console.log(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:${cachedResponse.provider} | model:${cachedResponse.model} | latency:0ms (CACHE_HIT) | grounded:${cachedResponse.grounded} | fallback:false | status:200`);
        return {
          ...cachedResponse,
          cached: true
        };
      }
    }

    const startTime = Date.now();

    // 2. Primary Provider: Groq
    if (!fileInlineData) {
      try {
        const groqResult = await groqService.generate({ prompt: cleanPrompt, toolConfig });
        const durationMs = Date.now() - startTime;

        console.log(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:${groqResult.provider} | model:${groqResult.model} | latency:${durationMs}ms | grounded:false | fallback:false | status:200`);

        const responsePayload = {
          success: true,
          provider: groqResult.provider,
          model: groqResult.model,
          grounded: false,
          sources: [],
          text: groqResult.text,
          totalTokens: groqResult.totalTokens ?? null
        };

        cacheService.set(activeToolId, cleanPrompt, responsePayload, cacheTtlMs);
        return { ...responsePayload, cached: false, durationMs };
      } catch (groqError) {
        console.warn(`[AI Fallback Triggered] Groq failed (${groqError.message}). Attempting Gemini fallback...`);
      }
    }

    // 3. Fallback Provider 1: Google Gemini
    try {
      const result = await geminiService.generate({ prompt: cleanPrompt, fileInlineData, toolConfig });
      const durationMs = Date.now() - startTime;

      console.log(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:${result.provider} | model:${result.model} | latency:${durationMs}ms | grounded:${result.grounded} | fallback:true | status:200`);

      const responsePayload = {
        success: true,
        provider: result.provider,
        model: result.model,
        grounded: result.grounded,
        sources: result.sources || [],
        text: result.text,
        totalTokens: result.totalTokens ?? null
      };

      cacheService.set(activeToolId, cleanPrompt, responsePayload, cacheTtlMs);
      return { ...responsePayload, cached: false, durationMs };
    } catch (geminiError) {
      console.warn(`[AI Fallback 2 Triggered] Gemini failed (${geminiError.message}). Attempting OpenRouter fallback...`);
    }

    // 4. Fallback Provider 2: OpenRouter
    try {
      const routerResult = await openRouterService.generate({ prompt: cleanPrompt, toolConfig });
      const durationMs = Date.now() - startTime;

      console.log(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:${routerResult.provider} | model:${routerResult.model} | latency:${durationMs}ms | grounded:false | fallback:true2 | status:200`);

      const responsePayload = {
        success: true,
        provider: routerResult.provider,
        model: routerResult.model,
        grounded: false,
        sources: [],
        text: routerResult.text,
        totalTokens: routerResult.totalTokens ?? null
      };

      cacheService.set(activeToolId, cleanPrompt, responsePayload, cacheTtlMs);
      return { ...responsePayload, cached: false, durationMs };
    } catch (routerError) {
      console.warn(`[AI Fallback 3 Triggered] OpenRouter error (${routerError.message}). Attempting Mistral fallback...`);
    }

    // 5. Fallback Provider 3: Mistral AI
    try {
      const mistralResult = await mistralService.generate({ prompt: cleanPrompt, toolConfig });
      const durationMs = Date.now() - startTime;

      console.log(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:${mistralResult.provider} | model:${mistralResult.model} | latency:${durationMs}ms | grounded:false | fallback:true3 | status:200`);

      const responsePayload = {
        success: true,
        provider: mistralResult.provider,
        model: mistralResult.model,
        grounded: false,
        sources: [],
        text: mistralResult.text,
        totalTokens: mistralResult.totalTokens ?? null
      };

      cacheService.set(activeToolId, cleanPrompt, responsePayload, cacheTtlMs);
      return { ...responsePayload, cached: false, durationMs };
    } catch (mistralError) {
      const durationMs = Date.now() - startTime;
      const status = mistralError.status || 502;
      console.error(`[AI METRICS] ${new Date().toISOString()} | tool:${activeToolId} | provider:mistral | model:none | latency:${durationMs}ms | grounded:false | fallback:failed | status:${status} | error:${mistralError.message}`);

      const combinedError = new Error(`All AI providers (Groq, Gemini, OpenRouter, Mistral) failed: ${mistralError.message}`);
      combinedError.status = 502;
      combinedError.code = 'ALL_PROVIDERS_FAILED';
      throw combinedError;
    }
  }
}

export const aiService = new AIService();
