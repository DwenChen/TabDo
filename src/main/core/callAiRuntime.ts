import { app } from 'electron'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import AdmZip from 'adm-zip'
let jobPreparation: Promise<string> | undefined

/**
 * 获取本工具专用 Windows Job 启动器，源码更新后重新编译，失败时拒绝执行命令。
 * @returns 启动器绝对路径，非 Windows 返回空串。
 * @throws 系统编译器缺失或隔离器准备失败时拒绝。
 */
export function prepareCallAiJob(): Promise<string> {
  if (process.platform !== 'win32') return Promise.resolve('')
  return (jobPreparation ||= (async () => {
    const source = path.join(
      app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : app.getAppPath(),
      'resources',
      'call-ai-job.cs'
    )
    const executable = path.join(app.getPath('userData'), 'call-ai', 'bin', 'call-ai-job-v1.exe')
    const sourceInfo = await fs.stat(source),
      targetInfo = await fs.stat(executable).catch(() => null)
    if (targetInfo && targetInfo.mtimeMs >= sourceInfo.mtimeMs) return executable
    await assertCallAiNoLinks(executable)
    await fs.mkdir(path.dirname(executable), { recursive: true })
    const compiler = path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'Microsoft.NET',
      'Framework64',
      'v4.0.30319',
      'csc.exe'
    )
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        compiler,
        ['/nologo', '/target:exe', '/platform:x64', `/out:${executable}`, source],
        { windowsHide: true, stdio: 'pipe' }
      )
      let output = ''
      child.stdout?.on('data', (chunk) => {
        output += chunk.toString()
      })
      child.stderr?.on('data', (chunk) => {
        output += chunk.toString()
      })
      child.once('error', reject)
      child.once('close', (code) =>
        code ? reject(new Error(`无法准备进程隔离器：${output}`)) : resolve()
      )
    })
    return executable
  })().catch((error) => {
    jobPreparation = undefined
    throw error
  }))
}

/**
 * 判断路径是否严格位于给定目录中，拒绝目录本身和跨盘相对路径。
 * @param root 所属目录。
 * @param target 待检查路径。
 * @returns 是否为目录的后代。
 */
export function isCallAiChild(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return (
    Boolean(relative) &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  )
}

/**
 * 校验实际文件路径的每级祖先，防止符号链接把读取或清理导向其他资料。
 * @param target 待操作的绝对路径。
 * @returns 校验完成的 Promise。
 * @throws 路径含符号链接或重解析目录时拒绝。
 */
export async function assertCallAiNoLinks(target: string): Promise<void> {
  let current = path.resolve(target)
  while (true) {
    const stat = await fs.lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (stat?.isSymbolicLink()) throw new Error(`不允许链接路径：${current}`)
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
}

/**
 * 只移除属于本工具的目录，不跟随目录中的任何链接。
 * @param root 已明确归属的根目录。
 * @param target 待清理后代目录。
 * @returns 清理结束的 Promise。
 * @throws 越界或链接时拒绝清理。
 */
export async function removeCallAiOwned(root: string, target: string): Promise<void> {
  if (!isCallAiChild(root, target)) throw new Error('清理目标超出所属目录')
  await assertCallAiNoLinks(target)
  // rm 删除链接条目本身，不遍历链接的目标；祖先已经单独校验。
  await fs.rm(target, { recursive: true, force: true })
}

/**
 * 终止本会话创建的命令树，Windows 不结束用户自行打开的同名进程。
 * @param pid 会话所属根进程。
 * @returns 系统终止请求完成的 Promise。
 */
export async function terminateCallAiTree(pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn(
        path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
        ['/pid', String(pid), '/T', '/F'],
        { windowsHide: true, stdio: 'ignore' }
      )
      killer.once('error', () => resolve())
      killer.once('close', () => resolve())
    })
  } else {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      /* 已结束的进程无需再终止。 */
    }
  }
}

/**
 * 为会话建立最小环境，不继承提供商密钥、用户 Python 或 Node 启动钩子。
 * @param temporary 本会话临时目录。
 * @param nodeDirectory 内置 Node 所在目录。
 * @returns 子进程环境。
 */
export function callAiEnvironment(temporary: string, nodeDirectory = ''): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    TEMP: temporary,
    TMP: temporary,
    TMPDIR: temporary,
    HOME: temporary,
    USERPROFILE: temporary,
    APPDATA: path.join(temporary, 'appdata'),
    LOCALAPPDATA: path.join(temporary, 'localappdata'),
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONNOUSERSITE: '1',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
    PIP_NO_CACHE_DIR: '1',
    npm_config_cache: path.join(temporary, 'npm-cache'),
    npm_config_ignore_scripts: 'true'
  }
  for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'LANG'])
    if (process.env[key]) env[key] = process.env[key]
  env.PATH = [
    nodeDirectory,
    process.platform === 'win32'
      ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')
      : '/usr/bin:/bin'
  ]
    .filter(Boolean)
    .join(path.delimiter)
  return env
}

