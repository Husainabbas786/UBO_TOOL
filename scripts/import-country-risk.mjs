/**
 * Turns Compliance's country risk spreadsheet into the JSON the app reads.
 *
 *   npm run import:risk                      # as of today
 *   npm run import:risk -- --as-of 2026-10-01
 *
 * Reads data/country-risk.xlsx (sheet "Country Risk": Country | Score | Rating)
 * and writes src/data/country-risk.json, sorted by country.
 *
 * The spreadsheet is maintained by hand, so it is cleaned on the way in —
 * non-breaking spaces, stray whitespace, a trailing space on "Override " — and
 * anything that cannot be cleaned safely stops the import rather than reaching
 * the app: an unknown rating, or one country listed twice with two different
 * ratings. The Rating column is what the app uses; Score is informational, and
 * a score that disagrees with its rating is reported but not fatal.
 *
 * The Override tier is accepted as-is. The app does not show it by that name:
 * src/data/override-rules.json says what each Override country displays for a
 * national and for a company. A country that reaches Override with no rule
 * there is warned about, so Compliance can be asked; until then it shows the
 * default (company Blacklisted, individual High).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(ROOT, 'data/country-risk.xlsx')
const OUTPUT = resolve(ROOT, 'src/data/country-risk.json')
/** How the Override tier is shown per party type — maintained by hand. */
const OVERRIDE_RULES = resolve(ROOT, 'src/data/override-rules.json')
const SHEET = 'Country Risk'

const RATINGS = ['Low', 'Medium', 'High', 'Override']
/** The score each rating is expected to carry. Only used to warn. */
const EXPECTED_SCORE = { Low: 10, Medium: 20, High: 30, Override: 100 }

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exit(1)
}

/** Trim, NBSP to space, and collapse runs of whitespace. */
function clean(value) {
  return String(value ?? '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function today() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function parseAsOf(argv) {
  const index = argv.indexOf('--as-of')
  if (index === -1) return today()
  const value = argv[index + 1]
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('--as-of needs a date as YYYY-MM-DD.')
  return value
}

const asOf = parseAsOf(process.argv.slice(2))

const workbook = XLSX.readFile(SOURCE)
const sheet = workbook.Sheets[SHEET]
if (!sheet) fail(`Sheet "${SHEET}" not found in ${relative(ROOT, SOURCE)}.`)

const [header, ...rows] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false })
const columns = (header ?? []).map(clean)
const col = (name) => {
  const index = columns.indexOf(name)
  if (index === -1) fail(`Column "${name}" not found. Expected Country | Score | Rating.`)
  return index
}
const COUNTRY = col('Country')
const SCORE = col('Score')
const RATING = col('Rating')

/** country (lower-cased) -> entry, with the spreadsheet row it came from. */
const byName = new Map()
let duplicates = 0
let warnings = 0

rows.forEach((row, index) => {
  const line = index + 2 // 1-based, after the header
  const country = clean(row[COUNTRY])
  if (country === '') return

  const rating = clean(row[RATING])
  if (!RATINGS.includes(rating)) {
    fail(`Row ${line} (${country}): rating "${rating}" is not one of ${RATINGS.join(', ')}.`)
  }

  const score = Number(row[SCORE])
  if (!Number.isFinite(score)) fail(`Row ${line} (${country}): score "${row[SCORE]}" is not a number.`)

  const key = country.toLowerCase()
  const existing = byName.get(key)
  if (existing) {
    if (existing.rating !== rating) {
      fail(
        `${country} is listed twice with different ratings: row ${existing.line} says ${existing.rating}, row ${line} says ${rating}. Fix the spreadsheet and run again.`,
      )
    }
    duplicates += 1
    return
  }

  if (EXPECTED_SCORE[rating] !== score) {
    warnings += 1
    console.warn(
      `WARNING: ${country} (row ${line}) has score ${score} but rating ${rating}; using the rating.`,
    )
  }

  byName.set(key, { country, score, rating, line })
})

const entries = [...byName.values()]
  .map(({ country, score, rating }) => ({ country, score, rating }))
  .sort((a, b) => a.country.localeCompare(b.country, 'en'))

const output = { asOf, sourceFile: relative(ROOT, SOURCE).replace(/\\/g, '/'), entries }

mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`)

const rules = Object.keys(JSON.parse(readFileSync(OVERRIDE_RULES, 'utf8')).rules ?? {})
const ruleKeys = new Set(rules.map((name) => clean(name).toLowerCase()))
for (const entry of entries) {
  if (entry.rating === 'Override' && !ruleKeys.has(entry.country.toLowerCase())) {
    warnings += 1
    console.warn(
      `WARNING: ${entry.country} is Override with no rule in src/data/override-rules.json; it will show company -> Blacklisted, individual -> High. Ask Compliance.`,
    )
  }
}
for (const name of rules) {
  if (!byName.has(clean(name).toLowerCase())) {
    warnings += 1
    console.warn(`WARNING: override-rules.json names "${name}", which is not on the list.`)
  }
}

const counts = Object.fromEntries(
  RATINGS.map((rating) => [rating, entries.filter((entry) => entry.rating === rating).length]),
)
console.log(
  `Wrote ${entries.length} countries to ${relative(ROOT, OUTPUT)} as of ${asOf}` +
    ` (${duplicates} duplicate row${duplicates === 1 ? '' : 's'} merged, ${warnings} warning${warnings === 1 ? '' : 's'}).`,
)
console.log(RATINGS.map((rating) => `${rating}: ${counts[rating]}`).join(', '))
