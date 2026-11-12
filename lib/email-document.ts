/** Only pass HTML already processed by the server's sanitizeEmail policy. */
export function emailDocument(sanitizedHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>html{color-scheme:light}body{margin:0;padding:16px;font:14px/1.5 Arial,Helvetica,sans-serif;color:#183344;background:#fff;overflow-wrap:anywhere}table{max-width:100%}a{color:#0b7299}pre{white-space:pre-wrap}</style></head><body>${sanitizedHtml}</body></html>`;
}
