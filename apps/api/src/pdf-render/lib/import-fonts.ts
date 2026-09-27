/** Standard PDF families plus bundled families with all style faces. */
export function importedFontFamily(
  family: string | undefined,
): string | undefined {
  if (
    family === 'Times-Roman' ||
    family === 'Helvetica' ||
    family === 'Courier' ||
    family === 'DejaVuSerifCondensed' ||
    family === 'DejaVuSans' ||
    family === 'DejaVuSansMono'
  )
    return family;
  return undefined;
}