/** 会话命令的所有者；命令与安装器共用取消和输出上限。 */
export class CallAiProcesses {
  readonly children = new Set<ChildProcess>()
  closed = false
  private closing?: Promise<void>

  /**
   * 执行无 shell 的有界命令，退出时同时结束其衍生进程。
   * @param executable 已核验的程序。
   * @param args 参数数组。
   * @param cwd 当前工作目录。
   * @param env 最小进程环境。
   * @param signal 任务取消信号。
   * @param timeoutSeconds 此命令的最长执行时间，默认 120 秒。
   * @returns 有界标准输出及错误输出。
   * @throws 启动、超时、输出超限、取消或非零退出时拒绝。
   */
  async run(
    executable: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    signal?: AbortSignal,
    timeoutSeconds = 120
  ): Promise<string> {
    const job = await prepareCallAiJob()
    if (this.closed || signal?.aborted) throw new Error('会话已停止')
    return new Promise<string>((resolve, reject) => {
      const child = spawn(
        job || executable,
        job ? [String(process.pid), executable, ...args] : args,
        {
          cwd,
          env,
          shell: false,
          windowsHide: true,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe']
        }
      )
      this.children.add(child)
      let output = '',
        failure = '',
        settled = false
      const stop = (): void => {
        failure ||= '命令已取消'
        if (child.pid) void terminateCallAiTree(child.pid)
      }
      // 命令时限从进程启动开始，独立于模型与审批等待。
      const timer = setTimeout(() => {
        failure = `命令超过 ${timeoutSeconds} 秒`
        stop()
      }, timeoutSeconds * 1000)
      signal?.addEventListener('abort', stop, { once: true })
      const receive = (chunk: Buffer): void => {
        if (output.length + chunk.length > 256_000) {
          failure = '命令输出超过 256KB'
          stop()
          return
        }
        output += chunk.toString('utf8')
      }
      child.stdout?.on('data', receive)
      child.stderr?.on('data', receive)
      const finish = async (error?: Error): Promise<void> => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', stop)
        // 根命令退出不表示子树退出，先收束后代，再向调用方发布结果。
        if (child.pid) await terminateCallAiTree(child.pid)
        this.children.delete(child)
        if (error || failure) reject(failure ? new Error(failure) : error)
        else resolve(output)
      }
      child.once('error', (error) => void finish(error))
      child.once(
        'close',
        (code) => void finish(code ? new Error(`命令退出 ${code}\n${output}`) : undefined)
      )
    })
  }

  /**
   * 幂等结束本所有者的进程树，阻止迟到安装器重新启动。
   * @returns 全部终止请求完成的 Promise。
   */
  close(): Promise<void> {
    this.closed = true
    return (this.closing ||= Promise.all(
      [...this.children].map(async (child) => {
        if (child.pid) await terminateCallAiTree(child.pid)
      })
    ).then(() => {
      this.children.clear()
    }))
  }
}

/** 内置运行时状态；额外模块与预置程序分目录管理。 */
export class CallAiRuntime {
  /**
   * 返回随数据目录迁移的专属工具路径。
   * @returns 运行时根目录。
   */
  get root(): string {
    return path.join(app.getPath('userData'), 'call-ai')
  }

  /**
   * 返回当前平台的托管程序，不回退到用户系统安装。
   * @param kind 工具名称。
   * @returns 可执行路径。
   */
  executable(kind: 'node' | 'python'): string {
    const installed = path.join(
      this.root,
      'runtimes',
      kind,
      kind === 'node' ? 'node.exe' : 'python.exe'
    )
    if (existsSync(installed)) return installed
    return path.join(
      app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : app.getAppPath(),
      'resources',
      'call-ai-runtime',
      'win32-x64',
      kind,
      kind === 'node' ? 'node.exe' : 'python.exe'
    )
  }

  /**
   * 读取已安装程序及额外模块状态，不触发网络下载。
   * @returns 两种运行时的本地状态。
   */
  async status(): Promise<Record<string, unknown>> {
    const state: Record<string, unknown> = {}
    for (const kind of ['node', 'python'] as const) {
      const executable = this.executable(kind)
      const manifest = await fs
        .readFile(path.join(path.dirname(executable), 'tabdo-runtime.json'), 'utf8')
        .then(JSON.parse)
        .catch(() => null)
      state[kind] = {
        installed: Boolean(manifest && (await fs.stat(executable).catch(() => null))),
        version: manifest?.version || '',
        executable
      }
    }
    return state
  }

