import { BrowserWindow, screen } from 'electron'
import progressPreload from '../../../../resources/interconnect-progress-preload.cjs?asset'
import {
  applyToolsWindowIdentity,
  getToolsWindowIcon,
  getToolsWindowTitle
} from '../toolsWindowIdentity'
import type { InterconnectTransferView } from '@shared/interconnect'

/** 传输状态快照。 */
export interface InterconnectProgressPayload {
  /** 当前与最近的任务列表。 */
  transfers: InterconnectTransferView[]
  /** 是否存在仍在运行的任务。 */
  running: boolean
}

/**
 * 生成进度窗的静态页面。
 * @returns 可直接加载的 data URL。
 */
function buildPage(): string {
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>互联传输</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    background: #f5f6f8;
    color: #1f2328;
    padding: 14px 16px 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
  }
  /* 隐藏原生标题栏后，顶部标题行承担拖动任务，按钮与列表保持可交互。 */
  .head { -webkit-app-region: drag; user-select: none; }
  .list, .actions, .close, .link, .retry { -webkit-app-region: no-drag; }
  @media (prefers-color-scheme: dark) {
    body { background: #1f2126; color: #e8eaed; }
    .item { background: #2a2d33; border-color: #353941; }
    .bar { background: #3a3e46; }
    .muted { color: #9aa0a6; }
    .close { background: #34383f; color: #d9dde2; }
    .close:hover { background: #41464f; }
    .link { background: #3a3e46; color: #cfe0ff; }
    .link:hover { background: #454a53; }
    .retry { background: #3a3e46; color: #e8eaed; }
    .retry:hover { background: #454a53; }
  }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .title { font-size: 14px; font-weight: 600; }
  .muted { font-size: 12px; color: #6b7280; }
  .list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 2px; }
  .list::-webkit-scrollbar { width: 8px; }
  .list::-webkit-scrollbar-thumb { background: rgba(128, 128, 128, .35); border-radius: 4px; }
  .item { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; }
  .row { display: flex; align-items: center; gap: 8px; }
  .dir { font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 4px; color: #fff; flex: none; }
  .dir.send { background: #2563eb; }
  .dir.receive { background: #0f766e; }
  .device { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status { margin-left: auto; font-size: 11px; color: #6b7280; flex: none; }
  .file { margin-top: 8px; }
  .file-name { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; }
  .file-name span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .amount { flex: none; color: #6b7280; }
  .bar { margin-top: 5px; height: 6px; border-radius: 3px; background: #e5e7eb; overflow: hidden; }
  .fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #14b8a6, #2563eb); transition: width .18s ease; }
  .fill.done { background: #16a34a; }
  .fill.error { background: #dc2626; }
  .error { margin-top: 6px; font-size: 11px; color: #dc2626; }
  .item-actions { display: flex; justify-content: flex-end; margin-top: 8px; }
  .empty { margin: auto; text-align: center; font-size: 12px; color: #6b7280; line-height: 1.6; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 2px; }
  .close, .link, .retry, .clear {
    border: 0; border-radius: 6px; font: inherit; cursor: pointer;
  }
  .close { background: #e5e7eb; color: #374151; font-size: 12px; padding: 6px 14px; }
  .close:hover { background: #d8dbe0; }
  .clear { background: transparent; color: #6b7280; font-size: 12px; padding: 6px 10px; }
  .clear:hover { background: #e5e7eb; color: #374151; }
  .clear:disabled { opacity: .45; cursor: default; background: transparent; }
  .link { background: #eef2ff; color: #2557c7; font-size: 11px; padding: 2px 8px; }
  .link:hover { background: #e0e7ff; }
  .retry { background: #f1f2f4; color: #1f2328; font-size: 12px; padding: 4px 12px; }
  .retry:hover { background: #e5e7eb; }
</style>
</head>
<body>
  <div class="head">
    <div class="title">互联传输</div>
    <div class="muted" id="summary">准备中…</div>
  </div>
  <div class="list" id="list"><div class="empty">等待传输任务</div></div>
  <div class="actions"
    ><button class="clear" id="clear" disabled title="清除已完成和失败的任务记录，不删除文件">清空记录</button
    ><button class="close" id="close">关闭</button></div>
<script>
  const list = document.getElementById('list')
  const summary = document.getElementById('summary')
  document.getElementById('close').addEventListener('click', () => {
    window.interconnectProgress && window.interconnectProgress.close()
  })
  document.getElementById('clear').addEventListener('click', () => {
    window.interconnectProgress && window.interconnectProgress.clearHistory()
  })
  /**
   * 格式化字节数。
   * @param {number} value 字节数。
   * @returns {string} 便于阅读的容量文本。
   */
  function formatBytes(value) {
    const size = Number(value) || 0
    if (size < 1024) return size + ' B'
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
    if (size < 1024 * 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + ' MB'
    return (size / 1024 / 1024 / 1024).toFixed(2) + ' GB'
  }
  /**
   * 生成单个任务的 DOM。
   * @param {object} transfer 传输快照。
   * @returns {HTMLElement} 任务卡片。
   */
  function renderTransfer(transfer) {
    const item = document.createElement('div')
    item.className = 'item'
    const row = document.createElement('div')
    row.className = 'row'
    const dir = document.createElement('span')
    dir.className = 'dir ' + transfer.direction
    dir.textContent = transfer.direction === 'send' ? '发送' : '接收'
    const device = document.createElement('div')
    device.className = 'device'
    device.textContent = transfer.deviceName
    const status = document.createElement('div')
    status.className = 'status'
    status.textContent =
      transfer.status === 'running'
        ? formatBytes(transfer.speed) + '/s'
        : transfer.status === 'done'
          ? '已完成'
          : '失败'
    row.append(dir, device, status)
    item.append(row)
    transfer.files.forEach((file, index) => {
      const wrap = document.createElement('div')
      wrap.className = 'file'
      const name = document.createElement('div')
      name.className = 'file-name'
      const label = document.createElement('span')
      label.textContent = file.name
      name.append(label)
      const percent = file.size > 0 ? Math.min(100, Math.round((file.transferred / file.size) * 100)) : 100
      if (transfer.status === 'done' && file.path) {
        const action = document.createElement('button')
        action.className = 'link'
        action.type = 'button'
        action.textContent = '打开位置'
        action.title = '在资源管理器中显示该文件'
        action.addEventListener('click', () => {
          window.interconnectProgress && window.interconnectProgress.revealFile(transfer.id, index)
        })
        name.append(action)
      } else {
        const amount = document.createElement('span')
        amount.className = 'amount'
        amount.textContent = file.size > 0 ? percent + '%' : '—'
        name.append(amount)
      }
      const bar = document.createElement('div')
      bar.className = 'bar'
      const fill = document.createElement('div')
      fill.className = 'fill ' + (file.status === 'error' ? 'error' : file.status === 'done' ? 'done' : '')
      fill.style.width = (file.status === 'done' ? 100 : percent) + '%'
      bar.append(fill)
      wrap.append(name, bar)
      item.append(wrap)
    })
    if (transfer.error) {
      const error = document.createElement('div')
      error.className = 'error'
      error.textContent = transfer.error
      item.append(error)
    }
    if (transfer.status === 'error' && transfer.retryable) {
      const actions = document.createElement('div')
      actions.className = 'item-actions'
      const retry = document.createElement('button')
      retry.className = 'retry'
      retry.type = 'button'
      retry.textContent = '重新发起'
      retry.addEventListener('click', () => {
        window.interconnectProgress && window.interconnectProgress.retryTransfer(transfer.id)
      })
      actions.append(retry)
      item.append(actions)
    }
    return item
  }
  window.interconnectProgress.onUpdate((payload) => {
    const transfers = Array.isArray(payload?.transfers) ? payload.transfers : []
    list.replaceChildren()
    if (!transfers.length) {
      const empty = document.createElement('div')
      empty.className = 'empty'
      empty.textContent = '暂无传输任务。使用“互联传输”发送文件后在此查看进度。'
      list.append(empty)
    } else {
      for (const transfer of transfers.slice(0, 8)) list.append(renderTransfer(transfer))
    }
    const running = transfers.filter((item) => item.status === 'running').length
    const failed = transfers.filter((item) => item.status === 'error').length
    // 只有存在已完成或失败记录时才允许清空，进行中的任务不受清理影响。
    document.getElementById('clear').disabled = !transfers.some(
      (item) => item.status !== 'running'
    )
    summary.textContent = running
      ? running + ' 个任务进行中'
      : failed
        ? failed + ' 个任务失败'
        : '全部完成'
  })
</script>
</body>
</html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

/**
 * 互联传输进度窗，复用工具专属图标与任务栏身份。
 *
 * 传输运行中自动出现；全部完成后自动关闭。从托盘手动打开时保持显示，
 * 直到用户主动关闭，便于重发失败任务或定位已完成文件。
 */
export class InterconnectProgressWindow {
  private window: BrowserWindow | null = null
  private closeTimer: NodeJS.Timeout | null = null
  private latest: InterconnectProgressPayload = { transfers: [], running: false }
  private manual = false

  /**
   * 判断指定页面是否属于当前进度窗。
   * @param webContentsId 页面 WebContents 标识。
   * @returns 属于当前存活的进度窗时返回 true。
   */
  public owns(webContentsId: number): boolean {
    return (
      !!this.window &&
      !this.window.isDestroyed() &&
      !this.window.webContents.isDestroyed() &&
      this.window.webContents.id === webContentsId
    )
  }

  /**
   * 推送最新传输快照；有运行中任务时确保窗口存在。
   * @param payload 传输快照。
   * @returns 无返回值。
   */
  public update(payload: InterconnectProgressPayload): void {
    this.latest = payload
    try {
      if (payload.running && !this.window) this.create(false)
      if (!this.window) return
      if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed()) {
        this.window.webContents.send('interconnect-transfer-update', payload)
        if (!this.window.isVisible()) this.window.showInactive()
      }
    } catch (error) {
      // 进度窗关闭或销毁中的竞态不能中断实际文件传输。
      console.warn('[Interconnect] 更新传输进度窗失败:', error)
    }
    this.scheduleAutoClose()
  }

  /**
   * 手动打开面板；存在最近任务时保留，不随全部完成自动关闭。
   * @returns 无返回值。
   */
  public show(): void {
    this.manual = true
    if (this.closeTimer) {
      clearTimeout(this.closeTimer)
      this.closeTimer = null
    }
    if (!this.window) {
      this.create(true)
      return
    }
    if (this.window.isDestroyed()) return
    this.window.webContents.send('interconnect-transfer-update', this.latest)
    this.window.show()
    this.window.focus()
  }

  /**
   * 关闭进度窗并取消延迟关闭。
   * @returns 无返回值。
   */
  public dispose(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer)
      this.closeTimer = null
    }
    this.manual = false
    if (this.window && !this.window.isDestroyed()) this.window.close()
    this.window = null
  }

  /**
   * 创建进度窗并放到主屏右下角。
   * @param focus 是否在加载完成后聚焦窗口。
   * @returns 无返回值。
   */
  private create(focus: boolean): void {
    const { workArea } = screen.getPrimaryDisplay()
    const width = 460
    const height = 430
    this.window = new BrowserWindow({
      title: getToolsWindowTitle('interconnect-transfer'),
      icon: getToolsWindowIcon('interconnect-transfer'),
      width,
      height,
      minWidth: 380,
      minHeight: 280,
      resizable: true,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: false,
      // 进度窗自带标题行并提供关闭按钮，不再显示原生标题栏。
      frame: false,
      show: false,
      x: Math.max(workArea.x, workArea.x + workArea.width - width - 18),
      y: Math.max(workArea.y, workArea.y + workArea.height - height - 18),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: progressPreload
      }
    })
    // 进度窗使用功能自身的图标与 Windows 任务栏身份。
    applyToolsWindowIdentity(this.window, 'interconnect-transfer')
    this.window.setMenuBarVisibility(false)
    this.window.loadURL(buildPage())
    this.window.webContents.on('did-finish-load', () => {
      if (!this.window || this.window.isDestroyed()) return
      this.window.webContents.send('interconnect-transfer-update', this.latest)
      if (focus) {
        this.window.show()
        this.window.focus()
      } else {
        this.window.showInactive()
      }
    })
    this.window.on('closed', () => {
      this.window = null
      this.manual = false
    })
    this.window.on('page-title-updated', (event) => event.preventDefault())
  }

  /**
   * 全部任务结束且非手动打开时延迟关闭，避免继续占用窗口与页面。
   * 存在失败任务时保留窗口，便于用户直接重新发起。
   * @returns 无返回值。
   */
  private scheduleAutoClose(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer)
      this.closeTimer = null
    }
    if (this.manual) return
    const keepForAction = this.latest.transfers.some((transfer) => transfer.status === 'error')
    if (this.latest.running || keepForAction) return
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null
      this.dispose()
    }, 5000)
  }
}
