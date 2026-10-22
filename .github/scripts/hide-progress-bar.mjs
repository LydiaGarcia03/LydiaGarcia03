// Removes the progress bar that Platane/snk always draws under the grid
// (its <rect class="u ..."> elements) and trims the empty space it leaves.
// Usage: node hide-progress-bar.mjs dist/a.svg dist/b.svg
import { readFileSync, writeFileSync } from 'node:fs'

// snk's SVG is (grid rows + 5) cells tall; the bar sits in the last rows.
const GRID_ROWS = 7
const TRIMMED_ROWS = 2

for (const file of process.argv.slice(2)) {
  let svg = readFileSync(file, 'utf8')
  svg = svg.replace(/<rect class="u [^>]*\/>/g, '')
  svg = svg.replace(
    /viewBox="(\S+) (\S+) (\S+) (\S+)" width="(\S+)" height="(\S+)"/,
    (_, x, y, w, h, width, height) => {
      const cut = (Number(h) / (GRID_ROWS + 5)) * TRIMMED_ROWS
      return `viewBox="${x} ${y} ${w} ${Number(h) - cut}" width="${width}" height="${Number(height) - cut}"`
    },
  )
  writeFileSync(file, svg)
  console.log(`progress bar removed from ${file}`)
}
