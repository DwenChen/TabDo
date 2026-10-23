import { app, type IpcMainInvokeEvent } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { getTabDoRoot } from './appData/appDataPaths'
import { getInternalPluginPath } from './internalPlugins'
import { UsageGuideFiles } from './usageGuideFiles'
import database from '../api/shared/database'
import type { PluginManager } from '../managers/pluginManager'
import { GUIDE_PRACTICE_CODES } from '../../shared/usageGuide'
import { GUIDE_STEPS } from '../../shared/usageGuideSteps'
import type { UsageGuideWalkthrough } from './usageGuideWalkthrough'
import superPanelManager from './superPanelManager'
import detachedWindowManager from './detachedWindowManager'

export const isUsageGuide = process.env.TABDO_USAGE_GUIDE === '1'
const KEY = 'usage-guide-v1'
const PRACTICE = new Set<string>(GUIDE_PRACTICE_CODES)
type Launch = (options: {
  path: string
  type: 'plugin'
  featureCode: string
  param?: any
  name?: string
}) => Promise<any>
let files: UsageGuideFiles
let launch: Launch
let active: { child: ChildProcess; finished: Promise<void> } | null = null
let starting = false
let shuttingDown = false
let lastError = ''
let guideReady = false
let walkthrough: UsageGuideWalkthrough | undefined

/**
 * 请求当前实例通过宿主正常退出，保留原有原生资源收尾链。
 * @returns 无返回值。
 */
function quitGuide(): void {
  void import('../managers/windowManager').then(({ default: manager }) => {
    manager.setQuitting(true)
    app.quit()
  })
}

/**
 * 超时仅终止本服务直接创建且仍存活的体验进程树。
 * @param child 本次体验的进程句柄。
 * @returns 无返回值。
 */
function terminateGuide(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32')
    execFile(
      'taskkill.exe',
      ['/PID', String(child.pid), '/T', '/F'],
      { windowsHide: true },
      (error) => {
        if (error && child.exitCode === null && child.signalCode === null) child.kill()
      }
    )
  else child.kill('SIGKILL')
}

/**
 * 在资料与插件加载完成后准备引导，旧用户只获得设置入口。
 * @param options 首次启动状态、插件启动器与当前插件管理器。
 * @returns 应在首次启动自动展示引导时返回 true。
 * @throws 素材准备或恢复失败时抛错。
 */
export function initializeUsageGuide(options: { firstRun: boolean; launch: Launch }): boolean {
  launch = options.launch
  files = new UsageGuideFiles(getTabDoRoot())
  if (isUsageGuide) {
    process.env.TABDO_GUIDE_DEMO_WORKER = path.join(
      app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : app.getAppPath(),
      'resources/usage-guide-demo.cjs'
    )
    // 所有系统默认输出也落在一次性空间，用户主动另存的文件由用户保留。
    const desktop = process.env.TABDO_GUIDE_WORKSPACE!
    const output = path.join(desktop, '练习输出')
    for (const key of ['downloads', 'documents', 'pictures', 'videos'] as const)
      app.setPath(key, output)
    app.setPath('desktop', desktop)
    process.once('disconnect', quitGuide)
    process.on('message', (value) => {
      if (value === 'usage-guide:stop') quitGuide()
    })
    return true
  }
  const pending = files.recover()
  if (pending) lastError = `${pending} 个上次运行目录尚未清理；请结束仍在运行的体验后重试。`
  if (database.dbGet(KEY) == null) {
    // 仅新资料自动提示；升级安装不覆盖已有偏好，也不自动打开引导。
    database.dbPut(KEY, { retained: false, offered: true })
    if (options.firstRun) {
      prepareEnvironment()
      return process.env.TABDO_E2E !== '1' || process.env.TABDO_E2E_GUIDE_FIRST_RUN === '1'
    }
  }
  return false
}

/**
 * 从随包素材补齐引导环境并记录保留选择。
 * @returns 无返回值。
 * @throws 素材复制或状态保存失败时抛错。
 */
function prepareEnvironment(): void {
  const base = getInternalPluginPath('setting')
  files.prepare(path.join(base, app.isPackaged ? '' : 'public', 'guide-samples'))
  database.dbPut(KEY, { ...database.dbGet(KEY), retained: true })
}

/**
 * 使用设置插件已有路由打开引导入口，不增加重复普通指令。
 * @returns 页面装配完成后的 Promise。
 * @throws 设置插件缺失或装配失败时抛错。
 */
