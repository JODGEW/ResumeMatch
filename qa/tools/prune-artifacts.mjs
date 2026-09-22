// Prunes run bundles under .qa-artifacts/runs/ that nothing needs any more.
//
//   node qa/tools/prune-artifacts.mjs           dry run: lists what would go, deletes nothing
//   node qa/tools/prune-artifacts.mjs --apply   deletes those bundle directories
//
// Keeps a bundle when any of these holds, recomputed on every run:
//   - an investigations/*/finding.json names it as sourceRunId
//   - it was created after release-check.marker (the latest release check)
//   - it is the newest releaseGrade bundle for its scenario
// Only whole directories under runs/ whose names are bundle ids are ever deleted.
// Entries without a manifest.json, and anything outside runs/, are left alone.
// Refuses to run while .qa-artifacts/qa-command.lock exists, and stops without
// deleting if the marker, a finding.json, or a manifest can't be read.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const artifactRoot = path.join(repositoryRoot, '.qa-artifacts')
const runsRoot = path.join(artifactRoot, 'runs')
const investigationsRoot = path.join(artifactRoot, 'investigations')
const markerPath = path.join(artifactRoot, 'release-check.marker')
const lockPath = path.join(artifactRoot, 'qa-command.lock')
const BUNDLE_ID = /^p1-0[1-6]-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const mb = bytes => `${(bytes / 1048576).toFixed(1)} MB`

function fail(message) {
  console.error(`prune-artifacts: ${message}`)
  console.error('Nothing was deleted.')
  process.exit(1)
}

function directorySize(directory) {
  let total = 0
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    total += entry.isDirectory() ? directorySize(entryPath) : lstatSync(entryPath).size
  }
  return total
}

function realDirectory(directory, label) {
  let stat
  try { stat = lstatSync(directory) } catch (error) { fail(`cannot read ${label} (${directory}): ${error.message}`) }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`${label} is not a real directory: ${directory}`)
  return realpathSync(directory)
}

const args = process.argv.slice(2)
const unknown = args.filter(arg => arg !== '--apply')
if (unknown.length) fail(`unknown argument(s): ${unknown.join(' ')}. The only flag is --apply.`)
const apply = args.includes('--apply')

realDirectory(artifactRoot, '.qa-artifacts')
if (existsSync(lockPath)) {
  let owner = 'owner.json unreadable'
  try { owner = `owner.json: ${readFileSync(path.join(lockPath, 'owner.json'), 'utf8').trim()}` } catch { /* reported as unreadable */ }
  fail(`the QA lock is held (${lockPath} exists; ${owner}). Wait for the QA command to finish, or recover a stale lock as docs/qa-mvp.md describes.`)
}
const realRunsRoot = realDirectory(runsRoot, 'runs/')

let markerTime
try {
  const markerStat = lstatSync(markerPath)
  if (!markerStat.isFile()) throw new Error('not a regular file')
  markerTime = markerStat.mtimeMs
} catch (error) {
  fail(`cannot read release-check.marker (${markerPath}): ${error.message}`)
}

realDirectory(investigationsRoot, 'investigations/')
const referenced = new Set()
let findingCount = 0
for (const entry of readdirSync(investigationsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const findingPath = path.join(investigationsRoot, entry.name, 'finding.json')
  let finding
  try { finding = JSON.parse(readFileSync(findingPath, 'utf8')) } catch (error) { fail(`cannot read or parse ${findingPath}: ${error.message}`) }
  if (typeof finding?.sourceRunId !== 'string' || !BUNDLE_ID.test(finding.sourceRunId)) fail(`${findingPath} has no valid sourceRunId`)
  referenced.add(finding.sourceRunId)
  findingCount++
}

const bundles = []
const leftAlone = []
for (const entry of readdirSync(runsRoot, { withFileTypes: true })) {
  const directory = path.join(runsRoot, entry.name)
  if (!entry.isDirectory() || !BUNDLE_ID.test(entry.name)) {
    leftAlone.push(`${entry.name} (not a bundle directory)`)
    continue
  }
  const manifestPath = path.join(directory, 'manifest.json')
  if (!existsSync(manifestPath)) {
    leftAlone.push(`${entry.name} (no manifest.json)`)
    continue
  }
  let manifest
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) } catch (error) { fail(`cannot read or parse ${manifestPath}: ${error.message}`) }
  if (typeof manifest?.scenarioId !== 'string') fail(`${manifestPath} has no scenarioId`)
  const createdAt = lstatSync(directory).birthtimeMs
  if (!(createdAt > 0)) fail(`this filesystem reports no creation time for ${directory}; cannot tell which bundles are newest`)
  bundles.push({
    id: entry.name,
    directory,
    scenarioId: manifest.scenarioId,
    createdAt,
    releaseGrade: manifest.sourceIdentity?.releaseGrade === true,
  })
}

