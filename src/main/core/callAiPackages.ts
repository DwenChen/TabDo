import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  assertCallAiNoLinks,
  callAiEnvironment,
  CallAiProcesses,
  isCallAiChild,
  removeCallAiOwned,
  type CallAiRuntime
} from './callAiRuntime'

export const callAiPackageKinds = ['node', 'python'] as const
export type CallAiPackageKind = (typeof callAiPackageKinds)[number]
export interface CallAiPackage {
  id: string
  name: string
  version: string
}

const npmName = /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i

/**
 * 读取额外库的安装元数据，允许旧资料中尚未创建对应文件。
 * @param file 要读取的元数据路径。
 * @returns 文件文本，缺失时为空。
 * @throws 路径包含链接或无法读取时拒绝。
 */
async function readPackageFile(file: string): Promise<string> {
  await assertCallAiNoLinks(file)
  return fs.readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
}

/**
 * 读取 npm 直接安装的库和 pip 已安装的发行包，无需启动解释器。
 * @param root 呼叫AI专用额外库目录。
 * @param kind 要读取的运行时。
 * @returns 按库名排序的已安装库。
 * @throws 安装目录或元数据无法读取时拒绝。
 */
export async function listCallAiPackages(
  root: string,
  kind: CallAiPackageKind
): Promise<CallAiPackage[]> {
  const directory = path.join(root, kind)
  let entries: CallAiPackage[]
  if (kind === 'node') {
    const manifest = JSON.parse(
      (await readPackageFile(path.join(directory, 'package.json'))) || '{}'
    )
    const names = Object.keys(manifest?.dependencies ?? {}).filter((name) => npmName.test(name))
    entries = (
      await Promise.all(
        names.map(async (name) => {
          const file = path.join(directory, 'node_modules', name, 'package.json')
          const installed = await readPackageFile(file)
          if (!installed) return undefined
          const { version } = JSON.parse(installed)
          return { id: name, name, version: typeof version === 'string' ? version : '' }
        })
      )
    ).filter((entry) => entry !== undefined)
  } else {
    await assertCallAiNoLinks(directory)
    const children = await fs
      .readdir(directory, { withFileTypes: true })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return []
        throw error
      })
    entries = await Promise.all(
      children
        .filter((entry) => entry.isDirectory() && entry.name.endsWith('.dist-info'))
        .map(async ({ name: id }) => {
          const metadata = await readPackageFile(path.join(directory, id, 'METADATA'))
          const headers = metadata.split(/\r?\n\r?\n/, 1)[0]
          const fallback = id.slice(0, -'.dist-info'.length)
          const separator = fallback.lastIndexOf('-')
          return {
            id,
            name:
              headers.match(/^Name:[ \t]*(.+)$/m)?.[1].trim() ||
              (separator < 0 ? fallback : fallback.slice(0, separator)),
            version:
              headers.match(/^Version:[ \t]*(.+)$/m)?.[1].trim() ||
              (separator < 0 ? '' : fallback.slice(separator + 1))
          }
        })
    )
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

/**
 * 将 pip RECORD 的文件记录解析为额外库目录中的路径。
 * @param directory Python 额外库目录。
 * @param entry 已登记的 Python 发行包。
 * @returns 归一化的安装文件路径。
 * @throws 缺少安装记录或记录越界时拒绝。
 */
async function pythonPackageFiles(directory: string, entry: CallAiPackage): Promise<string[]> {
  const record = await readPackageFile(path.join(directory, entry.id, 'RECORD'))
  if (!record) throw new Error(`${entry.name} 缺少安装记录，无法按库清理`)
  return record
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => {
      const field = /^(?:"((?:[^"]|"")*)"|([^",]+)),/.exec(line)
      const relative = (field?.[1]?.replaceAll('""', '"') ?? field?.[2] ?? '').replaceAll('\\', '/')
      // pip --target 将安装方案中位于 purelib 上两级的脚本和数据移到目标根目录。
      const targetRelative = relative.replace(/^\.\.\/\.\.\//, '')
      const target = path.resolve(directory, targetRelative)
      if (
        !targetRelative ||
        targetRelative.includes(':') ||
        path.isAbsolute(targetRelative) ||
        targetRelative.split('/').some((segment) => segment === '..') ||
        !isCallAiChild(directory, target)
      )
        throw new Error(`${entry.name} 的安装记录包含无效路径`)
      return target
    })
}

