export class OpenRouterService {
  async generateStream({ prompt, toolConfig, onDelta, signal }) {
    const key = (process.env.OPENROUTER_API_KEY || '').trim();
    if (!key) {
      const err = new Error('OPENROUTER_API_KEY environment variable is not configured on the server.');
      err.status = 500;
      err.code = 'CONFIG_MISSING_OPENROUTER_KEY';
      throw err;
    }

    const models = [
      'google/gemini-2.0-flash-lite-preview-02-05:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'deepseek/deepseek-r1:free',
      'qwen/qwen-2.5-72b-instruct:free',
      'mistralai/mistral-7b-instruct:free'
    ];
    let lastError = null;

    for (const model of models) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://talentdesk.app',
            'X-Title': 'TalentDesk AI'
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
          lastError = new Error(data?.error?.message || `OpenRouter API returned status ${response.status}`);
          lastError.status = response.status;
          console.warn(`[OpenRouter Stream ${model}] Status:${response.status} -> ${lastError.message}`);
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
              // Partial JSON chunk — skip, next read will complete it.
            }
          }
        }

        if (fullText) {
          return { provider: 'openrouter', model, text: fullText };
        }
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        lastError = err;
        console.error(`[OpenRouter Stream Error ${model}]`, err.message);
      }
    }

    throw lastError || new Error('All OpenRouter API model attempts failed.');
  }

  async generate({ prompt, toolConfig }) {
    const key = (process.env.OPENROUTER_API_KEY || '').trim();
    if (!key) {
      const err = new Error('OPENROUTER_API_KEY environment variable is not configured on the server.');
      err.status = 500;
      err.code = 'CONFIG_MISSING_OPENROUTER_KEY';
      throw err;
    }

    const models = [
      'google/gemini-2.0-flash-lite-preview-02-05:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'deepseek/deepseek-r1:free',
      'qwen/qwen-2.5-72b-instruct:free',
      'mistralai/mistral-7b-instruct:free'
    ];
    let lastError = null;

    for (const model of models) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://talentdesk.app',
            'X-Title': 'TalentDesk AI'
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
          lastError = new Error(data?.error?.message || `OpenRouter API returned status ${response.status}`);
          lastError.status = response.status;
          console.warn(`[OpenRouter ${model}] Status:${response.status} -> ${lastError.message}`);
          continue;
        }

        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text) {
          return {
            provider: 'openrouter',
            model,
            grounded: false,
            sources: [],
            text,
            totalTokens: data?.usage?.total_tokens ?? null
          };
        }
      } catch (err) {
        lastError = err;
        console.error(`[OpenRouter Error ${model}]`, err.message);
      }
    }

    throw lastError || new Error('All OpenRouter API model attempts failed.');
  }
}

export const openRouterService = new OpenRouterService();
