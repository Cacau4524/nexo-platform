/**
 * Gerador de PDF de texto (A4, Helvetica), sem dependências.
 * Regras: a 1ª linha é o título (negrito, maior); linhas em MAIÚSCULAS são seções (negrito).
 */
export function textToPdf(lines: string[]): Buffer {
  const pageWidth = 595, pageHeight = 842, margin = 56, lineH = 16;
  const maxChars = 88;
  const perPage = Math.floor((pageHeight - margin * 2) / lineH);

  type L = { text: string; style: 'title' | 'head' | 'body' };
  const styled: L[] = [];
  lines.forEach((raw, idx) => {
    const isHead = raw.length > 3 && raw === raw.toUpperCase() && /[A-Z]/.test(raw);
    let line = raw;
    const style: L['style'] = idx === 0 ? 'title' : isHead ? 'head' : 'body';
    while (line.length > maxChars) {
      let cut = line.lastIndexOf(' ', maxChars);
      if (cut <= 0) cut = maxChars;
      styled.push({ text: line.slice(0, cut), style });
      line = line.slice(cut).trim();
    }
    styled.push({ text: line, style });
  });

  const pages: L[][] = [];
  for (let i = 0; i < styled.length; i += perPage) pages.push(styled.slice(i, i + perPage));
  if (!pages.length) pages.push([]);

  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E\u00C0-\u00FF]/g, '?');
  const contents = pages.map(pl => {
    let y = pageHeight - margin;
    let body = '';
    for (const l of pl) {
      const font = l.style === 'body' ? 'F1' : 'F2';
      const size = l.style === 'title' ? 16 : 11;
      body += `BT /${font} ${size} Tf ${margin} ${y} Td (${esc(l.text)}) Tj ET\n`;
      y -= lineH;
    }
    return body;
  });

  const objects: string[] = [];
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
  pages.forEach((_, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(contents[i], 'latin1')} >>\nstream\n${contents[i]}endstream`);
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
