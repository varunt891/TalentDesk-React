export function isRetryableGeminiError(error) {
  if (!error) return false;
  if (error.name === 'AbortError' || error.isTimeout) return true;
  if (error.isNetworkError) return true;

  const status = error.status || error.statusCode;
  if (status) {
    if ([429, 500, 502, 503, 504].includes(status)) return true;
    if (status >= 400 && status < 500 && status !== 429) {
      // 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found (invalid payload/auth/prompt)
      return false;
    }
  }

  const msg = (error.message || '').toLowerCase();
  if (
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('fetch failed')
  ) {
    return true;
  }

  return false;
}

export class GeminiService {
  async generate({ prompt, toolConfig }) {
    const key = (process.env.GEMINI_API_KEY || '').trim();
    if (!key) {
      const err = new Error('GEMINI_API_KEY environment variable is not configured on the server.');
      err.status = 500;
      err.code = 'CONFIG_MISSING_GEMINI_KEY';
      err.isRetryable = false;
      throw err;
    }

    const models = ['gemini-2.0-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
    let lastError = null;

    for (const model of models) {
      const attempts = toolConfig.allowGrounding ? [true, false] : [false];

      for (const useGrounding of attempts) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout

        try {
          const payload = {
            systemInstruction: {
              parts: [{ text: toolConfig.systemPrompt }]
            },
            contents: [
              { parts: [{ text: prompt }] }
            ],
            generationConfig: {
              temperature: toolConfig.temperature,
              maxOutputTokens: toolConfig.maxTokens
            }
          };

          if (useGrounding) {
            payload.tools = [{ googleSearch: {} }];
          }

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: controller.signal
            }
          );

          clearTimeout(timeoutId);

          const data = await response.json();

          if (!response.ok) {
            const apiError = new Error(data?.error?.message || `Gemini API returned status ${response.status}`);
            apiError.status = response.status;
            apiError.code = data?.error?.status || `HTTP_${response.status}`;
            apiError.isRetryable = isRetryableGeminiError(apiError);

            console.warn(`[Gemini ${model}] Grounded:${useGrounding} Status:${response.status} -> ${apiError.message}`);

            // Non-retryable error (e.g. 400 Bad Request, 401 Auth error) -> stop immediately
            if (!apiError.isRetryable) {
              throw apiError;
            }

            lastError = apiError;
            continue;
          }

          const candidate = data?.candidates?.[0];
          const text = candidate?.content?.parts?.map(part => part.text).join('') || '';

          if (!text) {
            lastError = new Error('Gemini returned an empty text response.');
            lastError.status = 502;
            lastError.isRetryable = true;
            continue;
          }

          const sources = (candidate?.groundingMetadata?.groundingChunks || [])
            .map(chunk => chunk?.web)
            .filter(web => web?.uri)
            .map(web => ({
              title: web.title || web.uri,
              uri: web.uri
            }))
            .filter((source, index, all) => all.findIndex(item => item.uri === source.uri) === index)
            .slice(0, 6);

          const sourceBlock = sources.length
            ? `\n\n---\n#### 🌐 Verified Web Sources & Citations\n${sources.map(source => `- [${source.title}](${source.uri})`).join('\n')}`
            : '';

          return {
            provider: 'gemini',
            model,
            grounded: useGrounding && sources.length > 0,
            sources,
            text: `${text.trim()}${sourceBlock}`
          };
        } catch (err) {
          clearTimeout(timeoutId);

          if (err.name === 'AbortError') {
            const timeoutError = new Error(`Gemini request timed out after 10 seconds (${model}).`);
            timeoutError.status = 504;
            timeoutError.code = 'GEMINI_TIMEOUT';
            timeoutError.isRetryable = true;
            lastError = timeoutError;
            console.warn(`[Gemini Timeout] ${model}`);
            continue;
          }

          if (err.isRetryable === false) {
            throw err;
          }

          err.isRetryable = isRetryableGeminiError(err);
          lastError = err;
          console.error(`[Gemini Fetch Error ${model}]`, err.message);
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    const fallbackErr = new Error('All Gemini model requests failed.');
    fallbackErr.status = 502;
    fallbackErr.code = 'GEMINI_MODELS_FAILED';
    fallbackErr.isRetryable = true;
    throw fallbackErr;
  }
}

export const geminiService = new GeminiService();
