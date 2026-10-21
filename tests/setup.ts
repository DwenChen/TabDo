import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll } from 'vitest'
// Every worker receives a separate profile before importing application modules.
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tabdo-unit-profile-'))
process.env.TABDO_DATA_ROOT = testRoot
process.env.TABDO_LEGACY_USER_DATA_PATH = path.join(testRoot, 'legacy')
afterAll(() => {
  fs.rmSync(testRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
})