/**
 * 按安装记录清理 Python 文件，保留未选发行包共同声明的文件。
 * @param directory Python 额外库目录。
 * @param inventory 当前发行包清单。
 * @param selected 要清理的发行包标识。
 * @returns 文件及已空目录清理完成的 Promise。
 * @throws 安装记录无效、路径含链接或文件无法清理时拒绝。
 */
export async function removeCallAiPythonPackages(
  directory: string,
  inventory: CallAiPackage[],
  selected: Set<string>
): Promise<void> {
  const keep = new Set<string>()
  const candidates = new Map<string, string>()
  const records = new Set<string>()
  // 删除前汇总全部归属。Windows 的大小写差异不能让共用文件被误删。
  /**
   * 为共用文件计算当前平台的比较键。
   * @param file 归一化的安装路径。
   * @returns 用于判断是否为同一文件的路径键。
   */
  const key = (file: string): string => (process.platform === 'win32' ? file.toLowerCase() : file)
  for (const entry of inventory) {
    const files = await pythonPackageFiles(directory, entry)
    if (selected.has(entry.id)) {
      for (const file of files) candidates.set(key(file), file)
      const record = path.join(directory, entry.id, 'RECORD')
      candidates.set(key(record), record)
      records.add(key(record))
    } else {
      for (const file of files) keep.add(key(file))
    }
  }
  const files = [...candidates].filter(([id]) => !keep.has(id))
  // 先校验全部路径，逐个移除普通文件，避免误递归移除共用目录。
  for (const [, file] of files) {
    await assertCallAiNoLinks(file)
    const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (stat && !stat.isFile()) throw new Error('安装记录指向非普通文件')
  }
  const parents = new Set<string>()
  // 先删除程序文件，最后删除 RECORD，失败时可依据余下记录重试。
  files.sort(([a], [b]) => Number(records.has(a)) - Number(records.has(b)))
  for (const [, file] of files) {
    await fs.rm(file, { force: true })
    for (
      let parent = path.dirname(file);
      isCallAiChild(directory, parent);
      parent = path.dirname(parent)
    )
      parents.add(parent)
  }
  for (const parent of [...parents].sort((a, b) => b.length - a.length)) {
    await fs.rmdir(parent).catch((error: NodeJS.ErrnoException) => {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code || '')) throw error
    })
  }
}

/**
 * 使用内置 npm 在额外库项目中卸载所选直接依赖并更新锁文件。
 * @param runtime 呼叫AI内置运行时。
 * @param directory Node.js 额外库目录。
 * @param names 由已安装列表校验过的 npm 包名。
 * @returns npm 操作完成且临时进程释放后的 Promise。
 * @throws 运行时不可用或 npm 卸载失败时拒绝。
 */
export async function removeCallAiNodePackages(
  runtime: CallAiRuntime,
  directory: string,
  names: string[]
): Promise<void> {
  const executable = runtime.executable('node')
  const root = path.join(runtime.root, 'checks')
  const temporary = path.join(root, `uninstall-${randomUUID()}`)
  await assertCallAiNoLinks(temporary)
  await fs.mkdir(temporary, { recursive: true })
  const processes = new CallAiProcesses()
  try {
    // 仅操作额外库项目，禁用包脚本和联网。
    await processes.run(
      executable,
      [
        path.join(path.dirname(executable), 'node_modules/npm/bin/npm-cli.js'),
        'uninstall',
        '--ignore-scripts',
        '--offline',
        '--no-audit',
        '--no-fund',
        '--prefix',
        directory,
        '--',
        ...names
      ],
      temporary,
      callAiEnvironment(temporary, path.dirname(executable))
    )
  } finally {
    await processes.close()
    await removeCallAiOwned(root, temporary)
  }
}
