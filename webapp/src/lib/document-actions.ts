import {
  cvMarkdownToBlocks,
  cvMarkdownToInlineText,
  normalizeCvCharacters,
  removeInternalCvSections,
  type CvDocumentBlock,
} from './cv-export-format'

type DocumentBlock = CvDocumentBlock

type DocumentRenderOptions = {
  includeTitle?: boolean
  variant?: 'default' | 'cv'
}

function removeTailoringNotes(markdown: string): string {
  return removeInternalCvSections(markdown)
}

export function markdownToPlainText(markdown: string): string {
  return normalizeCvCharacters(removeTailoringNotes(markdown))
    .replace(/\r\n/g, '\n')
    .replace(/^```[\w-]*\s*/gm, '')
    .replace(/```/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/^\s*[-*+•·▪◦‣]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function createFileName(title: string, extension: string): string {
  const safeTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9åäö]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  return `${safeTitle || 'careerbridge-document'}.${extension}`
}

function downloadBlob(content: BlobPart, mimeType: string, fileName: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function parseMarkdown(markdown: string, options: DocumentRenderOptions = {}): DocumentBlock[] {
  if (options.variant === 'cv') return cvMarkdownToBlocks(markdown)

  return removeTailoringNotes(markdown)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((rawLine): DocumentBlock => {
      const line = rawLine.trim()
      if (!line) return { type: 'blank' }

      const heading = line.match(/^(#{1,3})\s+(.+)$/)
      if (heading) {
        return {
          type: 'heading',
          level: heading[1].length,
          text: cvMarkdownToInlineText(heading[2]),
        }
      }

      const boldHeading = line.match(/^\*\*([^*]+)\*\*$/)
      if (boldHeading) {
        return { type: 'heading', level: 3, text: cvMarkdownToInlineText(boldHeading[1]) }
      }

      const bullet = line.match(/^[-*+•·▪◦‣]\s+(.+)$/)
      if (bullet) return { type: 'bullet', text: cvMarkdownToInlineText(bullet[1]) }

      return { type: 'paragraph', text: cvMarkdownToInlineText(line) }
    })
}

export function renderHtmlDocument(markdown: string, title: string, options: DocumentRenderOptions = {}): string {
  const isCv = options.variant === 'cv'
  const blocks = parseMarkdown(markdown, options)
  const body: string[] = []
  let listOpen = false

  const closeList = () => {
    if (!listOpen) return
    body.push('</ul>')
    listOpen = false
  }

  for (const block of blocks) {
    if (block.type === 'bullet') {
      if (!listOpen) {
        body.push('<ul>')
        listOpen = true
      }
      body.push(`<li>${escapeHtml(block.text)}</li>`)
      continue
    }

    closeList()
    if (block.type === 'blank') {
      body.push('<div class="spacer"></div>')
    } else if (block.type === 'heading') {
      const tag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3'
      body.push(`<${tag}>${escapeHtml(block.text)}</${tag}>`)
    } else {
      body.push(`<p>${escapeHtml(block.text)}</p>`)
    }
  }
  closeList()

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      color: #111827;
      font-family: Aptos, Calibri, Arial, sans-serif;
      font-size: ${isCv ? '10.5pt' : '11pt'};
      line-height: ${isCv ? '1.36' : '1.45'};
      margin: ${isCv ? '34px 44px' : '34px 46px'};
    }
    h1 {
      border-bottom: ${isCv ? '1px solid #cbd5e1' : '2px solid #2563eb'};
      color: #0f172a;
      font-size: ${isCv ? '24pt' : '22pt'};
      margin: 0 0 ${isCv ? '8px' : '14px'};
      padding-bottom: 8px;
    }
    h1, h2, h3 {
      page-break-after: avoid;
    }
    h2 {
      border-top: ${isCv ? '1px solid #e5e7eb' : '0'};
      color: ${isCv ? '#0f172a' : '#1e3a8a'};
      font-size: ${isCv ? '11.5pt' : '14pt'};
      margin: ${isCv ? '14px 0 6px' : '18px 0 7px'};
      padding-top: ${isCv ? '9px' : '0'};
      text-transform: uppercase;
    }
    h3 {
      color: #0f172a;
      font-size: ${isCv ? '10.8pt' : '12pt'};
      margin: ${isCv ? '9px 0 4px' : '13px 0 5px'};
    }
    p {
      margin: 0 0 ${isCv ? '5px' : '7px'};
    }
    ul {
      margin: ${isCv ? '3px 0 7px 19px' : '5px 0 9px 22px'};
      padding: 0;
    }
    li {
      margin: 0 0 ${isCv ? '3px' : '5px'};
      page-break-inside: avoid;
    }
    .spacer {
      height: ${isCv ? '5px' : '8px'};
    }
  </style>
</head>
<body>
${body.join('\n')}
</body>
</html>`
}

function pdfText(text: string): string {
  return text
    // Map punctuation outside Latin-1 to its Windows-1252 byte before writing the PDF stream.
    .replace(/€/g, '\x80')
    .replace(/‘/g, '\x91')
    .replace(/’/g, '\x92')
    .replace(/“/g, '\x93')
    .replace(/”/g, '\x94')
    .replace(/•/g, '\x95')
    .replace(/–/g, '\x96')
    .replace(/—/g, '\x97')
    .replace(/[^\x09\x0a\x0d\x20-\xff]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }

  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

export function createPdf(markdown: string, title: string, options: DocumentRenderOptions = {}): Uint8Array {
  const pageWidth = 595
  const pageHeight = 842
  const isCv = options.variant === 'cv'
  const marginX = isCv ? 44 : 54
  const marginTop = isCv ? 42 : 58
  const marginBottom = isCv ? 42 : 54
  const maxWidth = pageWidth - marginX * 2
  const pages: string[] = []
  let content = ''
  let y = pageHeight - marginTop

  const addPage = () => {
    if (content) pages.push(content)
    content = ''
    y = pageHeight - marginTop
  }

  const ensureSpace = (minimumHeight: number) => {
    if (y < marginBottom + minimumHeight) addPage()
  }

  const addTextLine = (text: string, size: number, font: 'F1' | 'F2', indent = 0) => {
    if (y < marginBottom + size * 1.4) addPage()
    content += `BT /${font} ${size} Tf ${marginX + indent} ${y.toFixed(2)} Td (${pdfText(text)}) Tj ET\n`
    y -= size * 1.45
  }

  const addWrappedText = (text: string, size: number, font: 'F1' | 'F2', indent = 0) => {
    const maxChars = Math.max(24, Math.floor((maxWidth - indent) / (size * 0.48)))
    wrapText(text, maxChars).forEach((line) => addTextLine(line, size, font, indent))
  }

  if (options.includeTitle !== false) {
    addWrappedText(title, 20, 'F2')
    y -= 6
  }

  for (const block of parseMarkdown(markdown, options)) {
    if (block.type === 'blank') {
      y -= isCv ? 5 : 7
      continue
    }

    if (block.type === 'heading') {
      ensureSpace(block.level === 1 ? 62 : 42)
      y -= block.level === 1 ? (isCv ? 4 : 10) : (isCv ? 6 : 7)
      const text = isCv && block.level === 2 ? block.text.toUpperCase() : block.text
      const size = isCv
        ? block.level === 1 ? 21 : block.level === 2 ? 11.5 : 10.8
        : block.level === 1 ? 18 : block.level === 2 ? 14 : 12
      addWrappedText(text, size, 'F2')
      y -= isCv ? 1 : 2
      continue
    }

    if (block.type === 'bullet') {
      addWrappedText(`• ${block.text}`, isCv ? 9.6 : 10.5, 'F1', isCv ? 12 : 14)
      continue
    }

    addWrappedText(block.text, isCv ? 9.8 : 10.5, 'F1')
  }

  addPage()

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    // PDF page references must be wrapped in an array or Acrobat rejects the file.
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ]

  pages.forEach((pageContent, index) => {
    const contentObjectNumber = 6 + index * 2
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`)
    // Length must describe the exact PDF stream byte count.
    objects.push(`<< /Length ${pageContent.length} >>\nstream\n${pageContent}\nendstream`)
  })

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return Uint8Array.from(pdf, (char) => char.charCodeAt(0) & 0xff)
}

export async function copyCleanText(markdown: string) {
  await navigator.clipboard.writeText(markdownToPlainText(markdown))
}

export function downloadCleanText(markdown: string, title: string) {
  downloadBlob(
    markdownToPlainText(markdown),
    'text/plain;charset=utf-8',
    createFileName(title, 'txt'),
  )
}

export function downloadCleanWordDocument(
  markdown: string,
  title: string,
  options: DocumentRenderOptions = {},
) {
  downloadBlob(
    `\uFEFF${renderHtmlDocument(markdown, title, options)}`,
    'application/msword;charset=utf-8',
    createFileName(title, 'doc'),
  )
}

export function downloadCleanPdf(markdown: string, title: string, options: DocumentRenderOptions = {}) {
  const pdf = createPdf(markdown, title, options)
  const pdfBytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer
  downloadBlob(pdfBytes, 'application/pdf', createFileName(title, 'pdf'))
  return true
}

export const exportCleanPdf = downloadCleanPdf
