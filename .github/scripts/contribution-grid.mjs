// Draws the contribution calendar (the green squares, no snake) as two SVGs,
// light and dark, from GitHub's GraphQL API.
// Usage (in GitHub Actions): node contribution-grid.mjs <outDir>
// Needs GITHUB_TOKEN and GITHUB_USER in the environment.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date weekday contributionLevel } }
      }
    }
  }
}`

const LEVELS = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE']

const THEMES = {
  light: { cells: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'], text: '#59636e' },
  dark: { cells: ['#151b23', '#033a16', '#196c2e', '#2ea043', '#56d364'], text: '#9198a1' },
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CELL = 10
const STEP = 13
const LEFT = 30
const TOP = 20

async function fetchCalendar(login, token) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json))
  return json.data.user.contributionsCollection.contributionCalendar
}

export function render(calendar, theme) {
  const { cells, text } = THEMES[theme]
  const weeks = calendar.weeks
  const width = LEFT + weeks.length * STEP
  const gridBottom = TOP + 7 * STEP
  const height = gridBottom + 24
  const font = `font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif" font-size="10" fill="${text}"`
  const parts = []

  // Month labels where a new month starts (skipped when too close to the previous one).
  let lastLabelX = -Infinity
  let lastMonth = null
  weeks.forEach((week, i) => {
    const month = Number(week.contributionDays[0].date.slice(5, 7)) - 1
    const x = LEFT + i * STEP
    if (month !== lastMonth && x - lastLabelX > 3 * STEP) {
      if (lastMonth !== null || week.contributionDays[0].date.slice(8) <= '07') {
        parts.push(`<text x="${x}" y="${TOP - 7}" ${font}>${MONTHS[month]}</text>`)
        lastLabelX = x
      }
    }
    lastMonth = month
  })

  for (const [weekday, label] of [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']]) {
    parts.push(`<text x="0" y="${TOP + weekday * STEP + 9}" ${font}>${label}</text>`)
  }

  weeks.forEach((week, i) => {
    for (const day of week.contributionDays) {
      const level = Math.max(0, LEVELS.indexOf(day.contributionLevel))
      parts.push(`<rect x="${LEFT + i * STEP}" y="${TOP + day.weekday * STEP}" width="${CELL}" height="${CELL}" rx="2" fill="${cells[level]}"><title>${day.date}</title></rect>`)
    }
  })

  const total = calendar.totalContributions
  parts.push(`<text x="${LEFT}" y="${gridBottom + 14}" ${font}>${total.toLocaleString('en-US')} contribution${total === 1 ? '' : 's'} in the last year</text>`)
  const legendX = width - 5 * STEP - 30
  parts.push(`<text x="${legendX - 28}" y="${gridBottom + 14}" ${font}>Less</text>`)
  cells.forEach((color, i) => parts.push(`<rect x="${legendX + i * STEP}" y="${gridBottom + 5}" width="${CELL}" height="${CELL}" rx="2" fill="${color}"/>`))
  parts.push(`<text x="${legendX + 5 * STEP + 2}" y="${gridBottom + 14}" ${font}>More</text>`)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>\n`
}

async function main() {
  const outDir = process.argv[2] ?? 'dist'
  const calendar = await fetchCalendar(process.env.GITHUB_USER, process.env.GITHUB_TOKEN)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'contributions.svg'), render(calendar, 'light'))
  writeFileSync(join(outDir, 'contributions-dark.svg'), render(calendar, 'dark'))
  console.log(`${calendar.totalContributions} contributions drawn in ${outDir}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
