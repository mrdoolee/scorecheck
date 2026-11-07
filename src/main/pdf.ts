// pdf.js runs in the main process (Node) to read text positions. It is loaded lazily and kept external
// to the bundle so its worker file can be resolved from node_modules.
import { app } from 'electron'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { detectPdf, type PdfDetection } from '../core/pdf/detect'

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const mod = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof import('pdfjs-dist')
      const req = createRequire(path.join(app.getAppPath(), 'package.json'))
      // Packaged builds unpack pdfjs-dist from the asar archive so Node's ESM loader can read the worker.
      const worker = req.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs').replace('app.asar', 'app.asar.unpacked')
      mod.GlobalWorkerOptions.workerSrc = pathToFileURL(worker).href
      return mod
    })()
  }
  return pdfjsPromise
}

export async function detectPdfFile(bytes: Uint8Array): Promise<PdfDetection> {
  return detectPdf(bytes, await loadPdfjs())
}
