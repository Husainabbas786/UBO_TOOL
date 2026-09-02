import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'

export type BlockName = 'Chart' | 'Paths' | 'Summary' | 'Intermediaries'
export type PageOrientation = 'portrait' | 'landscape'

/** Rendered at 2x so the image stays crisp when scaled into a PDF or printed. */
const PIXEL_RATIO = 2

/** A4 in points, and the margin the block is fitted inside. */
const A4 = { portrait: { w: 595.28, h: 841.89 }, landscape: { w: 841.89, h: 595.28 } }
const PDF_MARGIN = 36

/** Entity name to filename part: non-alphanumerics collapse to one underscore. */
export function sanitiseName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Entity'
}

function today(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** `UBO_ABC_LTD_Chart_2026-09-02.png` */
export function buildFilename(target: string, block: BlockName, extension: 'png' | 'pdf'): string {
  return `UBO_${sanitiseName(target)}_${block}_${today()}.${extension}`
}

/** Controls marked with this attribute are stripped out of the exported image. */
function keepInExport(node: HTMLElement): boolean {
  return !(node instanceof HTMLElement) || node.dataset.exportHide === undefined
}

/**
 * Renders a block to a PNG data URL.
 *
 * While capturing, the block gets an `exporting` class, which switches its
 * horizontal scroll containers to `overflow: visible` — otherwise a chart or
 * table wider than the card would be silently cropped at the card's edge. The
 * capture size is then read back from the expanded element.
 */
async function renderPng(node: HTMLElement): Promise<string> {
  node.classList.add('exporting')
  try {
    // Force a reflow so the expanded width is measurable.
    const width = Math.ceil(Math.max(node.scrollWidth, node.offsetWidth))
    const height = Math.ceil(Math.max(node.scrollHeight, node.offsetHeight))
    return await toPng(node, {
      pixelRatio: PIXEL_RATIO,
      backgroundColor: '#ffffff',
      width,
      height,
      filter: keepInExport,
      style: { margin: '0' },
    })
  } finally {
    node.classList.remove('exporting')
  }
}

function triggerDownload(href: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('Could not read the rendered image.'))
    image.src = dataUrl
  })
}

export async function downloadPng(
  node: HTMLElement,
  target: string,
  block: BlockName,
): Promise<void> {
  triggerDownload(await renderPng(node), buildFilename(target, block, 'png'))
}

/**
 * Places the block on an A4 page, scaled down to fit inside the margins but
 * never scaled up — a small table should not be blown out to fill the page.
 */
export async function downloadPdf(
  node: HTMLElement,
  target: string,
  block: BlockName,
  orientation: PageOrientation,
): Promise<void> {
  const dataUrl = await renderPng(node)
  const raw = await imageSize(dataUrl)

  // Back out the pixel ratio: the layout size in CSS pixels maps 1:1 to points.
  const naturalWidth = raw.width / PIXEL_RATIO
  const naturalHeight = raw.height / PIXEL_RATIO

  const page = A4[orientation]
  const maxWidth = page.w - PDF_MARGIN * 2
  const maxHeight = page.h - PDF_MARGIN * 2
  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1)

  const width = naturalWidth * scale
  const height = naturalHeight * scale

  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' })
  pdf.addImage(
    dataUrl,
    'PNG',
    (page.w - width) / 2,
    PDF_MARGIN,
    width,
    height,
    undefined,
    'FAST',
  )
  pdf.save(buildFilename(target, block, 'pdf'))
}
