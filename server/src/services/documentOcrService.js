import { PDFParse } from 'pdf-parse';
import { getConfiguredModels } from './modelConfig.js';
import { getOpenRouterModels } from './openRouterService.js';
import { getToolConfig } from './promptService.js';

export function parseTranscription(text, { allowEmpty = false } = {}) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(raw);
  if (typeof parsed?.extractedText !== 'string' || (!allowEmpty && !parsed.extractedText.trim())) {
    throw new Error('OCR returned no readable text.');
  }
  return parsed.extractedText.trim();
}

async function postJson(url, key, body, signal) {
  signal?.throwIfAborted();
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    // Provider error bodies can echo request content; do not log document text or keys.
    const error = new Error(`OCR provider request failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  if (data.choices?.[0]?.finish_reason === 'length') throw new Error('OCR response was truncated.');
  return data;
}

function requireKey(name) {
  const key = (process.env[name] || '').trim();
  if (!key) throw new Error(`${name} is not configured.`);
  return key;
}

export const documentOcrService = {
  async groq({ buffer, signal }) {
    const key = requireKey('GROQ_API_KEY');
    const models = getConfiguredModels({
      primaryEnv: 'GROQ_VISION_MODEL', fallbackEnv: 'GROQ_VISION_FALLBACK_MODELS',
      defaults: ['qwen/qwen3.8-27b'],
    });
    const parser = new PDFParse({ data: buffer });
    try {
      const info = await parser.getInfo();
      // Fall through to a PDF-native provider instead of silently dropping later pages.
      if (info.total > 10) throw new Error('Groq image OCR supports up to 10 resume pages; trying PDF providers.');
      const pages = [];
      for (let page = 1; page <= info.total; page++) {
        signal?.throwIfAborted();
        const rendered = await parser.getScreenshot({ partial: [page], desiredWidth: 1400, imageBuffer: false });
        const image = rendered.pages[0]?.dataUrl;
        if (!image || Buffer.byteLength(image) > 4 * 1024 * 1024) throw new Error('Page image exceeds the OCR request limit.');
        pages.push(image);
      }
      const config = getToolConfig('resume_ocr');
      let lastError;
      for (const model of models) {
        signal?.throwIfAborted();
        try {
          const texts = [];
          let tokens = 0;
          // One image per request supports multi-page resumes without a per-request image-limit failure.
          for (const image of pages) {
            const data = await postJson('https://api.groq.com/openai/v1/chat/completions', key, {
              model,
              messages: [{ role: 'user', content: [
                { type: 'text', text: config.systemPrompt },
                { type: 'image_url', image_url: { url: image } },
              ] }],
              temperature: 0, max_completion_tokens: config.maxTokens,
            }, signal);
            texts.push(parseTranscription(data.choices?.[0]?.message?.content, { allowEmpty: true }));
            tokens += data.usage?.total_tokens || 0;
          }
          const extractedText = texts.join('\n\n').trim();
          if (!extractedText) throw new Error('No legible text in this scan.');
          return { extractedText, provider: 'groq', model, totalTokens: tokens || null };
        } catch (error) {
          lastError = error;
          if ([401, 403, 429].includes(error.status)) break;
        }
      }
      throw lastError || new Error('No Groq vision model succeeded.');
    } finally { await parser.destroy(); }
  },

  async openrouter({ buffer, signal }) {
    const key = requireKey('OPENROUTER_API_KEY');
    const config = getToolConfig('resume_ocr');
    let lastError;
    for (const model of getOpenRouterModels()) {
      signal?.throwIfAborted();
      try {
        const data = await postJson('https://openrouter.ai/api/v1/chat/completions', key, {
          model,
          messages: [{ role: 'user', content: [
            { type: 'text', text: config.systemPrompt },
            { type: 'file', file: { filename: 'resume.pdf', file_data: `data:application/pdf;base64,${buffer.toString('base64')}` } },
          ] }],
          // OCR supplies readable text even when the configured chat model is text-only.
          plugins: [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }],
          temperature: 0, max_tokens: config.maxTokens,
        }, signal);
        return { extractedText: parseTranscription(data.choices?.[0]?.message?.content), provider: 'openrouter', model, totalTokens: data.usage?.total_tokens ?? null };
      } catch (error) {
        lastError = error;
        if ([401, 402, 403, 429].includes(error.status)) break;
      }
    }
    throw lastError || new Error('No OpenRouter document model succeeded.');
  },

  async mistral({ buffer, signal }) {
    const key = requireKey('MISTRAL_API_KEY');
    const models = getConfiguredModels({
      primaryEnv: 'MISTRAL_OCR_MODEL', fallbackEnv: 'MISTRAL_OCR_FALLBACK_MODELS',
      defaults: ['mistral-ocr-latest'],
    });
    let lastError;
    for (const model of models) {
      signal?.throwIfAborted();
      try {
        const data = await postJson('https://api.mistral.ai/v1/ocr', key, {
          model,
          document: { type: 'document_url', document_url: `data:application/pdf;base64,${buffer.toString('base64')}` },
          include_image_base64: false,
        }, signal);
        if (!Array.isArray(data.pages) || !data.pages.length || data.pages.some(page => typeof page.markdown !== 'string')) {
          throw new Error('Mistral returned an invalid document.');
        }
        const pages = [...data.pages].sort((a, b) => a.index - b.index);
        if (pages.some((page, index) => page.index !== index) || (data.usage_info?.pages_processed && data.usage_info.pages_processed !== pages.length)) {
          throw new Error('Mistral returned incomplete document pages.');
        }
        const extractedText = pages.map(page => page.markdown).join('\n\n').trim();
        if (!extractedText) throw new Error('No legible text in this scan.');
        return { extractedText, provider: 'mistral', model: data.model || model, totalTokens: null };
      } catch (error) {
        lastError = error;
        if ([401, 403, 429].includes(error.status)) break;
      }
    }
    throw lastError || new Error('No Mistral OCR model succeeded.');
  },
};
