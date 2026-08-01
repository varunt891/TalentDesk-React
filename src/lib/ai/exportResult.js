// `docx` and `pdfmake` (with embedded fonts) together add well over 1MB to
// the bundle — dynamically imported here so that cost is only ever paid the
// moment someone actually clicks Export, not on every page load of the app.
let pdfMakeReady = null
async function loadPdfMake() {
  if (!pdfMakeReady) {
    pdfMakeReady = Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
      .then(([pdfMakeModule, pdfFontsModule]) => {
        const pdfMake = pdfMakeModule.default
        pdfMake.addVirtualFileSystem(pdfFontsModule.default)
        return pdfMake
      })
  }
  return pdfMakeReady
}

function safeFilename(filenameBase) {
  return (filenameBase || 'ai_result').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'ai_result'
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10)
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Splits a line into { text, bold, italic, code } runs — the one inline-
// markdown tokenizer shared by both exporters, so "supports **bold**, *italic*,
// and `code`" can't drift out of sync between Word and PDF the way heading
// levels just did. Order matters: **bold** is checked before *italic* so a
// bold marker's two asterisks are never mistaken for two separate italics.
function tokenizeInline(text) {
  const parts = (text || '').split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean)
  if (parts.length === 0) return [{ text: '' }]
  return parts.map(part => {
    if (part.startsWith('**') && part.endsWith('**')) return { text: part.slice(2, -2), bold: true }
    if (part.startsWith('`') && part.endsWith('`')) return { text: part.slice(1, -1), code: true }
    if (part.startsWith('*') && part.endsWith('*')) return { text: part.slice(1, -1), italic: true }
    return { text: part }
  })
}

// ============================================================
// Word (.docx) export
// ============================================================

function docxInlineRuns(docx, text) {
  return tokenizeInline(text).map(t => new docx.TextRun({
    text: t.text,
    bold: t.bold,
    italics: t.italic,
    font: t.code ? 'Courier New' : undefined,
  }))
}

function docxTableRow(docx, cells, isHeader) {
  return new docx.TableRow({
    children: cells.map(cellText => new docx.TableCell({
      width: { size: Math.floor(100 / cells.length), type: docx.WidthType.PERCENTAGE },
      shading: isHeader ? { fill: 'E8ECFB' } : undefined,
      children: [new docx.Paragraph({ children: docxInlineRuns(docx, cellText) })],
    })),
  })
}

const DOCX_HEADING_LEVELS = ['HEADING_1', 'HEADING_2', 'HEADING_3', 'HEADING_4']

// Converts an AI result (GitHub-flavored markdown: headings #-####, bullets,
// **bold**/*italic*/`code`, horizontal rules, fenced code blocks, and
// `| a | b |` tables) into Word document body content. Not a full markdown
// parser — covers what the AI Action Framework's prompts actually produce,
// so exported .docx files read the way the on-screen result (MarkdownView)
// looks instead of dumping raw markdown syntax.
function markdownToDocxChildren(docx, text) {
  const lines = (text || '').split('\n')
  const children = []
  let tableBuffer = null
  let codeBuffer = null

  const flushTable = () => {
    if (tableBuffer && tableBuffer.length) {
      const rows = tableBuffer.map((cells, i) => docxTableRow(docx, cells, i === 0))
      children.push(new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE }, rows }))
      children.push(new docx.Paragraph({ text: '' }))
    }
    tableBuffer = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (line.startsWith('```')) {
      if (codeBuffer !== null) {
        for (const codeLine of codeBuffer) {
          children.push(new docx.Paragraph({
            children: [new docx.TextRun({ text: codeLine || ' ', font: 'Courier New', size: 20 })],
            shading: { fill: 'F3F4F8' },
          }))
        }
        codeBuffer = null
      } else {
        flushTable()
        codeBuffer = []
      }
      continue
    }
    if (codeBuffer !== null) { codeBuffer.push(rawLine); continue }

    if (/^\|.*\|$/.test(line)) {
      const cells = line.slice(1, -1).split('|').map(c => c.trim())
      if (cells.every(c => /^:?-{1,}:?$/.test(c))) continue // header separator row
      tableBuffer = tableBuffer || []
      tableBuffer.push(cells)
      continue
    }
    flushTable()

    if (!line) {
      children.push(new docx.Paragraph({ text: '' }))
      continue
    }

    if (line === '---' || line === '***') {
      children.push(new docx.Paragraph({ border: { bottom: { color: 'CCCCCC', space: 4, style: 'single', size: 6 } } }))
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.*)/)
    if (heading) {
      const level = heading[1].length
      children.push(new docx.Paragraph({ heading: docx.HeadingLevel[DOCX_HEADING_LEVELS[level - 1]], children: docxInlineRuns(docx, heading[2]) }))
      continue
    }

    const bullet = line.match(/^[-*]\s+(.*)/)
    if (bullet) { children.push(new docx.Paragraph({ bullet: { level: 0 }, children: docxInlineRuns(docx, bullet[1]) })); continue }

    children.push(new docx.Paragraph({ children: docxInlineRuns(docx, line) }))
  }
  flushTable()
  return children
}

