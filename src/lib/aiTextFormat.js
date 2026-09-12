export function normalizeAiBreakTags(text, replacement = '\n') {
  return String(text || '')
    .replace(/&lt;br\s*\/?&gt;/gi, replacement)
    .replace(/<br\s*\/?>/gi, replacement)
}

export function normalizeAiPlainText(text) {
  return normalizeAiBreakTags(text, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeAiExportText(text) {
  return normalizeAiBreakTags(text, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
