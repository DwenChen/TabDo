const path = require('node:path')
const { spawn } = require('node:child_process')
const root = path.resolve(__dirname, '..')

/** Start renderer, settings and tools source servers without invoking a build or packager.
 * @returns {Promise<Array>} Running source servers.
 */
async function startServers() {
  const { createServer } = await import('vite')
  const renderer = await createServer({
    configFile: path.join(root, 'scripts/preview-renderer.mjs'),
    root: path.join(root, 'src/renderer')
  })
  const setting = await createServer({
    configFile: path.join(root, 'internal-plugins/setting/vite.config.ts'),
    root: path.join(root, 'internal-plugins/setting'),
    server: { host: '127.0.0.1', port: 15177, strictPort: true }
  })
  const tools = await createServer({
    configFile: path.join(root, 'internal-plugins/system/vite.config.mjs'),
    root: path.join(root, 'internal-plugins/system')
  })
  await renderer.listen()
  await setting.listen()
  await tools.listen()
  return [renderer, setting, tools]
}

/** Launch the source preview with a dedicated portable data directory.
 * @returns {Promise<void>} Preview lifetime.
 */
async function main() {
  const servers = await startServers()
  if (process.argv.includes('--servers-only')) return
  const environment = {
    ...process.env,
    ZTOOLS_SOURCE_PREVIEW: '1',
    ZTOOLS_DATA_ROOT: path.join(root, '.local/source-preview-data'),
    ZTOOLS_LEGACY_USER_DATA_PATH: path.join(root, '.local/source-preview-legacy'),
    ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
    ZTOOLS_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
  }
  delete environment.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [path.join(__dirname, 'preview-main.cjs')], {
    cwd: root,
    env: environment,
    stdio: 'inherit',
    windowsHide: true
  })
  child.once('exit', () =>
    console.log('预览窗口已退出；源码服务器仍保留以支持备份后的自动重启。按 Ctrl+C 结束。')
  )
  process.once('SIGINT', async () => {
    child.kill()
    for (const server of servers) await server.close()
    process.exit()
  })
}
module.exports = { startServers }
if (require.main === module)
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
