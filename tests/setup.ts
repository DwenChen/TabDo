import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll } from 'vitest'
// Every worker receives a separate profile before importing application modules.
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ztools-unit-profile-'))
process.env.ZTOOLS_DATA_ROOT = testRoot
process.env.ZTOOLS_LEGACY_USER_DATA_PATH = path.join(testRoot, 'legacy')
afterAll(() => {
  fs.rmSync(testRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})
