import mammoth from 'mammoth';
import { convert as htmlToText } from 'html-to-text';
import { PDFParse } from 'pdf-parse';

function extensionOf(fileName, mimeType) {
  const match = /\.([a-z0-9]+)$/i.exec(fileName || '');
  if (match) return match[1].toLowerCase();

  if (mimeType) {
    const mime = String(mimeType).toLowerCase();
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('wordprocessingml') || mime.includes('docx')) return 'docx';
    if (mime.includes('msword')) return 'doc';
    if (mime.includes('text/plain')) return 'txt';
    if (mime.includes('text/html')) return 'html';
  }
  return '';
}

// Strips leftover binary/stream noise that occasionally survives extraction on
// malformed or heavily-compressed documents, so it doesn't pollute the text we
// hand to the AI parser. Keeps any-script letters/numbers/punctuation (\p{L}
// etc.) so accented names aren't mangled. Line breaks are preserved (only
// horizontal whitespace within a line is collapsed) so the resume's original
// section/paragraph structure survives for display, instead of flattening
// everything into one run-on paragraph.
function sanitizeExtractedText(text) {
  if (!text) return '';
  return text
    .replace(/[^\t\n\r\x20-\x7E\p{L}\p{N}\p{P}\p{Zs}]/gu, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractText({ buffer, fileName, mimeType }) {
  const ext = extensionOf(fileName, mimeType);

  if (ext === 'pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      // pageJoiner defaults to inserting "-- N of M --" markers between pages,
      // which is noise we don't want feeding into the AI parser.
      const result = await parser.getText({ pageJoiner: '' });
      return sanitizeExtractedText(result.text);
    } finally {
      await parser.destroy();
    }
  }

  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return sanitizeExtractedText(result.value);
  }

  if (ext === 'txt') {
    return sanitizeExtractedText(buffer.toString('utf-8'));
  }

  if (ext === 'html' || ext === 'htm') {
    const text = htmlToText(buffer.toString('utf-8'), { wordwrap: false });
    return sanitizeExtractedText(text);
  }

  if (ext === 'doc') {
    const err = new Error('Legacy .doc files are not supported — please re-save as .docx or PDF and try again.');
    err.status = 400;
    err.code = 'UNSUPPORTED_LEGACY_DOC';
    throw err;
  }

  const err = new Error(`Unsupported file type: .${ext || 'unknown'}`);
  err.status = 400;
  err.code = 'UNSUPPORTED_FILE_TYPE';
  throw err;
}
