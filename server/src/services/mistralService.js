import { getConfiguredModels } from './modelConfig.js';

const getMistralModels = () => getConfiguredModels({
  primaryEnv: 'MISTRAL_MODEL',
  fallbackEnv: 'MISTRAL_FALLBACK_MODELS',
  defaults: [
    'mistral-small-latest',
    'ministral-8b-latest'
  ]
});

export class MistralService {
  async generateStream({ prompt, toolConfig, onDelta, signal }) {
    const key = (process.env.MISTRAL_API_KEY || '').trim();
    if (!key) {
      const err = new Error('MISTRAL_API_KEY environment variable is not configured on the server.');
      err.status = 500;
      err.code = 'CONFIG_MISSING_MISTRAL_KEY';
      throw err;
    }

    const models = getMistralModels();
    let lastError = null;

    for (const model of models) {
      try {
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: toolConfig.systemPrompt },
              { role: 'user', content: prompt }
            ],
            temperature: toolConfig.temperature,
            max_tokens: toolConfig.maxTokens,
            stream: true
          }),
          signal
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          lastError = new Error(data?.error?.message || `Mistral API returned status ${response.status}`);
          lastError.status = response.status;
          console.warn(`[Mistral Stream ${model}] Status:${response.status} -> ${lastError.message}`);
          continue;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
              const chunk = JSON.parse(jsonStr);
              const content = chunk?.choices?.[0]?.delta?.content || '';
              if (content) {
                fullText += content;
                if (onDelta) onDelta(content);
              }
            } catch {
              // Partial JSON chunk — will be completed in next read
            }
          }
        }

        if (fullText) {
          return { provider: 'mistral', model, text: fullText };
        }
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        lastError = err;
        console.error(`[Mistral Stream Error ${model}]`, err.message);
      }
    }

    throw lastError || new Error('All Mistral API model attempts failed.');
  }

  async generate({ prompt, toolConfig }) {
    const key = (process.env.MISTRAL_API_KEY || '').trim();
    if (!key) {
      const err = new Error('MISTRAL_API_KEY environment variable is not configured on the server.');
      err.status = 500;
      err.code = 'CONFIG_MISSING_MISTRAL_KEY';
      throw err;
    }

    const models = getMistralModels();
    let lastError = null;

    for (const model of models) {
      try {
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: toolConfig.systemPrompt },
              { role: 'user', content: prompt }
            ],
            temperature: toolConfig.temperature,
            max_tokens: toolConfig.maxTokens
          })
        });

        const data = await response.json();

        if (!response.ok) {
          lastError = new Error(data?.error?.message || `Mistral API returned status ${response.status}`);
          lastError.status = response.status;
          console.warn(`[Mistral ${model}] Status:${response.status} -> ${lastError.message}`);
          continue;
        }

        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text) {
          return {
            provider: 'mistral',
            model,
            grounded: false,
            sources: [],
            text,
            totalTokens: data?.usage?.total_tokens ?? null
          };
        }
      } catch (err) {
        lastError = err;
        console.error(`[Mistral Error ${model}]`, err.message);
      }
    }

    throw lastError || new Error('All Mistral API model attempts failed.');
  }
}

export const mistralService = new MistralService();
