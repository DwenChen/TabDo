const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const root = path.resolve(__dirname, '..')

/**
 * 为本地交付准备官方内置运行时，使用独立资料目录，成功后回收下载暂存。
 * @returns {Promise<void>} 准备完成的 Promise。
 * @throws {Error} 下载、隔离器或资源准备失败时抛出。
 */
async function prepare() {
  if ((process.env.TABDO_TARGET_PLATFORM || process.platform) !== 'win32') return
  const destination = path.join(root, 'resources/call-ai-runtime/win32-x64')
  if (
    fs.existsSync(path.join(destination, 'node/tabdo-runtime.json')) &&
    fs.existsSync(path.join(destination, 'python/tabdo-runtime.json'))
  )
    return
  if (!process.versions.electron) {
    await new Promise((resolve, reject) => {
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      delete env.ELECTRON_FORCE_IS_PACKAGED
      const child = spawn(require('electron'), [__filename, '--worker'], {
        cwd: root,
        env,
        windowsHide: true,
        stdio: 'inherit'
      })
      child.once('error', reject)
      child.once('close', (code) =>
        code ? reject(new Error(`CallAI runtime preparation exited ${code}`)) : resolve()
      )
    })
    return
  }
  const { app } = require('electron')
  const stages = path.join(root, '.artifacts/call-ai-runtime-staging')
  fs.mkdirSync(stages, { recursive: true })
  const temporary = fs.mkdtempSync(path.join(stages, 'prepare-'))
  app.setAppPath(root)
  app.setPath('userData', path.join(temporary, 'data'))
  require('./source-loader.cjs')
  await app.whenReady()
  const { CallAiRuntime, removeCallAiOwned } = require('../src/main/core/callAiRuntime.ts')
  let prepared = false
  try {
    const runtime = new CallAiRuntime()
    await runtime.update('node')
    await runtime.update('python')
    fs.mkdirSync(destination, { recursive: true })
    for (const kind of ['node', 'python']) {
      if (!fs.existsSync(path.join(destination, kind)))
        fs.renameSync(path.join(runtime.root, 'runtimes', kind), path.join(destination, kind))
    }
    console.log('CallAI portable Node and Python prepared.')
    prepared = true
  } finally {
    await removeCallAiOwned(stages, temporary)
    app.exit(prepared ? 0 : 1)
  }
}
prepare().catch((error) => {
  console.error(error)
  if (process.versions.electron) require('electron').app.exit(1)
  else process.exitCode = 1
})
