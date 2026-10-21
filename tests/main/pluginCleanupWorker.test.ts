import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { drain } = require('../../resources/plugin-cleanup-worker.cjs') as {
  drain: (root: string) => Promise<void>
}
const temporary: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  for (const root of temporary.splice(0)) await fs.rm(root, { recursive: true, force: true })
})

describe('deferred plugin artifact cleanup', () => {
  it('removes only queued ASAR packages, their sidecars and completed queue files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-cleanup-worker-'))
    temporary.push(root)
    const queue = path.join(root, '.pending-removals')
    await fs.mkdir(queue)
    await fs.writeFile(path.join(root, 'removed.asar'), 'old package')
    await fs.mkdir(path.join(root, 'removed.asar.unpacked'))
    await fs.writeFile(path.join(root, 'installed.asar'), 'keep installed package')
    await fs.writeFile(path.join(queue, 'job.json'), JSON.stringify({ artifact: 'removed.asar' }))

    await drain(root)

    expect(await fs.readdir(root)).toEqual(['installed.asar'])
  })

  it('rejects queue entries outside the plugin directory and leaves development folders intact', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-cleanup-worker-'))
    temporary.push(root)
    const plugins = path.join(root, 'plugins')
    const queue = path.join(plugins, '.pending-removals')
    await fs.mkdir(queue, { recursive: true })
    await fs.writeFile(path.join(root, 'outside.asar'), 'outside package')
    await fs.mkdir(path.join(plugins, 'development'))
    for (const [index, artifact] of [
      '../outside.asar',
      '..\\outside.asar',
      path.join(root, 'outside.asar'),
      'development'
    ].entries()) {
      await fs.writeFile(path.join(queue, `${index}.json`), JSON.stringify({ artifact }))
    }

    await drain(plugins)

    expect(await fs.readFile(path.join(root, 'outside.asar'), 'utf8')).toBe('outside package')
    expect((await fs.stat(path.join(plugins, 'development'))).isDirectory()).toBe(true)
  })
})
