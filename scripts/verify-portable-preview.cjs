const fs = require('node:fs/promises')
const path = require('node:path')
const { mediaRuntimeFiles } = require('./media-runtime-dependencies.cjs')

/**
 * 收集程序目录的文件；Windows 预览继续排除 macOS 原生资源。
 * @param {string} directory 当前读取的绝对目录。
 * @param {string} prefix 相对应用根目录的前缀。
 * @returns {Promise<string[]>} 目录内的完整程序文件清单。
 */
async function collectFiles(directory, prefix) {
  const files = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name
    if (relative === 'resources/lib/mac') continue
    if (entry.isDirectory())
      files.push(...(await collectFiles(path.join(directory, entry.name), relative + '/')))
    else if (entry.isFile()) files.push(relative)
  }
  return files
}

/**
 * 只读核验已同步预览的完整程序、预加载脚本、原生资源和两个内置插件。
 * @param {string} projectRoot 当前源码和编译输出所在目录。
 * @param {string} previewRoot 已存在的 Windows 免安装预览目录。
 * @returns {Promise<{programFiles: number, builtinFiles: number}>} 成功比对的文件数量。
 * @throws {Error} 编译输出缺失、预览资源过旧、缺失或原生资源未展开时抛出错误。
 */
async function verifyPortableResources(projectRoot, previewRoot) {
  const asar = await import('@electron/asar')
  const archive = path.join(previewRoot, 'resources/app.asar')
  const program = [
    ...(await collectFiles(path.join(projectRoot, 'out'), 'out/')),
    ...(await collectFiles(path.join(projectRoot, 'resources'), 'resources/'))
  ]
  const problems = []
  let builtinFiles = 0
  // 同步操作会在同一路径切换归档，丢弃旧偏移后再读取当前安装内容。
  asar.uncache(archive)
  for (const file of program) {
    try {
      const installed = asar.extractFile(archive, path.normalize(file))
      if (!installed.equals(await fs.readFile(path.join(projectRoot, file))))
        problems.push('Program resource differs: ' + file)
      const mustUnpack = /\.(node|dll)$/i.test(file) || file.startsWith('resources/')
      if (mustUnpack && !asar.statFile(archive, path.normalize(file)).unpacked)
        problems.push('Native resource is not unpacked: ' + file)
      if (mustUnpack && asar.statFile(archive, path.normalize(file)).unpacked) {
        const physical = await fs.readFile(path.join(archive + '.unpacked', file))
        if (!physical.equals(await fs.readFile(path.join(projectRoot, file))))
          problems.push('Physical resource differs: ' + file)
      }
    } catch {
      problems.push('Program resource missing or unreadable: ' + file)
    }
  }
  const mediaDependencies = mediaRuntimeFiles(projectRoot)
  for (const file of mediaDependencies) {
    try {
      const installed = await fs.readFile(path.join(archive + '.unpacked', file.relative))
      if (!installed.equals(await fs.readFile(file.source)))
        problems.push('Media runtime differs: ' + file.relative)
      if (!asar.statFile(archive, path.normalize(file.relative)).unpacked)
        problems.push('Media runtime is not unpacked: ' + file.relative)
    } catch {
      problems.push('Media runtime missing or unreadable: ' + file.relative)
    }
  }
  // 内置插件从物理展开目录加载，不能只验证归档内的旧副本。
  for (const plugin of ['setting', 'system']) {
    const source = path.join(projectRoot, 'internal-plugins', plugin, 'dist')
    for (const file of await collectFiles(source, '')) {
      const label = 'internal-plugins/' + plugin + '/' + file
      try {
        const installed = await fs.readFile(path.join(archive + '.unpacked', label))
        if (!installed.equals(await fs.readFile(path.join(source, file))))
          problems.push('Builtin resource differs: ' + label)
      } catch {
        problems.push('Builtin resource missing or unreadable: ' + label)
      }
      builtinFiles++
    }
  }
  if (problems.length) throw new Error(problems.join('\n'))
  return {
    programFiles: program.length,
    builtinFiles,
    ...(mediaDependencies.length ? { mediaFiles: mediaDependencies.length } : {})
  }
}

module.exports = { verifyPortableResources }

if (require.main === module) {
  const root = path.resolve(__dirname, '..')
  verifyPortableResources(root, path.join(root, '.local/portable-preview')).then(
    (result) => console.log(JSON.stringify({ verified: true, ...result })),
    (error) => {
      console.error(error)
      process.exitCode = 1
    }
  )
}
