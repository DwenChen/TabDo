import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const {
  organize,
  workspacePath,
  prepare,
  prepareCommit
} = require('../../scripts/project-maintenance.cjs')
const { resetProfile } = require('../../scripts/reset-portable-preview.cjs')
const { archivePlaywrightArtifacts } = require('../../scripts/run-tests.cjs')
let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tabdo-maintenance-'))
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(root, { recursive: true, force: true })
})

/**
 * 在隔离工作区准备维护索引所需的最小记录与回归集。
 * @returns {void} 无返回值。
 */
function fixture(): void {
  for (const folder of ['docs/history/entries', 'tests/regressions', 'tests/main'])
    fs.mkdirSync(path.join(root, folder), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'docs/history/entries/task.json'),
    JSON.stringify({
      id: 'task',
      date: '2026-10-18',
      summary: 'fixture',
      changes: ['change'],
      checks: ['未执行'],
      tests: ['tests/main/a.test.ts']
    })
  )
  fs.writeFileSync(path.join(root, 'docs/history/bugs.json'), '[]')
  fs.writeFileSync(
    path.join(root, 'tests/regressions/suites.json'),
    JSON.stringify({ fixture: { unit: ['tests/main/a.test.ts'], e2e: [] } })
  )
  fs.writeFileSync(path.join(root, 'tests/main/a.test.ts'), 'test fixture')
}

describe('automatic repository maintenance', () => {
  it('retains screenshots and traces after a later test clears the active output directory', () => {
    const source = path.join(root, 'test-results/playwright/failure')
    fs.mkdirSync(source, { recursive: true })
    fs.writeFileSync(path.join(source, 'trace.zip'), 'trace evidence')
    fs.writeFileSync(path.join(source, 'screenshot.png'), 'image evidence')
    const archived = archivePlaywrightArtifacts(root, path.join(root, '.artifacts/runs/first'))
    expect(() =>
      archivePlaywrightArtifacts(root, path.join(path.dirname(root), 'outside'))
    ).toThrow('Unsafe')
    fs.rmSync(path.join(root, 'test-results'), { recursive: true })
    expect(fs.readFileSync(path.join(root, archived, 'failure/trace.zip'), 'utf8')).toBe(
      'trace evidence'
    )
    expect(fs.readFileSync(path.join(root, archived, 'failure/screenshot.png'), 'utf8')).toBe(
      'image evidence'
    )
  })
  it('requires a current change record before commit and rejects force-staged private artifacts', () => {
    fixture()
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    execFileSync('git', ['add', '--', 'tests/main/a.test.ts'], { cwd: root })
    expect(() => prepareCommit(root)).toThrow('docs/history/entries')
    execFileSync('git', ['add', '--', 'docs/history/entries/task.json'], { cwd: root })
    expect(() => prepareCommit(root)).not.toThrow()
    const tracked = execFileSync('git', ['diff', '--cached', '--name-only'], {
      cwd: root,
      encoding: 'utf8'
    })
    expect(tracked).toContain('docs/generated/PROJECT_INDEX.md')
    fs.mkdirSync(path.join(root, '.local'))
    fs.writeFileSync(path.join(root, '.local/private.json'), 'private profile')
    execFileSync('git', ['add', '--', '.local/private.json'], { cwd: root })
    expect(() => prepareCommit(root)).toThrow('Private preview data')
  })
  it('archives historical root files and relocates the active preview without deleting data', () => {
    fs.mkdirSync(path.join(root, '_portable-preview/data'), { recursive: true })
    fs.writeFileSync(path.join(root, '_portable-preview/data/config'), 'private')
    fs.writeFileSync(path.join(root, '_old-test.log'), 'old failure evidence')
    fs.writeFileSync(path.join(root, '_helper.cjs'), 'old script')
    const moves = organize(root)
    expect(moves).toHaveLength(3)
    expect(fs.readFileSync(path.join(root, '.local/portable-preview/data/config'), 'utf8')).toBe(
      'private'
    )
    expect(fs.readdirSync(root).some((file) => file.startsWith('_'))).toBe(false)
    expect(organize(root)).toEqual([])
  })
  it('refuses a conflicting active preview and paths outside the workspace', () => {
    fs.mkdirSync(path.join(root, '_portable-preview'))
    fs.mkdirSync(path.join(root, '.local/portable-preview'), { recursive: true })
    expect(() => organize(root)).toThrow('already exists')
    expect(() => workspacePath(root, path.dirname(root))).toThrow('Unsafe')
    expect(() => workspacePath(root, root)).toThrow('Unsafe')
  })
  it('regenerates complete test indexes and detects stale or missing test references', () => {
    fixture()
    expect(prepare(root)).toHaveLength(3)
    expect(prepare(root, true)).toEqual([])
    fs.writeFileSync(path.join(root, 'tests/main/new.test.ts'), 'new fixture')
    expect(() => prepare(root, true)).toThrow('stale')
    prepare(root)
    fs.unlinkSync(path.join(root, 'tests/main/a.test.ts'))
    expect(() => prepare(root)).toThrow('Missing recorded test')
  })
})

describe('explicit portable profile reset', () => {
  it('preserves latest program files and fully backs up config and installed plugins', () => {
    const preview = path.join(root, '.local/portable-preview')
    fs.mkdirSync(path.join(preview, 'data/plugins'), { recursive: true })
    fs.mkdirSync(path.join(preview, 'legacy'))
    fs.writeFileSync(path.join(preview, 'TabDo.exe'), 'latest program')
    fs.writeFileSync(path.join(preview, 'data/config'), 'settings')
    fs.writeFileSync(path.join(preview, 'data/plugins/plugin.asar'), 'installed plugin')
    const checkStopped = vi.fn()
    const result = resetProfile(root, preview, checkStopped)
    expect(checkStopped).toHaveBeenCalledOnce()
    expect(result.preservedFiles).toBe(2)
    expect(fs.readdirSync(path.join(preview, 'data'))).toEqual([])
    expect(fs.readFileSync(path.join(result.backup, 'data/plugins/plugin.asar'), 'utf8')).toBe(
      'installed plugin'
    )
    expect(fs.readFileSync(path.join(preview, 'TabDo.exe'), 'utf8')).toBe('latest program')
  })
  it('does not move profile data when the preview is still running', () => {
    const preview = path.join(root, '.local/portable-preview')
    fs.mkdirSync(path.join(preview, 'data'), { recursive: true })
    fs.writeFileSync(path.join(preview, 'TabDo.exe'), 'program')
    fs.writeFileSync(path.join(preview, 'data/config'), 'settings')
    expect(() =>
      resetProfile(root, preview, () => {
        throw new Error('running')
      })
    ).toThrow('running')
    expect(fs.readFileSync(path.join(preview, 'data/config'), 'utf8')).toBe('settings')
  })
})
