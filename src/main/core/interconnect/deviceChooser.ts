import { BrowserWindow, screen } from 'electron'
import choosePreload from '../../../../resources/interconnect-progress-preload.cjs?asset'
import {
  applyToolsWindowIdentity,
  getToolsWindowIcon,
  getToolsWindowTitle
} from '../toolsWindowIdentity'

/** 可选择的目标设备。 */
export interface InterconnectChoiceDevice {
  /** 设备 ID。 */
  id: string
  /** 设备展示名称。 */
  name: string
  /** 设备类型。 */
  type: string
  /** 是否为默认设备。 */
  preferred: boolean
}

/** 设备选择窗口宽度。 */
const CHOOSER_WIDTH = 380

/**
 * 把设备列表序列化为可直接嵌入页面的 JSON。
 * @param devices 可选设备。
 * @returns 转义 `<` 后的 JSON 文本。
 */
function serializeDevices(devices: InterconnectChoiceDevice[]): string {
  return JSON.stringify(devices).replace(/</g, '\\u003c')
}

/**
 * 生成设备选择页。
 * @param devices 可选设备。
 * @param title 窗口标题与提示文本。
 * @returns 可直接加载的 data URL。
 */
function buildChooserPage(devices: InterconnectChoiceDevice[], title: string): string {
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    background: #f5f6f8;
    color: #1f2328;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #1f2126; color: #e8eaed; }
    .device { background: #2a2d33; border-color: #353941; }
    .device:hover { background: #33373e; }
    .close { background: #34383f; color: #d9dde2; }
    .close:hover { background: #41464f; }
    .muted { color: #9aa0a6; }
  }
  .head { display: flex; flex-direction: column; gap: 2px; }
  .title { font-size: 14px; font-weight: 600; }
  .muted { font-size: 12px; color: #6b7280; }
  .list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
  .device {
    display: flex; align-items: center; gap: 10px; width: 100%;
    border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff;
    padding: 10px 12px; font: inherit; text-align: left; cursor: pointer;
  }
  .device:hover { background: #f0f2f5; }
  .name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: 11px; color: #6b7280; flex: none; margin-left: auto; }
  .badge {
    font-size: 10px; padding: 1px 6px; border-radius: 4px; flex: none;
    background: rgba(37, 99, 235, .12); color: #2563eb;
  }
  .actions { display: flex; justify-content: flex-end; }
  .close {
    border: 0; border-radius: 6px; background: #e5e7eb; color: #374151;
    font: inherit; font-size: 12px; padding: 6px 14px; cursor: pointer;
  }
  .close:hover { background: #d8dbe0; }
</style>
</head>
<body>
  <div class="head">
    <div class="title">${title}</div>
    <div class="muted">发送目标设备</div>
  </div>
  <div class="list" id="list"></div>
  <div class="actions"><button class="close" id="cancel">取消</button></div>
<script>
  const devices = ${serializeDevices(devices)}
  const typeLabels = {
    phone: '手机', smartphone: '手机', tablet: '平板', desktop: '电脑',
    laptop: '笔记本', tv: '电视', unknown: '设备'
  }
  const list = document.getElementById('list')
  for (const device of devices) {
    const button = document.createElement('button')
    button.className = 'device'
    button.type = 'button'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = device.name
    button.append(name)
    if (device.preferred) {
      const badge = document.createElement('span')
      badge.className = 'badge'
      badge.textContent = '默认'
      button.append(badge)
    }
    const meta = document.createElement('span')
    meta.className = 'meta'
    meta.textContent = typeLabels[device.type] || '设备'
    button.append(meta)
    button.addEventListener('click', () => {
      window.interconnectProgress && window.interconnectProgress.chooseDevice(device.id)
    })
    list.append(button)
  }
  document.getElementById('cancel').addEventListener('click', () => {
    window.interconnectProgress && window.interconnectProgress.close()
  })
</script>
</body>
</html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

/**
 * 互联传输的多设备选择窗口。
 *
 * 只在存在多个可接收设备时由主进程创建，选择结果通过 IPC 交回服务，
 * 不向页面暴露证书、套接字或传输数据。
 */
export class InterconnectDeviceChooser {
  private window: BrowserWindow | null = null
  private resolver: ((deviceId: string | null) => void) | null = null
  private devices: InterconnectChoiceDevice[] = []

  /**
   * 展示设备列表并等待用户选择。
   * @param devices 可选设备。
   * @param title 窗口标题与提示文本。
   * @returns 选中的设备 ID；取消或关闭时返回 null。
   */
  public choose(devices: InterconnectChoiceDevice[], title: string): Promise<string | null> {
    this.finish(null)
    this.devices = devices
    return new Promise<string | null>((resolve) => {
      this.resolver = resolve
      this.create(title)
    })
  }

  /**
   * 采用页面提交的设备选择。
   * @param deviceId 选中的设备 ID。
   * @returns 无返回值。
   */
  public resolve(deviceId: string): void {
    if (!this.resolver) return
    if (!this.devices.some((device) => device.id === deviceId)) return
    this.finish(deviceId)
  }

  /**
   * 关闭选择窗口并释放引用。
   * @returns 无返回值。
   */
  public dispose(): void {
    this.finish(null)
  }

  /**
   * 创建并定位选择窗口。
   * @param title 窗口标题与提示文本。
   * @returns 无返回值。
   */
  private create(title: string): void {
    const { workArea } = screen.getPrimaryDisplay()
    const height = Math.min(460, 170 + this.devices.length * 58)
    this.window = new BrowserWindow({
      title: getToolsWindowTitle('interconnect-transfer'),
      icon: getToolsWindowIcon('interconnect-transfer'),
      width: CHOOSER_WIDTH,
      height,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      show: false,
      x: Math.round(workArea.x + (workArea.width - CHOOSER_WIDTH) / 2),
      y: Math.round(workArea.y + Math.max(60, (workArea.height - height) * 0.32)),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: choosePreload
      }
    })
    // 选择窗沿用互联传输的图标与任务栏身份。
    applyToolsWindowIdentity(this.window, 'interconnect-transfer')
    this.window.setMenuBarVisibility(false)
    const window = this.window
    window.loadURL(buildChooserPage(this.devices, title))
    window.webContents.on('did-finish-load', () => {
      if (!this.window || this.window.isDestroyed()) return
      this.window.show()
      this.window.focus()
    })
    window.on('closed', () => {
      if (this.window === window) this.window = null
      if (this.resolver) this.finish(null)
    })
    window.on('page-title-updated', (event) => event.preventDefault())
  }

  /**
   * 结束当前选择并通知等待方。
   * @param deviceId 选中的设备 ID；取消时为 null。
   * @returns 无返回值。
   */
  private finish(deviceId: string | null): void {
    const resolve = this.resolver
    this.resolver = null
    this.devices = []
    const window = this.window
    this.window = null
    if (window && !window.isDestroyed()) window.close()
    resolve?.(deviceId)
  }
}
