import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { EventEmitter } from 'node:events'
import type { WebContents } from 'electron'
import AdmZip from 'adm-zip'
import { CallAiProcesses } from '../../src/main/core/callAiRuntime'
import { readCallAiSkillArchive } from '../../src/main/core/callAiSkillArchive'
const fixture = vi.hoisted(() => ({
  root: '',
  db: new Map<string, unknown>(),
  confirm: 0,
  zip: ''
}))
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    on: vi.fn(),
    getAppPath: () => process.cwd(),
    getPath: (kind: string) => path.join(fixture.root, kind),
    quit: vi.fn()
  },
  dialog: {
    showMessageBox: vi.fn(async () => ({ response: fixture.confirm })),
    showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [fixture.zip] }))
  },
  shell: { openPath: vi.fn() }
}))
vi.mock('../../src/main/api/shared/database', () => ({
  default: {
    dbGet: (key: string) => fixture.db.get(key),
    dbPut: (key: string, value: unknown) => {
      fixture.db.set(key, value)
      return { ok: true }
    }
  }
}))
vi.mock('../../src/main/core/aiProviderService', () => ({ default: { resolveModel: vi.fn() } }))
vi.mock('../../src/main/api/plugin/aiProtocol/adapters', () => ({ createAdapter: vi.fn() }))
import {
  getCallAiSettings,
  saveCallAiSettings,
  openCallAi,
  closeCallAi,
  setCallAiMode,
  cleanCallAiOutputs,
  maintainCallAiRuntime,
  installCallAiMcpPackage,
  configureCallAiMcp,
  installCallAiSkill,
  removeCallAiSkill,
  setCallAiSkillEnabled
} from '../../src/main/core/callAiService'

beforeAll(async () => {
  fixture.root = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-call-ai-service-'))
})
afterAll(async () => {
  await fs.rm(fixture.root, { recursive: true, force: true })
})

