const fs = require('node:fs')
const fsp = fs.promises
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const assert = require('node:assert/strict')
const { mediaRuntimeFiles } = require('./media-runtime-dependencies.cjs')
const root = path.resolve(__dirname, '..')
const preview = path.join(root, '.local/portable-preview')
const stage = path.join(root, '.artifacts/backups/preview-sync/update-' + Date.now())

/**
 * 校验所有待移动或递归清理的目标都属于当前工作区。
 * @param {string} target 需要验证的目标路径。
 * @returns {string} 通过校验的绝对路径。
 * @throws {Error} 目标越出工作区时抛出错误。
 */
function workspacePath(target) {
  const resolved = path.resolve(target)
  if (!resolved.toLowerCase().startsWith(root.toLowerCase() + path.sep))
    throw new Error('Path outside workspace: ' + resolved)
  return resolved
}

/**
 * 对已有预览配置与插件文件进行完整内容快照，不修改其内容。
 * @param {string} directory 快照根目录。
 * @param {string} prefix 用于结果键的相对路径前缀。
 * @returns {Promise<Object>} 按路径索引的 SHA-256 内容摘要。
 */
async function snapshot(directory, prefix = '') {
  const hashes = {}
  if (!fs.existsSync(directory)) return hashes
  for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    const relative = prefix + entry.name
    if (entry.isDirectory()) Object.assign(hashes, await snapshot(absolute, relative + '/'))
    else if (entry.isFile()) {
      const digest = crypto.createHash('sha256')
      for await (const chunk of fs.createReadStream(absolute)) digest.update(chunk)
      hashes[relative] = digest.digest('hex')
    }
  }
  return hashes
}

/**
 * 在私有暂存目录生成程序归档，精确保留原生文件的物理展开标记。
 * @param {string} source 已准备好的程序文件目录。
 * @param {string} destination 待生成的 ASAR 文件路径。
 * @param {string[]} unpackedEntries 必须物理展开的应用相对路径。
 * @returns {Promise<void>} 归档和展开资源写入完成后的 Promise。
 * @throws {Error} 读取源文件或生成归档失败时抛出错误。
 */
async function createPreviewArchive(source, destination, unpackedEntries) {
  const asar = await import('@electron/asar')
  // ASAR 使用绝对文件名匹配；显式包含 .artifacts，避免 ** 跳过隐藏目录。
  const prefix = path.resolve(source).replaceAll('\\', '/')
  const mediaDirectories = /^(node_modules\/(sharp|pdfkit|ffmpeg-static|ffprobe-static))\//
  const hasMedia = unpackedEntries.some((entry) => mediaDirectories.test(entry))
  // 按四个完整版本树展开，避免数千个文件组合成超长 glob；同时兼容两种路径分隔符。
  const entries = [...new Set(unpackedEntries)].filter((entry) => !mediaDirectories.test(entry))
  await asar.createPackageWithOptions(source, destination, {
    unpackDir: hasMedia
      ? '{node_modules/{sharp,pdfkit,ffmpeg-static,ffprobe-static},node_modules?{sharp,pdfkit,ffmpeg-static,ffprobe-static}}'
      : undefined,
    unpack:
      entries.length === 0
        ? undefined
        : prefix + '/' + (entries.length === 1 ? entries[0] : '{' + entries.join(',') + '}')
  })
}

/**
 * 按新程序树重建展开清单，丢弃旧编译产物的哈希路径并保留依赖约束。
 * @param {string} source 已完成替换的程序暂存目录。
 * @param {string[]} entries 旧依赖和本次原生资源合并后的清单。
 * @returns {string[]} 去重且确实存在的新归档展开路径。
 * @throws {Error} 依赖目录内必需展开资源缺失时抛出错误。
 */
function resolvePreviewUnpackedEntries(source, entries) {
  return [...new Set(entries)].filter((entry) => {
    // 程序目录整体替换后丢弃旧哈希和旧运行资源；依赖缺失仍须中止。
    if (fs.existsSync(path.join(source, entry))) return true
    if (entry.startsWith('out/') || entry.startsWith('resources/')) return false
    throw new Error('Required unpacked preview resource is missing: ' + entry)
  })
}

