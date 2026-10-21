import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: {} }))
import { getTabDoBootstrapRoot, getTabDoRoot } from '../../src/main/core/appData/appDataPaths'
const roots: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})
describe('TabDo existing profile compatibility', () => {
  it('uses a new branded root but preserves an existing profile and relocation pointer', () => {
    vi.stubEnv('TABDO_DATA_ROOT', '')
    vi.stubEnv('ZTOOLS_DATA_ROOT', '')
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tabdo-brand-'))
    roots.push(home)
    expect(getTabDoBootstrapRoot({ homeDir: home })).toBe(path.join(home, '.tabdo'))
    const previous = path.join(home, '.ztools')
    fs.mkdirSync(previous)
    const relocated = path.join(home, 'relocated')
    fs.mkdirSync(relocated)
    fs.writeFileSync(
      path.join(previous, '.data-location.json'),
      JSON.stringify({ root: relocated })
    )
    expect(getTabDoBootstrapRoot({ homeDir: home })).toBe(previous)
    expect(getTabDoRoot({ homeDir: home })).toBe(relocated)
    expect(getTabDoRoot({ dataRoot: path.join(home, 'isolated') })).toBe(
      path.join(home, 'isolated')
    )
    fs.mkdirSync(path.join(home, '.tabdo'))
    expect(getTabDoBootstrapRoot({ homeDir: home })).toBe(path.join(home, '.tabdo'))
  })
})
