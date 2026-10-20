/**
 * 333 draws its own images: Claude writes an SVG, this file cleans it and
 * renders it to PNG (no browser, works in the cloud too).
 *
 * Cleaning keeps only drawing elements, so an SVG can never pull in remote
 * content or scripts. Size is fixed to 1200x1200 or 1600x900.
 */
import { Resvg } from '@resvg/resvg-js'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const FONTS = ['JetBrainsMono-Light.ttf', 'JetBrainsMono-Regular.ttf'].map((f) => join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', f))

export function cleanSvg(svg) {
  let s = String(svg ?? '')
  const start = s.indexOf('<svg')
  const end = s.lastIndexOf('</svg>')
  if (start < 0 || end < 0) throw new Error('no <svg> in drawing')
  s = s.slice(start, end + 6)
  // No scripts, no external references, no foreign HTML, no event handlers.
  s = s
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<image\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '')
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, 'none')
    .replace(/@import[^;]*;/gi, '')
  if (s.length > 60_000) throw new Error('drawing too large')
  return s
}

export function renderPng(svg, width = 1200) {
  const r = new Resvg(cleanSvg(svg), {
    fitTo: { mode: 'width', value: width },
    background: '#050505',
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'JetBrains Mono' },
  })
  return r.render().asPng()
}