export async function openUsageGuide(): Promise<void> {
  if (isUsageGuide) {
    if (guideReady) return
    guideReady = true
    const { UsageGuideWalkthrough } = await import('./usageGuideWalkthrough')
    walkthrough = new UsageGuideWalkthrough({
      workspace: process.env.TABDO_GUIDE_WORKSPACE!,
      launchTool: launchGuideTool,
      openSettings: async (route) => {
        const setting = (database.dbGet('plugins') || []).find(
          (item: any) => item.name === 'setting'
        )
        return launch({
          path: setting.path,
          type: 'plugin',
          featureCode: `ui.router?router=${route}`,
          name: '设置教学'
        })
      },
      finish: (report) => {
        if (process.connected) process.send?.({ type: 'usage-guide:report', ...report })
        quitGuide()
      },
      fail: (message) => {
        if (process.connected) process.send?.({ type: 'usage-guide:error', message })
        quitGuide()
      }
    })
    return
  }
  const setting = (database.dbGet('plugins') || []).find((item: any) => item.name === 'setting')
  if (!setting) throw new Error('内置设置插件不可用')
  const result = await launch({
    path: setting.path,
    type: 'plugin',
    featureCode: 'ui.router?router=About&guide=1',
    name: '使用引导'
  })
  if (result?.success === false) throw new Error(result.error || '引导页面打开失败')
}

/**
 * 首次安装直接显示全屏欢迎选择，练习实例则装配自己的覆盖窗口。
 * @returns 欢迎页真实就绪后的 Promise；用户可直接退出而不进入课程。
 * @throws 隔离实例或引导页面启动失败时抛错。
 */
export async function offerUsageGuide(): Promise<void> {
  if (isUsageGuide) return openUsageGuide()
  // 先留下可重进的关于入口，再启动一次性欢迎页；拒绝不会再次自动弹出。
  await openUsageGuide()
  await startGuide()
}

/**
 * 在隔离教学中为用户主动打开的原生文件对话框让出覆盖层。
 * @param operation 已通过宿主权限校验的原生对话框操作。
 * @returns 用户真实选择或取消的结果；正式实例直接沿用既有行为。
 * @throws 原生对话框操作失败时透传错误。
 */
export async function withUsageGuideNativeDialog<T>(operation: () => Promise<T>): Promise<T> {
  if (!isUsageGuide || !walkthrough) return operation()
  return walkthrough.withNativeDialog(operation)
}

/**
 * 等子进程真正结束后清理运行目录，再询问是否保留可重建素材。
 * @param directory 本次运行目录。
 * @param token 本次目录所有权。
 * @param failure 进程异常或未就绪的诊断。
 * @param report 本次实际完成和跳过的步骤摘要。
 * @returns 清理和用户选择落盘后的 Promise。
 */
async function finishRun(
  directory: string,
  token: string,
  failure: string,
  report: { completed: string[]; skipped: string[] }
): Promise<void> {
  try {
    files.removeRun(directory, token)
    lastError = failure
    database.dbPut(KEY, {
      ...database.dbGet(KEY),
      lastRun: Date.now(),
      awaitingChoice: true,
      report
    })
    if (!shuttingDown) await openUsageGuide()
  } catch (error) {
    lastError = `引导清理未完成：${error instanceof Error ? error.message : String(error)}。可在设置中重试。`
  }
}

/**
 * 合并重复启动，只为本次运行传递隔离根，不复制正式设置或插件。
 * @returns 启动完成后的 Promise。
 * @throws 创建或启动子进程失败时抛错。
 */
