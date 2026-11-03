// Draws the "GitHub stats" and "Most used languages" cards as SVGs, light and dark,
// from GitHub's GraphQL API, so the README doesn't depend on an outside service.
// Usage (in GitHub Actions): node profile-cards.mjs <outDir>
// Needs GITHUB_TOKEN and GITHUB_USER in the environment.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const USER_QUERY = `query($login: String!) {
  user(login: $login) {
    name
    login
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
    }
    repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, PULL_REQUEST, ISSUE, REPOSITORY]) { totalCount }
    pullRequests(first: 1) { totalCount }
    issues(first: 1) { totalCount }
  }
}`

const REPOS_QUERY = `query($login: String!, $after: String) {
  user(login: $login) {
    repositories(first: 100, after: $after, ownerAffiliations: OWNER, isFork: false) {
      pageInfo { hasNextPage endCursor }
      nodes {
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`

const THEMES = {
  light: { bg: '#ffffff', title: '#3178c6', icon: '#3178c6', text: '#1f2328', track: '#ebedf0' },
  dark: { bg: '#0d1117', title: '#5c9ce6', icon: '#5c9ce6', text: '#e6edf3', track: '#21262d' },
}

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`
const LANGS_COUNT = 6

// 16×16 line icons, drawn with the icon color as stroke.
const ICONS = {
  star: '<path d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.3l-3.8 2 .7-4.3-3.1-3 4.3-.6z" stroke-linejoin="round"/>',
  commit: '<circle cx="8" cy="8" r="3"/><path d="M1 8h4M11 8h4"/>',
  pr: '<circle cx="4" cy="3.5" r="1.8"/><circle cx="4" cy="12.5" r="1.8"/><circle cx="12" cy="12.5" r="1.8"/><path d="M4 5.3v5.4M12 10.7V6a2 2 0 0 0-2-2H7.5"/><path d="M9 2.5L7.5 4 9 5.5"/>',
  issue: '<circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="1" fill="currentColor"/>',
  repo: '<path d="M3 13.5V3a1.5 1.5 0 0 1 1.5-1.5H13v10H4.5A1.5 1.5 0 0 0 3 13a1.5 1.5 0 0 0 1.5 1.5H13"/>',
}

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

async function graphql(query, variables, token) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json))
  return json.data
}

async function fetchProfile(login, token) {
  const { user } = await graphql(USER_QUERY, { login }, token)
  let stars = 0
  const sizes = new Map() // language name → { size, color }
  let after = null
  do {
    const page = (await graphql(REPOS_QUERY, { login, after }, token)).user.repositories
    for (const repo of page.nodes) {
      stars += repo.stargazerCount
      for (const { size, node } of repo.languages.edges) {
        const entry = sizes.get(node.name) ?? { size: 0, color: node.color ?? '#8b949e' }
        entry.size += size
        sizes.set(node.name, entry)
      }
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
  } while (after)

  const total = [...sizes.values()].reduce((sum, l) => sum + l.size, 0)
  const languages = [...sizes.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, LANGS_COUNT)
    .map(([name, { size, color }]) => ({ name, color, share: total ? size / total : 0 }))

  return {
    name: user.name || user.login,
    stats: [
      ['star', 'Total stars', stars],
      ['commit', `Commits (${new Date().getUTCFullYear()})`, user.contributionsCollection.totalCommitContributions + user.contributionsCollection.restrictedContributionsCount],
      ['pr', 'Pull requests', user.pullRequests.totalCount],
      ['issue', 'Issues', user.issues.totalCount],
      ['repo', 'Contributed to (last year)', user.repositoriesContributedTo.totalCount],
    ],
    languages,
  }
}

function card(width, height, theme, title, body) {
  const t = THEMES[theme]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}">` +
    `<title>${escape(title)}</title>` +
    `<rect width="${width}" height="${height}" rx="4.5" fill="${t.bg}"/>` +
    `<text x="25" y="35" font-family="${FONT}" font-size="18" font-weight="600" fill="${t.title}">${escape(title)}</text>` +
    body +
    `</svg>\n`
}

export function renderStats(profile, theme) {
  const t = THEMES[theme]
  const rows = profile.stats.map(([icon, label, value], i) => {
    const y = 62 + i * 25
    return `<g transform="translate(25 ${y - 12})" fill="none" stroke="${t.icon}" stroke-width="1.5" stroke-linecap="round" color="${t.icon}">${ICONS[icon]}</g>` +
      `<text x="50" y="${y}" font-family="${FONT}" font-size="14" font-weight="600" fill="${t.text}">${escape(label)}:</text>` +
      `<text x="300" y="${y}" font-family="${FONT}" font-size="14" font-weight="700" fill="${t.text}">${value.toLocaleString('en-US')}</text>`
  })
  return card(375, 185, theme, `${profile.name}'s GitHub stats`, rows.join(''))
}

export function renderLanguages(profile, theme) {
  const t = THEMES[theme]
  const barX = 25
  const barWidth = 250
  const parts = [`<clipPath id="bar"><rect x="${barX}" y="52" width="${barWidth}" height="8" rx="4"/></clipPath>`]
  parts.push(`<rect x="${barX}" y="52" width="${barWidth}" height="8" rx="4" fill="${t.track}"/>`)
  const shown = profile.languages.reduce((sum, l) => sum + l.share, 0) || 1
  let x = barX
  const segments = profile.languages.map((l) => {
    const w = (l.share / shown) * barWidth
    const rect = `<rect x="${x.toFixed(2)}" y="52" width="${w.toFixed(2)}" height="8" fill="${l.color}"/>`
    x += w
    return rect
  })
  parts.push(`<g clip-path="url(#bar)">${segments.join('')}</g>`)
  profile.languages.forEach((l, i) => {
    const cx = barX + (i % 2) * 135
    const y = 90 + Math.floor(i / 2) * 25
    parts.push(`<circle cx="${cx + 5}" cy="${y - 4.5}" r="5" fill="${l.color}"/>`)
    parts.push(`<text x="${cx + 16}" y="${y}" font-family="${FONT}" font-size="12" fill="${t.text}">${escape(l.name)} ${(l.share * 100).toFixed(1)}%</text>`)
  })
  return card(300, 185, theme, 'Most used languages', parts.join(''))
}

async function main() {
  const outDir = process.argv[2] ?? 'dist'
  const profile = await fetchProfile(process.env.GITHUB_USER, process.env.GITHUB_TOKEN)
  mkdirSync(outDir, { recursive: true })
  for (const theme of ['light', 'dark']) {
    const suffix = theme === 'dark' ? '-dark' : ''
    writeFileSync(join(outDir, `stats${suffix}.svg`), renderStats(profile, theme))
    writeFileSync(join(outDir, `top-langs${suffix}.svg`), renderLanguages(profile, theme))
  }
  console.log(`Cards drawn in ${outDir}: ${profile.languages.map((l) => l.name).join(', ')}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
