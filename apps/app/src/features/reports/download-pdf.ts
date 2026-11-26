import type { ReactElement } from 'react'

/*
  Builds a report's PDF in the browser and downloads it; nothing is stored
  anywhere. The PDF library (large) is loaded on the first download only, as
  its own file, and so is the report's document (`load` imports it).
  Needs 'wasm-unsafe-eval' and data: in the CSP (apps/api/src/app-files.ts).
*/
export async function downloadPdf(load: () => Promise<ReactElement>, fileName: string) {
  const [{ pdf }, document] = await Promise.all([import('@react-pdf/renderer'), load()])
  // If the PDF engine ever stalls (it did when the browser blocked its WebAssembly), say so instead of waiting forever
  const blob = await Promise.race([
    pdf(document as Parameters<typeof pdf>[0]).toBlob(),
    new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error('Creating the PDF took too long. Please try again.')), 60_000),
    ),
  ])
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = fileName.replace(/[\\/:*?"<>|]+/g, ' ')
  window.document.body.append(link)
  link.click()
  link.remove()
  // Give the browser a moment to start the download before the file is released
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
