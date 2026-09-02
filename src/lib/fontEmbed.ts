import w400 from '@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff2?url'
import w500 from '@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-500-normal.woff2?url'
import w600 from '@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-600-normal.woff2?url'
import w700 from '@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff2?url'

/**
 * Plus Jakarta Sans is self-hosted, so the exported image can carry the brand
 * face instead of falling back to a system font. html-to-image would otherwise
 * try to discover fonts by walking every stylesheet in the document — which is
 * both slow and prone to hanging on stylesheets it cannot read. Handing it a
 * ready-made `fontEmbedCSS` skips that discovery entirely.
 *
 * Latin subset only, and only the weights the exported blocks actually use.
 */
const FACES: Array<{ weight: number; url: string }> = [
  { weight: 400, url: w400 },
  { weight: 500, url: w500 },
  { weight: 600, url: w600 },
  { weight: 700, url: w700 },
]

let cached: Promise<string> | null = null

async function toBase64(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load the export font: ${url}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Built once per session; the woff2 files never change while the page lives. */
export function fontEmbedCss(): Promise<string> {
  cached ??= (async () => {
    const faces = await Promise.all(
      FACES.map(async ({ weight, url }) => {
        const base64 = await toBase64(url)
        return [
          '@font-face {',
          "  font-family: 'Plus Jakarta Sans';",
          '  font-style: normal;',
          `  font-weight: ${weight};`,
          '  font-display: block;',
          `  src: url(data:font/woff2;charset=utf-8;base64,${base64}) format('woff2');`,
          '}',
        ].join('\n')
      }),
    )
    return faces.join('\n')
  })()
  return cached
}
