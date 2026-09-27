/**
 * @deprecated HTML/Puppeteer rendering was replaced by a pdfkit-based renderer.
 * Kept only as a re-export shim — import from './template-pdf' and './validation'
 * directly.
 */
export { renderTemplatePdf } from './template-pdf';
export { findMissingRequired, isFilled } from './validation';