// Exports an AI Center result (markdown text) as a .docx file the user can
// open directly in Word — headings, bullets, bold, and tables all carry
// over instead of landing as raw markdown syntax in a text file.
export async function exportResultToDocx(text, filenameBase = 'ai_result') {
  const docx = await import('docx')
  const doc = new docx.Document({ sections: [{ children: markdownToDocxChildren(docx, text) }] })
  const blob = await docx.Packer.toBlob(doc)
  downloadBlob(blob, `${safeFilename(filenameBase)}_${dateStamp()}.docx`)
}

// ============================================================
// PDF export
// ============================================================

function pdfInlineRuns(text) {
  return tokenizeInline(text).map(t => ({
    text: t.text,
    bold: t.bold || undefined,
    italics: t.italic || undefined,
    style: t.code ? 'code' : undefined,
  }))
}

function pdfTableBody(rows) {
  return rows.map((cells, i) => cells.map(cellText => ({
    text: pdfInlineRuns(cellText),
    style: i === 0 ? 'tableHeader' : undefined,
    fillColor: i === 0 ? '#eef1fb' : (i % 2 === 0 ? '#f7f8fc' : undefined),
  })))
}

const PDF_HEADING_STYLES = ['h1', 'h2', 'h3', 'h4']

// Same markdown coverage as the Word export (headings #-####, bullets,
// **bold**/*italic*/`code`, horizontal rules, fenced code blocks, tables),
// converted into pdfmake's declarative content-node format instead of
// docx's — pdfmake handles line-wrapping and page breaks automatically, so
// this stays purely about structure, not pixel positions.
function markdownToPdfContent(text) {
  const lines = (text || '').split('\n')
  const content = []
  let tableBuffer = null
  let listBuffer = null
  let codeBuffer = null

  const flushList = () => {
    if (listBuffer && listBuffer.length) {
      content.push({ ul: listBuffer.map(item => ({ text: pdfInlineRuns(item) })), margin: [0, 2, 0, 8] })
    }
    listBuffer = null
  }

  const flushTable = () => {
    if (tableBuffer && tableBuffer.length) {
      const widths = tableBuffer[0].map(() => '*')
      content.push({
        table: { headerRows: 1, widths, body: pdfTableBody(tableBuffer) },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === node.table.body.length || i === 1 ? 1 : 0.5),
          vLineWidth: () => 0,
          hLineColor: () => '#d8dce6',
          paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 5, paddingBottom: () => 5,
        },
        margin: [0, 4, 0, 12],
      })
    }
    tableBuffer = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (line.startsWith('```')) {
      if (codeBuffer !== null) {
        content.push({ text: codeBuffer.join('\n'), style: 'code' })
        codeBuffer = null
      } else {
        flushList()
        flushTable()
        codeBuffer = []
      }
      continue
    }
    if (codeBuffer !== null) { codeBuffer.push(rawLine); continue }

    if (/^\|.*\|$/.test(line)) {
      flushList()
      const cells = line.slice(1, -1).split('|').map(c => c.trim())
      if (cells.every(c => /^:?-{1,}:?$/.test(c))) continue // header separator row
      tableBuffer = tableBuffer || []
      tableBuffer.push(cells)
      continue
    }
    flushTable()

    if (!line) { flushList(); continue }

    if (line === '---' || line === '***') {
      flushList()
      content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#d8dce6' }], margin: [0, 6, 0, 10] })
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.*)/)
    if (heading) {
      flushList()
      content.push({ text: heading[2], style: PDF_HEADING_STYLES[heading[1].length - 1] })
      continue
    }

    const bullet = line.match(/^[-*]\s+(.*)/)
    if (bullet) {
      listBuffer = listBuffer || []
      listBuffer.push(bullet[1])
      continue
    }
    flushList()

    content.push({ text: pdfInlineRuns(line), style: 'paragraph' })
  }
  flushList()
  flushTable()
  return content
}

// Exports an AI Center result (markdown text) as a .pdf file — same
// heading/bullet/bold/table coverage as the Word export, generated
// entirely client-side (no server round-trip).
export async function exportResultToPdf(text, filenameBase = 'ai_result') {
  const pdfMake = await loadPdfMake()
  const docDefinition = {
    content: markdownToPdfContent(text),
    styles: {
      h1: { fontSize: 18, bold: true, margin: [0, 2, 0, 10] },
      h2: { fontSize: 14, bold: true, margin: [0, 12, 0, 6] },
      h3: { fontSize: 12, bold: true, margin: [0, 10, 0, 4] },
      h4: { fontSize: 11, bold: true, margin: [0, 8, 0, 4] },
      paragraph: { fontSize: 10.5, margin: [0, 0, 0, 8] },
      tableHeader: { bold: true, fontSize: 10 },
      code: { fontSize: 9, color: '#3a3f52', margin: [0, 2, 0, 10] },
    },
    defaultStyle: { fontSize: 10.5, lineHeight: 1.25 },
    pageMargins: [44, 44, 44, 44],
  }
  pdfMake.createPdf(docDefinition).download(`${safeFilename(filenameBase)}_${dateStamp()}.pdf`)
}
