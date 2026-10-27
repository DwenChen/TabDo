const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const roots = ['sharp', 'pdfkit', 'ffmpeg-static', 'ffprobe-static']

/**
 * 找到依赖真实目录，兼容包导出限制与 pnpm 链接。
 * @param {string} source 依赖方目录。
 * @param {string} name 包名。
 * @returns {string|null} 实际包目录，缺少可选包时为空。
 */
function resolvePackage(source, name) {
  for (const directory of createRequire(path.join(source, 'package.json')).resolve.paths(
    name + '/package.json'
  ) || []) {
    const candidate = path.join(directory, name)
    if (fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate)
  }
  return null
}
/**
 * 构造媒体新增运行依赖的精确文件清单，不把开发依赖或 pnpm 链接带进预览。
 * @param {string} project 项目根目录。
 * @returns {{source:string,relative:string}[]} 来源与应用内路径。
 * @throws {Error} 必需运行依赖缺失或依赖内链接越界时抛出。
 */
function mediaRuntimeFiles(project) {
  const files = []
  const manifestPath = path.join(project, 'package.json')
  if (!fs.existsSync(manifestPath)) return files
  const rootManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const required = roots.filter((name) => rootManifest.dependencies?.[name])
  /**
   * 按 Node 层级复制一个版本及其依赖，祖先中已有同版本时终止递归。
   * @param {string} source 当前包的实际目录。
   * @param {string} destination 应用内目录。
   * @param {Set<string>} ancestors 当前祖先包。
   * @returns {void} 无返回值。
   */
  function collect(source, destination, ancestors) {
    const next = new Set(ancestors).add(source),
      manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'))
    /**
     * 遍历包内自身文件，依赖目录由版本解析单独处理。
     * @param {string} directory 当前目录。
     * @param {string} prefix 应用内路径。
     * @returns {void} 无返回值。
     */
    function walk(directory, prefix) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (['node_modules', '.git'].includes(entry.name)) continue
        const file = path.join(directory, entry.name),
          relative = prefix + '/' + entry.name
        if (entry.isDirectory()) walk(file, relative)
        else if (entry.isFile()) files.push({ source: file, relative })
        else throw new Error('Unexpected runtime dependency link: ' + file)
      }
    }
    walk(source, destination)
    for (const name of Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies
    })) {
      const dependency = resolvePackage(source, name)
      if (!dependency) {
        if (manifest.optionalDependencies?.[name]) continue
        throw new Error('Missing runtime dependency: ' + name)
      }
      if (!next.has(dependency)) collect(dependency, destination + '/node_modules/' + name, next)
    }
  }
  for (const name of required) {
    const source = resolvePackage(project, name)
    if (!source) throw new Error('Missing media runtime: ' + name)
    collect(source, 'node_modules/' + name, new Set())
  }
  return files
}
module.exports = { mediaRuntimeFiles }
