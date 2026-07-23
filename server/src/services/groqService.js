export class GroqService {
  async generate({ prompt, toolConfig }) {
    const key = (process.env.GROQ_API_KEY || '').trim();
    if (!key) {
      const err = new Error('GROQ_API_KEY environment variable is not configured on the server.');
      err.status = 500;
      err.code = 'CONFIG_MISSING_GROQ_KEY';
      throw err;
    }

    const models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
    let lastError = null;

    for (const model of models) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
          lastError = new Error(data?.error?.message || `Groq API returned status ${response.status}`);
          lastError.status = response.status;
          console.warn(`[Groq ${model}] Status:${response.status} -> ${lastError.message}`);
          continue;
        }

        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text) {
          return {
            provider: 'groq',
            model,
            grounded: false,
            sources: [],
            text
          };
        }
      } catch (err) {
        lastError = err;
        console.error(`[Groq Error ${model}]`, err.message);
      }
    }

    throw lastError || new Error('All Groq API model attempts failed.');
  }
}

export const groqService = new GroqService();