const newestReleaseGrade = new Map()
for (const bundle of bundles) {
  const current = newestReleaseGrade.get(bundle.scenarioId)
  if (bundle.releaseGrade && (!current || bundle.createdAt > current.createdAt)) newestReleaseGrade.set(bundle.scenarioId, bundle)
}
const newestReleaseGradeIds = new Set([...newestReleaseGrade.values()].map(bundle => bundle.id))

const keep = []
const remove = []
const reasonCounts = { investigation: 0, latestReleaseCheck: 0, newestReleaseGrade: 0 }
for (const bundle of bundles) {
  const reasons = []
  if (referenced.has(bundle.id)) reasons.push('investigation')
  if (bundle.createdAt > markerTime) reasons.push('latestReleaseCheck')
  if (newestReleaseGradeIds.has(bundle.id)) reasons.push('newestReleaseGrade')
  bundle.size = directorySize(bundle.directory)
  for (const reason of reasons) reasonCounts[reason]++
  ;(reasons.length ? keep : remove).push(bundle)
}
remove.sort((a, b) => a.createdAt - b.createdAt)

const sum = list => list.reduce((total, bundle) => total + bundle.size, 0)
const presentIds = new Set(bundles.map(bundle => bundle.id))
const missingReferenced = [...referenced].filter(id => !presentIds.has(id))

for (const bundle of remove) console.log(`${apply ? 'delete' : 'would delete'}  ${bundle.id}  ${bundle.scenarioId}  ${mb(bundle.size)}`)
console.log('')
console.log(`Mode: ${apply ? 'APPLY' : 'dry run (nothing deleted; pass --apply to delete)'}`)
console.log(`Bundles with a manifest: ${bundles.length}`)
console.log(`${apply ? 'To delete' : 'Would delete'}: ${remove.length} bundles, ${mb(sum(remove))}`)
console.log(`Keep: ${keep.length} bundles, ${mb(sum(keep))}`)
console.log(`  investigation reference: ${reasonCounts.investigation} (from ${findingCount} finding.json, ${referenced.size} distinct sourceRunId, ${missingReferenced.length} not present in runs/)`)
console.log(`  latest release check (created after release-check.marker, ${new Date(markerTime).toISOString()}): ${reasonCounts.latestReleaseCheck}`)
console.log(`  newest release-grade per scenario: ${reasonCounts.newestReleaseGrade}`)
for (const [scenarioId, bundle] of [...newestReleaseGrade].sort()) console.log(`    ${scenarioId}  ${bundle.id}  ${new Date(bundle.createdAt).toISOString()}`)
console.log(`  (a bundle kept for more than one reason is counted under each)`)
console.log(`Left alone in runs/: ${leftAlone.length}`)
for (const item of leftAlone) console.log(`  ${item}`)

if (!apply) process.exit(0)

let deleted = 0
let deletedBytes = 0
for (const bundle of remove) {
  if (existsSync(lockPath)) {
    console.error(`prune-artifacts: the QA lock appeared mid-run; stopped after deleting ${deleted} bundles (${mb(deletedBytes)}).`)
    process.exit(1)
  }
  const stat = lstatSync(bundle.directory)
  if (stat.isSymbolicLink() || !stat.isDirectory() || realpathSync(bundle.directory) !== path.join(realRunsRoot, bundle.id)) {
    console.error(`prune-artifacts: ${bundle.directory} is no longer a plain bundle directory; stopped after deleting ${deleted} bundles (${mb(deletedBytes)}).`)
    process.exit(1)
  }
  rmSync(bundle.directory, { recursive: true })
  deleted++
  deletedBytes += bundle.size
}
console.log(`Deleted ${deleted} bundles, ${mb(deletedBytes)}.`)
