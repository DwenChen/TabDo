const path = require('node:path')
const fs = require('node:fs')
const { build } = require('esbuild')
const root = path.resolve(__dirname, '..')

/**
 * 将pi的工具循环和事件流按实际使用导出打为独立轻量载荷，避免打包大量未使用提供商。
 * @returns {Promise<void>} 载荷写入完成的Promise。
 * @throws {Error} 依赖缺失或打包失败时抛出。
 */
async function buildCallAiAgent() {
  const output = path.join(root, 'resources/call-ai-agent.cjs')
  const result = await build({
    stdin: {
      contents:
        'export { Agent } from "@earendil-works/pi-agent-core"; export { createAssistantMessageEventStream } from "@earendil-works/pi-ai";',
      resolveDir: root,
      sourcefile: 'call-ai-agent-entry.mjs'
    },
    outfile: output,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    minify: true,
    legalComments: 'eof',
    treeShaking: true,
    banner: {
      js: '/* TabDo pi agent runtime; MIT licenses are included in call-ai-agent.LICENSE.txt. */'
    },
    metafile: true
  })
  const packages = new Map()
  for (const input of Object.keys(result.metafile.inputs)) {
    if (!input.includes('node_modules')) continue
    let directory = path.dirname(path.resolve(root, input))
    while (directory !== root && !fs.existsSync(path.join(directory, 'package.json')))
      directory = path.dirname(directory)
    if (directory === root) continue
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
    const license = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md'].find((file) =>
      fs.existsSync(path.join(directory, file))
    )
    if (!license && !manifest.name.startsWith('@earendil-works/pi-'))
      throw new Error('Missing bundled dependency license: ' + manifest.name)
    packages.set(
      manifest.name,
      license
        ? fs.readFileSync(path.join(directory, license), 'utf8')
        : fs.readFileSync(path.join(root, 'resources/LICENSE.pi-agent.txt'), 'utf8')
    )
  }
  const notices = [...packages].map(([name, license]) => name + '\n' + license).join('\n\n')
  fs.writeFileSync(path.join(root, 'resources/call-ai-agent.LICENSE.txt'), notices)
  console.log('CallAI agent bundle: ' + fs.statSync(output).size + ' bytes')
}
buildCallAiAgent().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
