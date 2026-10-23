import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

/** 可重建的引导素材与一次性运行目录；不包含正式数据库。 */
export class UsageGuideFiles {
  readonly root: string
  readonly environment: string
  readonly runs: string

  /**
   * 将所有引导文件限制在所选资料根的专属子目录。
   * @param dataRoot 当前正式资料根。
   * @returns 新的目录管理器。
   */
  constructor(dataRoot: string) {
    this.root = path.join(dataRoot, 'usage-guide')
    this.environment = path.join(this.root, 'environment')
    this.runs = path.join(this.root, 'runs')
  }

  /**
   * 校验目录链，拒绝链接目录，避免清理越过引导自身边界。
   * @param target 待访问的专属子目录。
   * @returns 无返回值。
   * @throws 目录越界或包含符号链接时抛错。
   */
  private validate(target: string): void {
    const relative = path.relative(this.root, target)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
      throw new Error('引导目录超出允许范围')
    for (const part of ['', ...relative.split(path.sep)]) {
      target = part ? path.join(target, part) : this.root
      if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())
        throw new Error('引导目录不能使用链接')
    }
  }

  /**
   * 安装或补齐可重复使用的素材，不复制正式资料和已安装插件。
   * @param source 随程序提供的样例目录。
   * @returns 无返回值。
   * @throws 目录不安全或素材复制失败时抛错。
   */
  prepare(source: string): void {
    this.validate(this.environment)
    fs.mkdirSync(this.environment, { recursive: true })
    fs.cpSync(source, this.environment, { recursive: true, force: true })
  }

  /**
   * 从素材创建全新的练习空间，数据库、缓存与输出均留在其中。
   * @returns 本次运行路径与不可复用的所有权标记。
   * @throws 创建或复制失败时抛错。
   */
  createRun(): { directory: string; token: string } {
    this.validate(this.runs)
    fs.mkdirSync(this.runs, { recursive: true })
    const token = randomUUID()
    const directory = path.join(this.runs, token)
    fs.mkdirSync(directory)
    fs.writeFileSync(
      path.join(directory, 'owner.json'),
      JSON.stringify({ token, parent: process.pid })
    )
    try {
      fs.cpSync(this.environment, path.join(directory, 'samples'), { recursive: true })
      fs.mkdirSync(path.join(directory, 'output'))
      return { directory, token }
    } catch (error) {
      this.removeRun(directory, token)
      throw error
    }
  }

  /**
   * 在桌面创建仅属于本次体验的可见练习目录，并登记到运行清单。
   * @param directory 本次内部运行目录。
   * @param token 本次所有权标记。
   * @param desktopRoot 系统桌面根，测试必须显式使用隔离桌面。
   * @returns 桌面练习目录的绝对路径。
   * @throws 所有权、桌面目录或复制校验失败时抛错。
   */
  createDesktopWorkspace(directory: string, token: string, desktopRoot: string): string {
    this.validate(directory)
    const ownerFile = path.join(directory, 'owner.json')
    const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8'))
    if (
      owner.token !== token ||
      !path.isAbsolute(desktopRoot) ||
      !fs.statSync(desktopRoot).isDirectory()
    )
      throw new Error('桌面练习目录校验失败')
    const workspace = path.join(desktopRoot, `TabDo入门练习-${token}`)
    // 排他创建，不能复用或覆盖桌面上原有的任何文件夹。
    fs.mkdirSync(workspace)
    fs.writeFileSync(path.join(workspace, '.tabdo-guide-owner.json'), JSON.stringify({ token }))
    fs.writeFileSync(ownerFile, JSON.stringify({ ...owner, desktopRoot, workspace }))
    try {
      fs.cpSync(this.environment, workspace, { recursive: true })
      fs.mkdirSync(path.join(workspace, '练习输出'))
      return workspace
    } catch (error) {
      this.removeDesktopWorkspace(ownerFile, token)
      throw error
    }
  }

  /**
   * 按双重所有权校验清理桌面练习目录，拒绝链接及不匹配的位置。
   * @param ownerFile 内部运行清单位置。
   * @param token 本次所有权标记。
   * @returns 无返回值。
   * @throws 路径、标记或删除失败时抛错，保留待恢复记录。
   */
  private removeDesktopWorkspace(ownerFile: string, token: string): void {
    const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8'))
    if (!owner.workspace) return
    const expected = path.join(owner.desktopRoot, `TabDo入门练习-${token}`)
    if (
      owner.token !== token ||
      !path.isAbsolute(owner.desktopRoot) ||
      owner.workspace !== expected
    )
      throw new Error('不能清理非本次桌面练习目录')
    if (!fs.existsSync(expected)) return
    if (fs.lstatSync(expected).isSymbolicLink()) throw new Error('桌面练习目录不能是链接')
    const marker = JSON.parse(
      fs.readFileSync(path.join(expected, '.tabdo-guide-owner.json'), 'utf8')
    )
    if (marker.token !== token) throw new Error('桌面练习目录身份不匹配')
    // 不遍历或删除桌面其他内容；子目录链接由 rm 本身移除而不跟随。
    fs.rmSync(expected, { recursive: true, maxRetries: 8, retryDelay: 150 })
  }

  /**
   * 在进程启动后记录子进程身份，供异常退出后的恢复检查使用。
   * @param directory 本次运行目录。
   * @param token 创建时的所有权标记。
   * @param pid 直接创建的子进程编号。
   * @returns 无返回值。
   * @throws 所有权校验或写入失败时抛错。
   */
  recordProcess(directory: string, token: string, pid: number): void {
    this.validate(directory)
    const owner = JSON.parse(fs.readFileSync(path.join(directory, 'owner.json'), 'utf8'))
    if (owner.token !== token) throw new Error('引导运行目录身份不匹配')
    fs.writeFileSync(path.join(directory, 'owner.json'), JSON.stringify({ ...owner, pid }))
  }

  /**
   * 仅在所属进程退出后删除本次过程文件，删除失败保留目录供后续重试。
   * @param directory 待删除的运行目录。
   * @param token 创建时的所有权标记。
   * @returns 无返回值。
   * @throws 目录越界、身份不匹配或删除失败时抛错。
   */
  removeRun(directory: string, token: string): void {
    this.validate(directory)
    if (path.dirname(directory) !== this.runs || path.basename(directory) !== token)
      throw new Error('不能清理非本次引导目录')
    if (!fs.existsSync(directory)) return
    const owner = JSON.parse(fs.readFileSync(path.join(directory, 'owner.json'), 'utf8'))
    if (owner.token !== token) throw new Error('引导运行目录身份不匹配')
    // 此处只能由确认进程已退出的调用方进入，不在线删除数据库。
    this.removeDesktopWorkspace(path.join(directory, 'owner.json'), token)
    fs.rmSync(directory, { recursive: true, maxRetries: 8, retryDelay: 150 })
  }

  /**
   * 恢复上次异常退出遗留的运行目录，仍存活的进程不作处理。
   * @returns 尚不能清理的目录数量。
   * @throws 目录校验失败时抛错。
   */
  recover(): number {
    this.validate(this.runs)
    if (!fs.existsSync(this.runs)) return 0
    let pending = 0
    for (const entry of fs.readdirSync(this.runs)) {
      const directory = path.join(this.runs, entry)
      try {
        this.validate(directory)
        const owner = JSON.parse(fs.readFileSync(path.join(directory, 'owner.json'), 'utf8'))
        let alive = false
        if (Number.isInteger(owner.pid) && owner.pid > 0) {
          try {
            process.kill(owner.pid, 0)
            alive = true
          } catch {
            /* 进程已结束。 */
          }
        }
        if (alive) pending++
        else this.removeRun(directory, owner.token)
      } catch {
        pending++
      }
    }
    return pending
  }

  /**
   * 删除可重建的引导素材，正式资料与尚待清理的运行目录不受影响。
   * @returns 无返回值。
   * @throws 目录校验或删除失败时抛错。
   */
  removeEnvironment(): void {
    this.validate(this.environment)
    fs.rmSync(this.environment, { recursive: true, force: true })
  }
}
