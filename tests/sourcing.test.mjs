import test from 'node:test';
import assert from 'node:assert/strict';
import { Document, Packer, Paragraph } from 'docx';
import pdfmake from 'pdfmake';
import { extractText } from '../server/src/services/documentTextService.js';
import '../extension/sidepanel/profile-utils.js';

test('profile normalization does not invent fields and rejects executable URLs', () => {
  const p = globalThis.TalentDeskProfile.normalize({ first_name: 'Avery', last_name: 'Patel', skills: ['SQL', 'sql', null, 4], sourceUrl: 'javascript:alert(1)', experience: '5 years' });
  assert.equal(p.name, 'Avery Patel');
  assert.equal(p.sourceUrl, '');
  assert.equal(p.email, '');
  assert.deepEqual(p.skills, ['sql']);
  assert.deepEqual(p.experience, []);
});

test('DOCX extraction retains Unicode contact and employment text', async () => {
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Renée Patel'), new Paragraph('renee@example.org'), new Paragraph('Experience: Software Engineer, 2020-2025')] }] }));
  const text = await extractText({ buffer, fileName: 'resume.docx' });
  assert.match(text, /Renée Patel/);
  assert.match(text, /renee@example.org/);
  assert.match(text, /2020-2025/);
});

test('HTML and text documents retain readable resume text', async () => {
  const html = await extractText({ buffer: Buffer.from('<h1>Avery Patel</h1><p>SQL Engineer</p>'), fileName: 'resume.html' });
  assert.match(html, /Avery Patel/);
  assert.match(html, /SQL Engineer/);
  const text = await extractText({ buffer: Buffer.from('Avery Patel\nSQL Engineer'), fileName: 'resume.txt' });
  assert.equal(text, 'Avery Patel\nSQL Engineer');
});

test('unsupported and corrupt documents fail instead of fabricating a profile', async () => {
  await assert.rejects(extractText({ buffer: Buffer.from('bad'), fileName: 'resume.exe' }), /Unsupported/);
  await assert.rejects(extractText({ buffer: Buffer.from('bad'), fileName: 'resume.doc' }));
  await assert.rejects(extractText({ buffer: Buffer.from('bad'), fileName: 'resume.pdf' }));
});

test('PDF extraction keeps readable contacts and recognizes empty scans', async () => {
  pdfmake.addFonts({ Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' } });
  const buffer = await pdfmake.createPdf({ defaultStyle: { font: 'Helvetica' }, content: ['Avery Patel', 'avery@example.org', 'SQL Engineer'] }).getBuffer();
  const text = await extractText({ buffer, fileName: 'resume.pdf' });
  assert.match(text, /avery@example.org/);
  assert.match(text, /SQL Engineer/);
  const blank = await pdfmake.createPdf({ defaultStyle: { font: 'Helvetica' }, content: [' '] }).getBuffer();
  assert.equal(await extractText({ buffer: blank, fileName: 'scan.pdf' }), '');
});

test('scanned PDF uses file vision, preserves text, and fails explicitly on provider errors', async t => {
  for (const name of ['GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'MISTRAL_API_KEY']) {
    const original = process.env[name];
    t.after(() => { if (original === undefined) delete process.env[name]; else process.env[name] = original; });
    delete process.env[name];
  }
  process.env.GEMINI_API_KEY = 'test-only';
  const { geminiService } = await import('../server/src/services/geminiService.js');
  const { prisma } = await import('../server/src/prisma.js');
  const { readScannedResume } = await import('../server/src/services/resumeParsingService.js');
  const originalCreate = prisma.aiUsageEvent.create;
  prisma.aiUsageEvent.create = async () => ({});
  t.after(() => { prisma.aiUsageEvent.create = originalCreate; });
  const generate = t.mock.method(geminiService, 'generate', async request => {
    assert.equal(request.fileInlineData.mimeType, 'application/pdf');
    assert.equal(request.toolConfig.allowGrounding, false);
    return { text: JSON.stringify({ extractedText: 'Avery Patel\navery@example.org' }), provider: 'gemini' };
  });
  assert.equal(await readScannedResume(Buffer.from('scan')), 'Avery Patel\navery@example.org');
  generate.mock.mockImplementation(async () => { throw new Error('Provider unavailable'); });
  await assert.rejects(readScannedResume(Buffer.from('scan')), /Scanned PDF could not be read/);
});
