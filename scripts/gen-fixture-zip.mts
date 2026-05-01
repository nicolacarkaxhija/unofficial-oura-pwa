// One-off generator: writes a synthetic 90-day Oura export ZIP for manual
// testing of the live app. Run: npx tsx scripts/gen-fixture-zip.mts [outDir]
import { createFixtureZipFile } from '../tests/e2e/helpers/fixtureZip'

const outDir = process.argv[2] ?? '.'
const path = await createFixtureZipFile(outDir, { days: 90 })
console.log('written:', path)