/**
 * 在应用退出时仅替换程序资源，并验证已有配置与插件逐文件保持一致。
 * @returns {Promise<void>} 资源替换和完整性检查完成后的 Promise。
 * @throws {Error} 预览正在运行、资源校验失败或替换失败时抛出错误。
 */
async function main() {
  workspacePath(preview)
  workspacePath(stage)
  const executable = path.join(preview, 'TabDo.exe')
  const query =
    "$target = '" +
    executable.replace(/'/g, "''") +
    "'; @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $target }).Count"
  const running = Number(
    execFileSync('powershell.exe', ['-NoProfile', '-Command', query], {
      encoding: 'utf8',
      windowsHide: true
    }).trim()
  )
  if (running) throw new Error('Close the portable preview before replacing its program resources')
  assert(fs.existsSync(path.join(root, 'out/main/index.js')), 'Compiled program is missing')
  assert(
    fs.existsSync(path.join(root, 'internal-plugins/setting/dist/index.html')),
    'Compiled settings are missing'
  )
  assert(
    fs.existsSync(path.join(root, 'internal-plugins/system/dist/index.html')),
    'Compiled tools are missing'
  )
  const before = {
    data: await snapshot(path.join(preview, 'data')),
    legacy: await snapshot(path.join(preview, 'legacy'))
  }
  const asar = await import('@electron/asar')
  const archive = path.join(preview, 'resources/app.asar')
  const unpacked = archive + '.unpacked'
  const appStage = path.join(stage, 'app')
  const resourcesStage = path.join(stage, 'new-resources')
  const newArchive = path.join(resourcesStage, 'app.asar')
  const newUnpacked = newArchive + '.unpacked'
  await fsp.mkdir(resourcesStage, { recursive: true })
  const unpackedEntries = []
  /**
   * 保留既有归档中需要物理展开的原生模块和资源清单。
   * @param {Object} tree ASAR 文件树。
   * @param {string} prefix 当前目录的归档相对路径。
   * @returns {void} 无返回值。
   */
  function collectUnpacked(tree, prefix = '') {
    for (const [name, entry] of Object.entries(tree.files || {})) {
      const relative = prefix + name
      if (entry.files) collectUnpacked(entry, relative + '/')
      else if (entry.unpacked && fs.existsSync(path.join(unpacked, relative)))
        unpackedEntries.push(relative)
    }
  }
  collectUnpacked(asar.getRawHeader(archive).header)
  // 缺少原生资源清单时停止，避免生成无法加载 LMDB 或输入监听模块的预览。
  assert(unpackedEntries.length > 0, 'Portable preview has no unpacked native resources')
  const runtimeResources = []
  const programFiles = []

  /**
   * 收集完整程序目录，避免只替换编译输出而遗漏预加载脚本等运行时资源。
   * @param {string} directory 待收集的源码或编译目录。
   * @param {string} prefix 相对应用根目录的前缀。
   * @param {string[]} files 接收文件清单的数组。
   * @returns {Promise<void>} 文件收集完成后的 Promise。
   */
  async function collectProgramFiles(directory, prefix, files) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name
      // Windows 预览沿用现有平台裁剪，不把其他平台原生资源补回包内。
      if (relative === 'resources/lib/mac') continue
      if (entry.isDirectory())
        await collectProgramFiles(path.join(directory, entry.name), relative + '/', files)
      else if (entry.isFile()) files.push(relative)
    }
  }
  await collectProgramFiles(path.join(root, 'resources'), 'resources/', runtimeResources)
  await collectProgramFiles(path.join(root, 'out'), 'out/', programFiles)
  programFiles.push(...runtimeResources)
  // 与 electron-builder 的 resources/** 展开规则一致，HTML 的相邻脚本和样式也必须物理存在。
  unpackedEntries.push(...runtimeResources)

  /**
   * 将新编译的原生资源加入物理展开清单，供 Electron 直接加载。
   * @param {string} directory 编译输出目录。
   * @param {string} prefix 相对应用目录的前缀。
   * @returns {Promise<void>} 扫描完成后的 Promise。
   */
  async function collectNativeAssets(directory, prefix) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory())
        await collectNativeAssets(path.join(directory, entry.name), prefix + entry.name + '/')
      else if (/\.(node|dll)$/i.test(entry.name)) unpackedEntries.push(prefix + entry.name)
    }
  }
  await collectNativeAssets(path.join(root, 'out'), 'out/')

  /**
   * 提取预览程序文件，忽略旧打包流程已裁剪的其他平台展开资源。
   * @param {Object} tree ASAR 文件树。
   * @param {string} prefix 当前归档目录。
   * @returns {Promise<void>} 文件树提取完成后的 Promise。
   * @throws {Error} 当前 Windows 所需资源缺失或出现无法处理的链接时抛出错误。
   */
  async function extractPreviewTree(tree, prefix = '') {
    for (const [name, entry] of Object.entries(tree.files || {})) {
      const relative = prefix + name
      const destination = workspacePath(path.join(appStage, relative))
      if (entry.files) {
        await fsp.mkdir(destination, { recursive: true })
        await extractPreviewTree(entry, relative + '/')
      } else {
        if (entry.link) throw new Error('Unexpected archive link: ' + relative)
        if (entry.unpacked && !fs.existsSync(path.join(unpacked, relative))) {
          if (
            /^node_modules\/uiohook-napi\/prebuilds\/(darwin|linux)-/.test(relative) ||
            relative.startsWith('resources/lib/mac/')
          )
            continue
          throw new Error('Required Windows preview resource is missing: ' + relative)
        }
        await fsp.mkdir(path.dirname(destination), { recursive: true })
        await fsp.writeFile(destination, asar.extractFile(archive, path.normalize(relative)))
      }
    }
  }

  // 所有程序资源先在独立目录准备，真实数据目录始终不参与移动或复制。
  await extractPreviewTree(asar.getRawHeader(archive).header)
  // 清除历史包遗留的开发入口，不把旧说明和源码测试配置带入新预览。
  for (const file of [
    'Preview.cmd',
    'PreviewPortable.cmd',
    'README_CN.md',
    'playwright.e2e.config.ts',
    'pnpm-workspace.yaml'
  ])
    await fsp.rm(workspacePath(path.join(appStage, file)), { force: true })
  await fsp.rm(workspacePath(path.join(appStage, 'out')), { recursive: true, force: true })
  await fsp.cp(path.join(root, 'out'), path.join(appStage, 'out'), { recursive: true })
  // 运行资源以当前源码为准，避免更名或移除后继续携带旧二进制和脚本。
  await fsp.rm(workspacePath(path.join(appStage, 'resources')), { recursive: true, force: true })
  // 预览资源更新同时携带当前版本元数据，避免界面与后续云端版本号不一致。
  await fsp.copyFile(path.join(root, 'package.json'), path.join(appStage, 'package.json'))
  programFiles.push('package.json')
  for (const file of runtimeResources) {
    await fsp.mkdir(path.dirname(path.join(appStage, file)), { recursive: true })
    await fsp.copyFile(path.join(root, file), path.join(appStage, file))
  }
  // 媒体工作进程新增依赖按精确版本树转成普通文件，不复用成品中不存在的 pnpm 链接。
  const mediaDependencies = mediaRuntimeFiles(root)
  for (const file of mediaDependencies) {
    const destination = workspacePath(path.join(appStage, file.relative))
    await fsp.mkdir(path.dirname(destination), { recursive: true })
    await fsp.copyFile(file.source, destination)
    unpackedEntries.push(file.relative)
  }
  // 先保留旧展开目录，再由 ASAR 写入新程序资源，防止旧副本覆盖本次原生模块。
  await fsp.cp(unpacked, newUnpacked, { recursive: true })
  // 仅清理私有暂存中的旧编译输出，避免无效哈希资源随更新长期累积。
  await fsp.rm(workspacePath(path.join(newUnpacked, 'out')), { recursive: true, force: true })
  await fsp.rm(workspacePath(path.join(newUnpacked, 'resources')), { recursive: true, force: true })
  const currentUnpackedEntries = resolvePreviewUnpackedEntries(appStage, unpackedEntries)
  await createPreviewArchive(appStage, newArchive, currentUnpackedEntries)
  const settingStage = workspacePath(path.join(newUnpacked, 'internal-plugins/setting'))
  await fsp.rm(settingStage, { recursive: true, force: true })
  await fsp.cp(path.join(root, 'internal-plugins/setting/dist'), settingStage, { recursive: true })
  const toolsStage = workspacePath(path.join(newUnpacked, 'internal-plugins/system'))
  await fsp.rm(toolsStage, { recursive: true, force: true })
  await fsp.cp(path.join(root, 'internal-plugins/system/dist'), toolsStage, { recursive: true })
  assert.equal(
    JSON.parse(await fsp.readFile(path.join(toolsStage, 'plugin.json'), 'utf8')).title,
    '工具'
  )
  // 整份程序清单逐文件比对，预加载脚本和运行时资源也属于强制验证范围。
  for (const file of programFiles)
    assert(
      asar
        .extractFile(newArchive, path.normalize(file))
        .equals(await fsp.readFile(path.join(root, file))),
      'Staged program resource differs: ' + file
    )
  for (const entry of currentUnpackedEntries)
    assert.equal(asar.statFile(newArchive, path.normalize(entry)).unpacked, true, entry)

  // 只切换两个程序资源目标；发生失败时恢复旧资源，保留完整可回退副本。
  const backup = path.join(stage, 'previous-resources')
  await fsp.mkdir(backup)
  let movedArchive = false
  let movedUnpacked = false
  try {
    await fsp.rename(workspacePath(archive), workspacePath(path.join(backup, 'app.asar')))
    movedArchive = true
    await fsp.rename(workspacePath(unpacked), workspacePath(path.join(backup, 'app.asar.unpacked')))
    movedUnpacked = true
    await fsp.rename(workspacePath(newArchive), workspacePath(archive))
    await fsp.rename(workspacePath(newUnpacked), workspacePath(unpacked))
    // 同一路径已经切换归档，丢弃 asar 库缓存的旧偏移后再读取新程序元数据。
    asar.uncache(archive)
    for (const file of programFiles)
      assert(
        asar
          .extractFile(archive, path.normalize(file))
          .equals(await fsp.readFile(path.join(root, file))),
        'Installed program resource differs: ' + file
      )
    const after = {
      data: await snapshot(path.join(preview, 'data')),
      legacy: await snapshot(path.join(preview, 'legacy'))
    }
    assert.deepEqual(after, before, 'Existing preview profile or installed plugins changed')
    await fsp.writeFile(
      path.join(stage, 'preservation.json'),
      JSON.stringify({ before, after }, null, 2)
    )
    console.log(
      JSON.stringify({
        updated: preview,
        preservedFiles: Object.values(before).reduce(
          (count, value) => count + Object.keys(value).length,
          0
        ),
        backup,
        verifiedProgramFiles: programFiles.length,
        version: JSON.parse(asar.extractFile(archive, 'package.json').toString()).version
      })
    )
  } catch (error) {
    if (movedArchive) {
      if (fs.existsSync(archive))
        await fsp.rename(workspacePath(archive), workspacePath(path.join(stage, 'failed-app.asar')))
      await fsp.rename(workspacePath(path.join(backup, 'app.asar')), workspacePath(archive))
    }
    if (movedUnpacked) {
      if (fs.existsSync(unpacked))
        await fsp.rename(
          workspacePath(unpacked),
          workspacePath(path.join(stage, 'failed-app.asar.unpacked'))
        )
      await fsp.rename(
        workspacePath(path.join(backup, 'app.asar.unpacked')),
        workspacePath(unpacked)
      )
    }
    throw error
  }
}

module.exports = { createPreviewArchive, resolvePreviewUnpackedEntries }
if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
