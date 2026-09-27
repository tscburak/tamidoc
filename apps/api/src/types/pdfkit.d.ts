// Minimal ambient declaration. pdfkit ships no bundled types and @types/pdfkit
// is unmaintained; the library's API is dynamic, so we treat the module as any
// and rely on runtime behavior. API reference: https://pdfkit.org/docs/
declare module 'pdfkit';
