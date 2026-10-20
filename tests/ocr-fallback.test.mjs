import test from 'node:test';
import assert from 'node:assert/strict';
import pdfmake from 'pdfmake';
import { documentOcrService } from '../server/src/services/documentOcrService.js';
import { geminiService } from '../server/src/services/geminiService.js';
import { readScannedResume } from '../server/src/services/resumeParsingService.js';
import { prisma } from '../server/src/prisma.js';

function configure(t, values = {}) {
  const names = ['GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'MISTRAL_API_KEY', 'GROQ_VISION_MODEL', 'GROQ_VISION_FALLBACK_MODELS', 'OPENROUTER_MODEL', 'OPENROUTER_FALLBACK_MODELS', 'MISTRAL_OCR_MODEL', 'MISTRAL_OCR_FALLBACK_MODELS'];
  for (const name of names) {
    const original = process.env[name];
    t.after(() => { if (original === undefined) delete process.env[name]; else process.env[name] = original; });
    if (values[name] === undefined) delete process.env[name];
    else process.env[name] = values[name];
  }
  const events = [];
  const originalCreate = prisma.aiUsageEvent.create;
  prisma.aiUsageEvent.create = async ({ data }) => { events.push(data); return {}; };
  t.after(() => { prisma.aiUsageEvent.create = originalCreate; });
  return events;
}

const allKeys = { GROQ_API_KEY: 'test', GEMINI_API_KEY: 'test', OPENROUTER_API_KEY: 'test', MISTRAL_API_KEY: 'test' };
const providerNames = ['groq', 'gemini', 'openrouter', 'mistral'];

for (const successfulProvider of providerNames) {
  test(`OCR falls through to ${successfulProvider} and stops after success`, async t => {
    const events = configure(t, allKeys);
    const calls = [];
    const buffer = Buffer.from('synthetic document');
    for (const name of providerNames) {
      const service = name === 'gemini' ? geminiService : documentOcrService;
      t.mock.method(service, name === 'gemini' ? 'generate' : name, async args => {
        calls.push(name);
        assert.ok(args.signal instanceof AbortSignal);
        if (name === 'gemini') assert.equal(args.fileInlineData.data, buffer.toString('base64'));
        else assert.equal(args.buffer, buffer);
        if (name !== successfulProvider) throw new Error('Provider unavailable');
        return { extractedText: 'Avery Patel\nFull history', text: '{"extractedText":"Avery Patel\\nFull history"}', model: 'test-model' };
      });
    }
    assert.equal(await readScannedResume(buffer), 'Avery Patel\nFull history');
    assert.deepEqual(calls, providerNames.slice(0, providerNames.indexOf(successfulProvider) + 1));
    assert.equal(events.at(-1).provider, successfulProvider);
    assert.equal(events.at(-1).success, true);
    assert.equal(events.filter(e => !e.success).length, calls.length - 1);
  });
}

test('missing keys are skipped and malformed or empty OCR never counts as success', async t => {
  configure(t, { GEMINI_API_KEY: 'test', OPENROUTER_API_KEY: 'test', MISTRAL_API_KEY: 'test' });
  const groq = t.mock.method(documentOcrService, 'groq', async () => { throw new Error('Must not run'); });
  t.mock.method(geminiService, 'generate', async () => ({ text: 'not JSON' }));
  t.mock.method(documentOcrService, 'openrouter', async () => ({ extractedText: ' ' }));
  t.mock.method(documentOcrService, 'mistral', async () => { throw new Error('Rate limited'); });
  await assert.rejects(readScannedResume(Buffer.from('scan')), /any configured OCR provider/);
  assert.equal(groq.mock.callCount(), 0);
});

test('no keys produces an actionable error without any network request', async t => {
  configure(t);
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not run'); });
  await assert.rejects(readScannedResume(Buffer.from('scan')), /No OCR provider configured/);
  assert.equal(fetch.mock.callCount(), 0);
});

async function makePdf(pages = 2) {
  pdfmake.addFonts({ Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' } });
  return pdfmake.createPdf({ defaultStyle: { font: 'Helvetica' }, content: Array.from({ length: pages }, (_, index) => ({ text: `Resume page ${index + 1}`, ...(index ? { pageBreak: 'before' } : {}) })) }).getBuffer();
}

test('Groq receives rendered images for every page and retries an unavailable vision model', async t => {
  configure(t, { GROQ_API_KEY: 'test', GROQ_VISION_MODEL: 'unavailable-model' });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    const body = JSON.parse(options.body);
    requests.push(body);
    const content = body.messages[0].content;
    assert.match(content[1].image_url.url, /^data:image\/png;base64,/);
    if (body.model === 'unavailable-model') return Response.json({ error: {} }, { status: 404 });
    return Response.json({ choices: [{ message: { content: JSON.stringify({ extractedText: `Page ${requests.length - 1}` }) }, finish_reason: 'stop' }], usage: { total_tokens: 10 } });
  });
  const result = await documentOcrService.groq({ buffer: await makePdf(), signal: AbortSignal.timeout(10000) });
  assert.equal(result.extractedText, 'Page 1\n\nPage 2');
  assert.equal(result.provider, 'groq');
  assert.equal(result.totalTokens, 20);
  assert.equal(requests.length, 3);
});

test('OpenRouter receives the actual PDF and OCR plugin, and retries malformed output', async t => {
  configure(t, { OPENROUTER_API_KEY: 'test', OPENROUTER_MODEL: 'first-model', OPENROUTER_FALLBACK_MODELS: 'second-model' });
  const buffer = Buffer.from('pdf payload');
  const models = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(options.body);
    models.push(body.model);
    assert.equal(body.plugins[0].pdf.engine, 'mistral-ocr');
    assert.equal(body.messages[0].content[1].file.file_data, `data:application/pdf;base64,${buffer.toString('base64')}`);
    return Response.json({ choices: [{ message: { content: models.length === 1 ? 'invalid' : '{"extractedText":"Complete resume"}' } }] });
  });
  const result = await documentOcrService.openrouter({ buffer, signal: AbortSignal.timeout(10000) });
  assert.equal(result.extractedText, 'Complete resume');
  assert.deepEqual(models, ['first-model', 'second-model']);
});

