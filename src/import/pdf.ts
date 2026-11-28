// Text of a PDF's pages with positions, read on the device with pdf.js (loaded only when
// a report is imported). The file never leaves the phone.

import { getDocument, GlobalWorkerOptions, PasswordResponses } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { TextItem } from './delta';

GlobalWorkerOptions.workerSrc = workerUrl;

/** Thrown when the PDF needs a password (`retry` = a password was given and it was wrong). */
export class PdfPasswordError extends Error {
  constructor(public retry: boolean) {
    super(retry ? 'wrong password' : 'password needed');
  }
}

export async function pdfItems(data: ArrayBuffer, password?: string): Promise<TextItem[][]> {
  const task = getDocument({ data: new Uint8Array(data), password, isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
  // pdf.js asks for a password through a callback: stop loading and report it as an error instead.
  let pw: number | null = null;
  task.onPassword = (_update: unknown, reason: number) => {
    pw = reason;
    void task.destroy();
  };
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    if (pw !== null) throw new PdfPasswordError(pw === PasswordResponses.INCORRECT_PASSWORD);
    throw e;
  }
  const pages: TextItem[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    pages.push(
      tc.items.flatMap((i) => ('str' in i && i.str.trim() ? [{ s: i.str, x: i.transform[4] as number, y: i.transform[5] as number }] : [])),
    );
  }
  await doc.destroy();
  return pages;
}