  /**
   * 下载并原子安装官方便携运行时，失败保留原版本，临时下载始终清理。
   * @param kind Node 或 Python。
   * @returns 安装后的本地状态。
   * @throws 平台不支持、下载、校验或解包失败时拒绝。
   */
  async update(kind: 'node' | 'python'): Promise<Record<string, unknown>> {
    if (process.platform !== 'win32' || process.arch !== 'x64')
      throw new Error('当前内置运行时支持 Windows x64')
    const stagingRoot = path.join(this.root, 'downloads')
    const temporary = path.join(stagingRoot, randomUUID())
    await fs.mkdir(temporary, { recursive: true })
    let backup = ''
    try {
      let version = '',
        url = '',
        checksum = ''
      if (kind === 'node') {
        const releases = await downloadCallAi('https://nodejs.org/dist/index.json', 5_000_000)
        const latest = (
          JSON.parse(releases.toString()) as Array<{ version: string; lts: string | false }>
        ).find((entry) => entry.lts && /^v24\./.test(entry.version))
        if (!latest) throw new Error('找不到 Node 24 LTS')
        version = latest.version
        const filename = `node-${version}-win-x64.zip`
        url = `https://nodejs.org/dist/${version}/${filename}`
        const sums = (
          await downloadCallAi(`https://nodejs.org/dist/${version}/SHASUMS256.txt`, 100_000)
        ).toString()
        checksum =
          sums
            .split('\n')
            .find((line) => line.endsWith(`  ${filename}`))
            ?.split(' ')[0] || ''
        if (!checksum) throw new Error('Node 官方校验清单缺失')
      } else {
        // 固定受支持的 CPython 小版本，更新时从官方发行目录选择同分支的最新补丁。
        const listing = (
          await downloadCallAi('https://www.python.org/ftp/python/', 2_000_000)
        ).toString()
        const versions = [...listing.matchAll(/href="(3\.13\.\d+)\//g)]
          .map((match) => match[1])
          .sort((a, b) => Number(b.split('.')[2]) - Number(a.split('.')[2]))
        for (const candidate of versions) {
          const candidateUrl = `https://www.python.org/ftp/python/${candidate}/python-${candidate}-embed-amd64.zip`
          const response = await fetch(candidateUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(15_000)
          })
          if (response.ok) {
            version = candidate
            url = candidateUrl
            break
          }
        }
        if (!url) throw new Error('找不到 Python 3.13 嵌入版')
      }
      const archive = await downloadCallAi(url, 80_000_000)
      if (checksum && createHash('sha256').update(archive).digest('hex') !== checksum)
        throw new Error('Node 下载校验失败')
      const directory = path.join(temporary, 'runtime')
      await fs.mkdir(directory)
      const zip = new AdmZip(archive)
      for (const entry of zip.getEntries()) {
        const name = kind === 'node' ? entry.entryName.replace(/^[^/]+\//, '') : entry.entryName
        if (!name || entry.isDirectory) continue
        const target = path.resolve(directory, name)
        if (
          !isCallAiChild(directory, target) ||
          ((entry.header.attr >>> 16) & 0o170000) === 0o120000
        )
          throw new Error('运行时压缩包含不安全路径')
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, entry.getData())
      }
      if (kind === 'python') {
        const pth = (await fs.readdir(directory)).find((name) => name.endsWith('._pth'))
        if (!pth) throw new Error('Python 隔离路径文件缺失')
        // 只加入工具专属包目录，不启用用户 site 或系统 Python 配置。
        await fs.appendFile(path.join(directory, pth), '\n../../packages/python\n')
        await fs.writeFile(
          path.join(directory, 'pip.pyz'),
          await downloadCallAi('https://bootstrap.pypa.io/pip/pip.pyz', 5_000_000)
        )
      }
      const executable = path.join(directory, kind === 'node' ? 'node.exe' : 'python.exe')
      await fs.access(executable)
      const checks = new CallAiProcesses()
      await checks.run(
        executable,
        ['--version'],
        temporary,
        callAiEnvironment(temporary, directory)
      )
      await fs.writeFile(
        path.join(directory, 'tabdo-runtime.json'),
        JSON.stringify({ version, source: url })
      )
      const destination = path.join(this.root, 'runtimes', kind)
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await assertCallAiNoLinks(destination)
      if (await fs.stat(destination).catch(() => null)) {
        backup = path.join(temporary, 'previous')
        await fs.rename(destination, backup)
      }
      try {
        await fs.rename(directory, destination)
      } catch (error) {
        if (backup) {
          await fs.rename(backup, destination)
          backup = ''
        }
        throw error
      }
      return await this.status()
    } finally {
      await removeCallAiOwned(stagingRoot, temporary)
    }
  }
}

/**
 * 有界下载官方运行资源，禁止无限读取或挂起。
 * @param url 官方 HTTPS 地址。
 * @param maximum 最大字节数。
 * @returns 下载内容。
 * @throws HTTP、超时或内容超限时拒绝。
 */
async function downloadCallAi(url: string, maximum: number): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000) })
  if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`)
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    bytes += chunk.byteLength
    if (bytes > maximum) {
      await response.body.cancel().catch(() => {})
      throw new Error('下载超过大小限制')
    }
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}
