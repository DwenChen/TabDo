const path = require('node:path')
const fs = require('node:fs')
const { createRequire } = require('node:module')
const compiler = createRequire(require.resolve('vite'))('esbuild')
const root = path.resolve(__dirname, '..')
const source = path.join(root, 'internal-plugins/system/presentation/electron')

/**
 * 构建按会话加载的上游服务和渲染器桥接，不启动 Electron 或打包应用。
 * @returns 两份桥接均编译完成后的 Promise。
 * @throws {Error} 宿主导入未移除或编译失败时抛出错误，避免产生无法加载的桥接。
 */
async function build() {
  const common = {
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: ['electron', 'ffmpeg-static', 'ffprobe-static', 'uiohook-napi', 'capturekit'],
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.BASE_URL': '"./"' }
  }
  await compiler.build({
    ...common,
    entryPoints: [path.join(source, 'tabdo-backend.ts')],
    outfile: path.join(root, 'internal-plugins/system/public/presentation-backend.cjs'),
    alias: { '@tabdo/presentation-electron': path.join(source, 'tabdo-electron.ts') },
    plugins: [
      {
        name: 'tabdo-windows',
        setup(build) {
          build.onResolve({ filter: /(?:^|\/)windows$/ }, (args) => {
            if (
              path.resolve(path.dirname(args.importer), args.path) === path.join(source, 'windows')
            )
              return { path: path.join(source, 'tabdo-windows.ts') }
          })
        }
      }
    ]
  })
  const preload = fs
    .readFileSync(path.join(source, 'preload.ts'), 'utf8')
    .replace(
      /import\s*\{\s*contextBridge\s*,\s*ipcRenderer\s*\}\s*from\s*["']@tabdo\/presentation-electron["'];?/,
      ''
    )
  // 预加载由宿主注入这两个对象；格式变化不能悄悄留下不存在的运行时模块。
  if (/from\s*["']@tabdo\/presentation-electron["']/.test(preload))
    throw new Error('Presentation preload still imports the host-only Electron adapter')
  const transformed = await compiler.transform(preload, {
    loader: 'ts',
    format: 'cjs',
    target: 'node22'
  })
  fs.writeFileSync(
    path.join(root, 'internal-plugins/system/public/presentation-preload.cjs'),
    'module.exports = function install(ipcRenderer, contextBridge) {\n' + transformed.code + '\n}\n'
  )
}
module.exports = { build }
if (require.main === module)
  build().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
