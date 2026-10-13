export function createTestPdf(firstContent = 'BT /F1 18 Tf 72 720 Td (ResearchMind first page) Tj ET') {
  const secondContent = 'BT /F1 18 Tf 72 720 Td (Second-page target phrase) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    `<< /Length ${Buffer.byteLength(firstContent)} >>\nstream\n${firstContent}\nendstream`,
    `<< /Length ${Buffer.byteLength(secondContent)} >>\nstream\n${secondContent}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let source = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source))
    source += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(source)
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  source += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(source)
}

export function createLongTestPdf(pageCount = 20) {
  const fontId = 3 + pageCount * 2
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, index) => `${index + 3} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    ...Array.from({ length: pageCount }, (_, index) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${index === 6 || index === pageCount - 1 ? 420 : 792}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${index + pageCount + 3} 0 R >>`),
    ...Array.from({ length: pageCount }, (_, index) => {
      const content = `BT /F1 18 Tf 72 ${index === 6 || index === pageCount - 1 ? 340 : 720} Td (Page ${index + 1} continuous sample) Tj ET`
      return `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
    }),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let source = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source)); source += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(source)
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  source += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  return Buffer.from(source + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)
}
