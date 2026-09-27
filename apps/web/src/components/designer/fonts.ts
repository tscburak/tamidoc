/** Browser families matching the PDF exporter, including bundled Unicode fonts. */
export function canvasFontFamily(family?: string): string {
  if (family === 'DejaVuSans') return '"DejaVu Sans", sans-serif';
  if (family === 'DejaVuSansMono') return '"DejaVu Sans Mono", monospace';
  if (family === 'DejaVuSerifCondensed') return '"DejaVu Serif Condensed", serif';
  if (family === 'Helvetica') return 'Arial, Helvetica, sans-serif';
  if (family === 'Times-Roman') return '"Times New Roman", Times, serif';
  if (family === 'Courier') return '"Courier New", Courier, monospace';
  return "'Lato', system-ui, sans-serif";
}
