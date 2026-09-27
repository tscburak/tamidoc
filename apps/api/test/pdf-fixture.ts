/** Small, real PDF fixtures with explicit operators and byte-accurate xrefs. */
export function pdfFixture(
  content: string,
  options: {
    rotate?: number;
    resources?: string;
    objects?: string[];
    fonts?: Partial<Record<'F1' | 'F2' | 'F3' | 'F4', string>>;
    pageBox?: string;
    additionalPages?: { width: number; height: number; content: string }[];
  } = {},
): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] ${options.pageBox ?? ''}
      /Rotate ${options.rotate ?? 0} /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R /F4 8 0 R >>
      /ExtGState << /A << /ca 0.4 /CA 0.4 >> >> ${options.resources ?? ''} >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    options.fonts?.F1 ?? '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    options.fonts?.F2 ?? '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    options.fonts?.F3 ?? '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>',
    options.fonts?.F4 ?? '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    ...(options.objects ?? []),
  ];
  const kids = ['3 0 R'];
  for (const page of options.additionalPages ?? []) {
    const id = objects.length + 1;
    kids.push(`${id} 0 R`);
    objects.push(
      objects[2]
        .replace(
          '/MediaBox [0 0 300 300]',
          `/MediaBox [0 0 ${page.width} ${page.height}]`,
        )
        .replace('/Contents 4 0 R', `/Contents ${id + 1} 0 R`),
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(page.content, 'latin1')} >>\nstream\n${page.content}\nendstream`,
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