describe('call AI settings and output ownership', () => {
  it('accepts an independent output directory and preserves global rules', async () => {
    expect(getCallAiSettings().outputDirectory).toBe(
      path.join(fixture.root, 'documents', 'TabDo', 'Call_AI')
    )
    const outputDirectory = path.join(fixture.root, 'outputs')
    const saved = await saveCallAiSettings({ rules: '中文规则', outputDirectory, mcps: [] })
    expect(saved.outputDirectory).toBe(outputDirectory)
    expect(getCallAiSettings().rules).toBe('中文规则')
    await expect(
      saveCallAiSettings({ rules: '', outputDirectory: path.parse(outputDirectory).root, mcps: [] })
    ).rejects.toThrow('独立')
    await expect(
      saveCallAiSettings({
        rules: '',
        outputDirectory: path.join(fixture.root, 'userData', 'call-ai'),
        mcps: []
      })
    ).rejects.toThrow('独立')
  })

  it('updates the former built-in default and keeps later explicit choices of that path', async () => {
    const previous = getCallAiSettings()
    const oldDefault = path.join(fixture.root, 'documents', 'TabDo', '呼叫AI')
    fixture.db.set('call-ai-settings', { ...previous, outputDirectory: oldDefault })
    expect(getCallAiSettings().outputDirectory).toBe(path.join(path.dirname(oldDefault), 'Call_AI'))
    await saveCallAiSettings({ outputDirectory: oldDefault })
    await saveCallAiSettings({ rules: previous.rules })
    expect(getCallAiSettings().outputDirectory).toBe(oldDefault)
    await saveCallAiSettings({ outputDirectory: previous.outputDirectory })
  })

  it('merges field edits and manages MCP entries without replacing neighboring configuration', async () => {
    const customOutput = getCallAiSettings().outputDirectory
    configureCallAiMcp({
      action: 'add',
      json: '{"mcpServers":{"manual":{"command":"npx","args":["-y","example"]},"local":{"url":"http://127.0.0.1/mcp"}}}'
    })
    await saveCallAiSettings({ rules: '只更新规则' })
    configureCallAiMcp({ action: 'toggle', id: 'manual', enabled: false })
    configureCallAiMcp({
      action: 'edit',
      id: 'manual',
      json: '{"mcpServers":{"manual":{"command":"node","args":["updated.js"]}}}'
    })
    expect(() =>
      configureCallAiMcp({
        action: 'add',
        json: '{"mcpServers":{"manual":{"command":"node"}}}'
      })
    ).toThrow('标识')
    expect(getCallAiSettings()).toMatchObject({
      rules: '只更新规则',
      outputDirectory: customOutput,
      mcps: [
        { id: 'manual', enabled: false, command: 'node', args: ['updated.js'] },
        { id: 'local', url: 'http://127.0.0.1/mcp' }
      ]
    })
    configureCallAiMcp({ action: 'remove', id: 'manual' })
    configureCallAiMcp({ action: 'remove', id: 'local' })
  })

  it('installs one packaged Skill with relative resources and rejects traversal before publishing', async () => {
    fixture.zip = path.join(fixture.root, 'skill.zip')
    const zip = new AdmZip()
    zip.addFile('sample/SKILL.md', Buffer.from('# Skill'))
    zip.addFile('sample/resources/guide.txt', Buffer.from('resource'))
    await fs.writeFile(fixture.zip, zip.toBuffer())
    const [skill] = (await installCallAiSkill()).skills
    const directory = path.join(fixture.root, 'userData', 'call-ai', 'skills', skill.id)
    expect(skill.name).toBe('sample')
    expect(await fs.readFile(path.join(directory, 'resources', 'guide.txt'), 'utf8')).toBe(
      'resource'
    )
    setCallAiSkillEnabled({ id: skill.id, enabled: false })
    expect(getCallAiSettings().skills).toEqual([{ ...skill, enabled: false }])

    zip.getEntry('sample/resources/guide.txt')!.entryName = 'sample/../escape.txt'
    await fs.writeFile(fixture.zip, zip.toBuffer())
    await expect(installCallAiSkill()).rejects.toThrow('不安全')
    expect(await fs.readdir(path.dirname(directory))).toEqual([skill.id])
    await removeCallAiSkill(skill.id)
    expect(getCallAiSettings().skills).toEqual([])
    expect(await fs.readFile(fixture.zip)).toBeTruthy()
  })

  it('follows HTTPS Skill redirects while rejecting a downgrade', async () => {
    const zip = new AdmZip()
    zip.addFile('SKILL.md', Buffer.from('# Skill'))
    const bytes = zip.toBuffer()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.redirect('https://downloads.example.net/files/skill.zip'))
      .mockResolvedValueOnce(new Response(new Uint8Array(bytes)))
      .mockResolvedValueOnce(Response.redirect('http://downloads.example.net/files/skill.zip'))
    vi.stubGlobal('fetch', fetchMock)
    try {
      await expect(readCallAiSkillArchive('https://example.net/skill.zip')).resolves.toEqual({
        data: bytes,
        name: 'skill'
      })
      await expect(readCallAiSkillArchive('https://example.net/skill.zip')).rejects.toThrow('HTTPS')
      expect(fetchMock).toHaveBeenCalledTimes(3)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('registers the npm MCP entry only after its isolated package is installed', async () => {
    const npm = vi
      .spyOn(CallAiProcesses.prototype, 'run')
      .mockImplementation(async (_executable, args) => {
        expect(args).toContain('--ignore-scripts')
        expect(args.at(-1)).toBe('mcp-test@1.0.0')
        const directory = path.join(args[args.indexOf('--prefix') + 1], 'node_modules', 'mcp-test')
        await fs.mkdir(directory, { recursive: true })
        await fs.writeFile(path.join(directory, 'package.json'), '{"bin":"server.js"}')
        await fs.writeFile(path.join(directory, 'server.js'), '')
        return ''
      })
    try {
      const result = await installCallAiMcpPackage('mcp-test@1.0.0')
      const entry = result.mcps.find(({ name }) => name === 'mcp-test')!
      expect(entry.command).toBe('node')
      expect(entry.args).toEqual([
        path.join(
          fixture.root,
          'userData',
          'call-ai',
          'mcp-packages',
          entry.id,
          'node_modules',
          'mcp-test',
          'server.js'
        )
      ])
      expect(npm).toHaveBeenCalledOnce()
      configureCallAiMcp({ action: 'remove', id: entry.id })
    } finally {
      npm.mockRestore()
    }
  })

  it('rejects spoofed built-in context-mode IDs and interpreter injection', async () => {
    const settings = getCallAiSettings()
    await expect(
      saveCallAiSettings({
        ...settings,
        mcps: [{ id: 'tabdo_context_mode_builtin', name: 'spoof', url: 'https://example.com/mcp' }]
      })
    ).rejects.toThrow('标识')
    await expect(
      saveCallAiSettings({
        ...settings,
        mcps: [
          {
            id: 'external',
            name: 'external',
            command: 'node',
            args: [],
            env: { NODE_OPTIONS: '--require exploit.js' }
          }
        ]
      })
    ).rejects.toThrow('注入')
    await expect(installCallAiMcpPackage('https://example.com/package.tgz')).rejects.toThrow('包名')
  })

  it('cancels and confirms cleanup only for registered current-default output directories', async () => {
    const root = getCallAiSettings().outputDirectory,
      owned = path.join(root, '呼叫AI-2026-11-08-abcdef12'),
      unrelated = path.join(root, '用户资料'),
      elsewhere = path.join(fixture.root, 'other', '呼叫AI-2026-11-08-abcdef13')
    for (const directory of [owned, unrelated, elsewhere]) {
      await fs.mkdir(directory, { recursive: true })
      await fs.writeFile(path.join(directory, 'keep.txt'), directory)
    }
    fixture.db.set('call-ai-outputs', [owned, elsewhere])
    fixture.confirm = 0
    expect(await cleanCallAiOutputs()).toBe(0)
    expect(await fs.stat(owned)).toBeTruthy()
    fixture.confirm = 1
    expect(await cleanCallAiOutputs()).toBe(1)
    await expect(fs.stat(owned)).rejects.toThrow()
    expect(await fs.readFile(path.join(unrelated, 'keep.txt'), 'utf8')).toBe(unrelated)
    expect(await fs.readFile(path.join(elsewhere, 'keep.txt'), 'utf8')).toBe(elsewhere)
    expect(fixture.db.get('call-ai-outputs')).toEqual([elsewhere])
  })

  it('blocks cleanup/updates while a conversation is open and destroys only its temporary directory', async () => {
    const emitter = new EventEmitter() as EventEmitter & Partial<WebContents>
    Object.assign(emitter, { id: 44221, isDestroyed: () => false, send: vi.fn() })
    const state = await openCallAi(emitter as WebContents)
    const session = path.join(fixture.root, 'userData', 'call-ai', 'sessions', String(state.id))
    await fs.writeFile(path.join(session, 'temporary.txt'), 'ephemeral')
    await expect(cleanCallAiOutputs()).rejects.toThrow('关闭')
    await expect(maintainCallAiRuntime('clean', 'node')).rejects.toThrow('关闭')
    await Promise.all([closeCallAi(44221), closeCallAi(44221)])
    await expect(fs.stat(session)).rejects.toThrow()
    expect(fixture.db.has('call-ai-history')).toBe(false)
  })

  it('restores only a confirmed permission choice and defaults safely for older profiles', async () => {
    const owner = Object.assign(new EventEmitter(), {
      id: 44222,
      isDestroyed: () => false,
      send: vi.fn()
    }) as unknown as WebContents
    const key = 'call-ai-permission-mode'
    try {
      expect((await openCallAi(owner)).mode).toBe('approve')
      fixture.confirm = 0
      expect(await setCallAiMode(owner.id, 'full')).toBe('approve')
      expect(fixture.db.has(key)).toBe(false)
      fixture.confirm = 1
      expect(await setCallAiMode(owner.id, 'full')).toBe('full')
      await closeCallAi(owner.id)

      expect((await openCallAi(owner)).mode).toBe('full')
      expect(await setCallAiMode(owner.id, 'approve')).toBe('approve')
      await closeCallAi(owner.id)
      expect((await openCallAi(owner)).mode).toBe('approve')
    } finally {
      await closeCallAi(owner.id)
      fixture.db.delete(key)
    }
  })
})