test('Mistral uses its OCR endpoint and orders all PDF pages', async t => {
  configure(t, { MISTRAL_API_KEY: 'test' });
  const buffer = Buffer.from('pdf payload');
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.mistral.ai/v1/ocr');
    const body = JSON.parse(options.body);
    assert.equal(body.document.document_url, `data:application/pdf;base64,${buffer.toString('base64')}`);
    return Response.json({ pages: [{ index: 1, markdown: 'History' }, { index: 0, markdown: 'Name' }], usage_info: { pages_processed: 2 } });
  });
  const result = await documentOcrService.mistral({ buffer, signal: AbortSignal.timeout(10000) });
  assert.equal(result.extractedText, 'Name\n\nHistory');
});

test('aborted provider budgets cancel requests instead of hanging the fallback chain', async t => {
  configure(t, { GEMINI_API_KEY: 'test', OPENROUTER_API_KEY: 'test' });
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not run'); });
  const signal = AbortSignal.abort(new Error('OCR deadline exceeded'));
  await assert.rejects(geminiService.generate({ prompt: 'OCR', toolConfig: { allowGrounding: false }, signal }), /OCR deadline exceeded/);
  await assert.rejects(documentOcrService.openrouter({ buffer: Buffer.from('scan'), signal }), /OCR deadline exceeded/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('a failed later Groq page never returns a partially transcribed resume', async t => {
  configure(t, { GROQ_API_KEY: 'test' });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 2) return Response.json({ error: {} }, { status: 429 });
    return Response.json({ choices: [{ message: { content: '{"extractedText":"First page only"}' } }] });
  });
  await assert.rejects(documentOcrService.groq({ buffer: await makePdf(), signal: AbortSignal.timeout(10000) }), /HTTP 429/);
  assert.equal(calls, 2);
});

test('Mistral missing pages and OpenRouter truncated responses are rejected', async t => {
  configure(t, { MISTRAL_API_KEY: 'test', OPENROUTER_API_KEY: 'test' });
  t.mock.method(globalThis, 'fetch', async url => url.includes('mistral.ai')
    ? Response.json({ pages: [{ index: 1, markdown: 'Missing first page' }] })
    : Response.json({ choices: [{ finish_reason: 'length', message: { content: '{"extractedText":"Incomplete"}' } }] }));
  await assert.rejects(documentOcrService.mistral({ buffer: Buffer.from('scan') }), /incomplete document pages/);
  await assert.rejects(documentOcrService.openrouter({ buffer: Buffer.from('scan') }), /truncated/);
});

test('Gemini rejects truncated file output even when its JSON is valid', async t => {
  configure(t, { GEMINI_API_KEY: 'test' });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"extractedText":"Incomplete"}' }] } }] }));
  await assert.rejects(geminiService.generate({ prompt: 'OCR', fileInlineData: { data: 'scan', mimeType: 'application/pdf' }, toolConfig: { allowGrounding: false }, signal: AbortSignal.timeout(10000) }), /truncated/);
});