async function startGuide(): Promise<void> {
  if (active || starting || shuttingDown) return
  starting = true
  let run: { directory: string; token: string } | undefined
  try {
    if (files.recover()) throw new Error('上次体验尚未退出或清理，请稍后重试')
    prepareEnvironment()
    run = files.createRun()
    const desktop =
      process.env.TABDO_E2E === '1' && process.env.TABDO_E2E_GUIDE_DESKTOP
        ? path.resolve(process.env.TABDO_E2E_GUIDE_DESKTOP)
        : app.getPath('desktop')
    const workspace = files.createDesktopWorkspace(run.directory, run.token, desktop)
    lastError = ''
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TABDO_USAGE_GUIDE: '1',
      TABDO_DATA_ROOT: path.join(run.directory, 'data'),
      TABDO_LEGACY_USER_DATA_PATH: path.join(run.directory, 'legacy'),
      TABDO_GUIDE_RUN: run.directory,
      TABDO_GUIDE_WORKSPACE: workspace,
      TABDO_GUIDE_TOKEN: run.token,
      TABDO_PREVIEW_OPEN_SETTINGS: '0'
    }
    delete env.ELECTRON_RUN_AS_NODE
    // 开发与正式版复用各自入口；不传递安装文件或自动化调试参数。
    const args = app.isPackaged ? [] : [process.argv[1]]
    if (process.env.TABDO_E2E === '1' && /^\d+$/.test(process.env.TABDO_E2E_GUIDE_DEBUG_PORT || ''))
      args.push(`--remote-debugging-port=${process.env.TABDO_E2E_GUIDE_DEBUG_PORT}`)
    // 一次仅一个实例处理全局鼠标，正式剪贴板采集和持久偏好继续保留。
    superPanelManager.setGuideInputSuspended(true)
    const child = spawn(process.execPath, args, {
      cwd: app.isPackaged ? path.dirname(process.execPath) : app.getAppPath(),
      env,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    })
    const { directory, token } = run
    let ready = false
    let startupFailure = ''
    let report = { completed: [] as string[], skipped: [] as string[] }
    child.on('message', (value: any) => {
      if (value?.type === 'usage-guide:error' && typeof value.message === 'string')
        startupFailure = value.message.slice(0, 1000)
      if (value?.type === 'usage-guide:report') {
        const known = new Set(GUIDE_STEPS.map((step) => step.id))
        report = {
          completed: [
            ...new Set<string>(Array.isArray(value.completed) ? value.completed : [])
          ].filter((id) => known.has(id)),
          skipped: [...new Set<string>(Array.isArray(value.skipped) ? value.skipped : [])].filter(
            (id) => known.has(id)
          )
        }
      }
    })
    const finished = new Promise<void>((resolve) => {
      child.once('close', (code) => {
        // 等练习的原生监听退出后再交回触发权，失败路径也必须恢复。
        if (!shuttingDown) superPanelManager.setGuideInputSuspended(false)
        const failure =
          startupFailure ||
          (!ready
            ? '体验实例未能启动，运行文件已清理，可重试。'
            : code !== 0
              ? '体验实例异常退出，运行文件已清理，可重新开始。'
              : '')
        void finishRun(directory, token, failure, report).finally(() => {
          active = null
          resolve()
        })
      })
    })
    active = { child, finished }
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        terminateGuide(child)
        reject(new Error('引导启动超时，请重试'))
      }, 30000)
      /**
       * 启动成功或失败后移除临时监听和超时，避免反复进入累积监听。
       * @returns 无返回值。
       */
      const cleanup = (): void => {
        clearTimeout(timeout)
        child.removeListener('message', onMessage)
        child.removeListener('close', onClose)
        child.removeListener('error', onError)
      }
      /**
       * 收到隔离实例装配确认后才向界面报告启动成功。
       * @param value 子进程消息。
       * @returns 无返回值。
       */
      const onMessage = (value: unknown): void => {
        if (value === 'usage-guide:ready') {
          ready = true
          cleanup()
          resolve()
        }
      }
      /**
       * 启动阶段异常退出时结束等待。
       * @returns 无返回值。
       */
      const onClose = (): void => {
        cleanup()
        reject(new Error(startupFailure || '体验实例未能启动，请重试'))
      }
      /**
       * 启动失败时结束等待并保留诊断。
       * @param error 进程错误。
       * @returns 无返回值。
       */
      const onError = (error: Error): void => {
        cleanup()
        reject(error)
      }
      child.on('message', onMessage)
      child.once('close', onClose)
      child.once('error', onError)
      child.once('spawn', () => {
        try {
          files.recordProcess(directory, token, child.pid!)
        } catch (error) {
          onError(error instanceof Error ? error : new Error(String(error)))
          terminateGuide(child)
        }
      })
    })
    // 欢迎页已接管屏幕后释放正式实例的关于窗口，避免其置顶状态遮挡后续练习工具。
    // 退出练习后 finishRun 会重新打开关于；这里不更改配置，也不关闭正式工具窗口。
    for (const item of detachedWindowManager.getAllWindows()) {
      if (item.pluginName === 'setting' && !item.window.isDestroyed()) item.window.close()
    }
    const [{ default: manager }, { default: windows }] = await Promise.all([
      import('../managers/pluginManager'),
      import('../managers/windowManager')
    ])
    const current = manager.getCurrentPluginView()?.webContents
    if (current && manager.getPluginInfoByWebContents(current)?.name === 'setting')
      windows.hideWindow(false)
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
    if (run && !active) files.removeRun(run.directory, run.token)
    if (!active && !shuttingDown) superPanelManager.setGuideInputSuspended(false)
    throw error
  } finally {
    starting = false
  }
}

