import { Router } from 'express';

const router = Router();

router.post('/generate', async (req, res) => {
  try {
    const { prompt, apiKey: clientKey } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        error: 'Prompt is required.'
      });
    }

    const key = (clientKey || process.env.GEMINI_API_KEY || '').trim();

    if (!key) {
      return res.status(400).json({
        error: 'Gemini API key is missing. Add GEMINI_API_KEY to your .env file.'
      });
    }

    const models = [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-1.5-flash'
    ];

    let lastError = null;

    for (const model of models) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [
                  {
                    text:
                      'You are an expert talent acquisition AI assistant. Return only the final answer. Never reveal reasoning.'
                  }
                ]
              },
              contents: [
                {
                  parts: [
                    {
                      text: prompt
                    }
                  ]
                }
              ],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1500
              }
            })
          }
        );

        const data = await response.json();

        if (!response.ok) {
          lastError = new Error(
            data?.error?.message || `Failed with ${model}`
          );

          console.warn(`[${model}] ${lastError.message}`);

          continue;
        }

        const text =
          data?.candidates?.[0]?.content?.parts
            ?.map(part => part.text)
            .join('') || '';

        if (!text) {
          lastError = new Error('Gemini returned an empty response.');
          continue;
        }

        console.log(`Gemini Success (${model})`);

        return res.json({
          success: true,
          model,
          text: text.trim()
        });
      } catch (err) {
        lastError = err;
        console.error(`[${model}]`, err.message);
      }
    }

    return res.status(500).json({
      success: false,
      error: lastError?.message || 'Failed to generate content.'
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;