/**
 * 只接受内置设置页发起的管理操作，实操仅在隔离实例执行。
 * @param event 发起请求的设置页面身份。
 * @param manager 当前插件管理器。
 * @param action 管理动作。
 * @param code 允许实操的内置工具功能码。
 * @returns 管理状态或工具启动结果。
 * @throws 调用方、动作或功能码不合法时抛错。
 */
export async function handleUsageGuide(
  event: IpcMainInvokeEvent,
  manager: PluginManager,
  action: string,
  code?: string
): Promise<any> {
  const owner = manager.getPluginInfoByWebContents(event.sender)
  const expected = path.join(getInternalPluginPath('setting'), app.isPackaged ? '' : 'public')
  if (
    owner?.name !== 'setting' ||
    path.resolve(owner.path).toLowerCase() !== path.resolve(expected).toLowerCase()
  )
    throw new Error('使用引导仅允许内置设置页调用')
  if (action === 'status')
    return {
      sandbox: isUsageGuide,
      running: Boolean(active || starting),
      retained: Boolean(database.dbGet(KEY)?.retained && fs.existsSync(files.environment)),
      error: lastError,
      awaitingChoice: Boolean(database.dbGet(KEY)?.awaitingChoice),
      samples: isUsageGuide ? process.env.TABDO_GUIDE_WORKSPACE! : '',
      report: database.dbGet(KEY)?.report
    }
  if (action === 'start' && !isUsageGuide) {
    await startGuide()
    return { success: true }
  }
  if (action === 'retain' && !isUsageGuide) {
    database.dbPut(KEY, { ...database.dbGet(KEY), awaitingChoice: false })
    return { success: true }
  }
  if (action === 'remove' && !isUsageGuide) {
    if (active || starting) throw new Error('请先结束当前体验')
    if (files.recover()) throw new Error('仍有运行文件待清理，请稍后重试')
    files.removeEnvironment()
    database.dbPut(KEY, { ...database.dbGet(KEY), retained: false, awaitingChoice: false })
    lastError = ''
    return { success: true }
  }
  if (action === 'finish' && isUsageGuide) {
    quitGuide()
    return { success: true }
  }
  if (action === 'launch' && isUsageGuide && code && PRACTICE.has(code)) {
    return launchGuideTool(code)
  }
  throw new Error('引导操作不可用')
}

/**
 * 用桌面副本启动允许练习的内置工具，实际参数不读取正式用户资料。
 * @param code 受控工具功能码。
 * @returns 真实宿主启动结果。
 * @throws 功能码不允许、样例丢失或启动失败时抛错。
 */
async function launchGuideTool(code: string): Promise<any> {
  if (!PRACTICE.has(code)) throw new Error('引导工具不可用')
  const tools = (database.dbGet('plugins') || []).find((item: any) => item.name === 'system')
  const sample = process.env.TABDO_GUIDE_WORKSPACE!
  const names =
    code === 'file-renamer'
      ? ['练习文件甲.txt', '练习文件乙.txt']
      : code === 'folder-break'
        ? ['待解散文件夹']
        : code === 'image-merge'
          ? ['图片/练习图片.png', '图片/第二张图片.png']
          : code === 'image-batch-folder'
            ? ['图片']
            : code === 'video-batch'
              ? ['练习视频.mp4']
              : ['image-batch', 'image-manual-crop', 'image-merge', 'image-annotate'].includes(code)
                ? ['图片/练习图片.png']
                : []
  const param =
    code === 'float-content'
      ? { type: 'over', payload: '这是练习便签。试着编辑、拖动到边缘，再点击色签展开。' }
      : names.length
        ? {
            type: 'files',
            payload: names.map((name) => {
              const file = path.join(sample, name)
              return {
                path: file,
                name: path.basename(file),
                isDirectory: fs.statSync(file).isDirectory(),
                isFile: fs.statSync(file).isFile()
              }
            })
          }
        : undefined
  return launch({ path: tools.path, type: 'plugin', featureCode: code, name: '引导练习', param })
}

/**
 * 宿主退出时先通知所属体验实例收尾，超时仅终止直接创建的进程树。
 * @returns 子进程退出并清理后的 Promise。
 */
export async function stopUsageGuide(): Promise<void> {
  shuttingDown = true
  walkthrough?.dispose()
  walkthrough = undefined
  if (!active) return
  const current = active
  if (current.child.connected) current.child.send('usage-guide:stop', () => {})
  const timer = setTimeout(() => terminateGuide(current.child), 15000)
  try {
    await current.finished
  } finally {
    clearTimeout(timer)
  }
}
