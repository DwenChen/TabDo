import {
  expect,
  test,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { generateDeviceCertificate } from '../../src/main/core/interconnect/certificate'

interface PeerPacket {
  type: string
  body: Record<string, any>
  payloadSize?: number
  payloadTransferInfo?: Record<string, any>
}

/**
 * 读取一行 JSON 并返回剩余数据。
 * @param socket 套接字。
 * @param timeout 超时时间。
 * @returns 第一行文本与剩余内容。
 */
function readLine(socket: net.Socket, timeout = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0)
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('等待协议包超时'))
    }, timeout)
    const cleanup = (): void => {
      clearTimeout(timer)
      socket.off('data', onData)
    }
    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk])
      const index = buffer.indexOf(0x0a)
      if (index >= 0) {
        cleanup()
        socket.pause()
        const rest = buffer.subarray(index + 1)
        if (rest.length) socket.unshift(rest)
        resolve(buffer.subarray(0, index).toString('utf8'))
      }
    }
    socket.on('data', onData)
  })
}

/**
 * 等待套接字事件。
 * @param emitter 事件源。
 * @param event 事件名。
 * @param timeout 超时时间。
 * @returns 事件参数。
 */
function once(emitter: NodeJS.EventEmitter, event: string, timeout = 10000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待 ${event} 超时`)), timeout)
    emitter.once(event, (value: unknown) => {
      clearTimeout(timer)
      resolve(value)
    })
  })
}

/** 测试用远端设备连接。 */
class PeerConnection {
  private readonly socket: tls.TLSSocket
  private readonly packets: PeerPacket[] = []
  private readonly waiters: {
    type: string
    predicate: (packet: PeerPacket) => boolean
    resolve: (packet: PeerPacket) => void
  }[] = []
  private buffer = Buffer.alloc(0)
  private closed = false

  /**
   * 绑定已握手的套接字。
   * @param socket 已完成的 TLS 套接字。
   */
  constructor(socket: tls.TLSSocket) {
    this.socket = socket
    socket.on('data', (chunk: Buffer) => this.receive(chunk))
    socket.on('close', () => {
      this.closed = true
    })
  }

  /**
   * 等待服务端关闭当前链路。
   * @param timeout 超时时间。
   * @returns 套接字关闭后的 Promise。
   */
  waitForClose(timeout = 10000): Promise<void> {
    if (this.closed || this.socket.destroyed) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.off('close', onClose)
        reject(new Error('等待链路关闭超时'))
      }, timeout)
      const onClose = (): void => {
        clearTimeout(timer)
        resolve()
      }
      this.socket.once('close', onClose)
    })
  }

  /**
   * 发送协议包。
   * @param type 包类型。
   * @param body 业务字段。
   * @param extra 载荷信息。
   * @returns 无返回值。
   */
  send(
    type: string,
    body: Record<string, unknown> = {},
    extra: Record<string, unknown> = {}
  ): void {
    this.socket.write(`${JSON.stringify({ id: Date.now(), type, body, ...extra })}\n`)
  }

  /**
   * 等待指定协议包。
   * @param type 包类型。
   * @param predicate 额外条件。
   * @param timeout 超时时间。
   * @returns 匹配的协议包。
   */
  waitFor(
    type: string,
    predicate: (packet: PeerPacket) => boolean = () => true,
    timeout = 15000
  ): Promise<PeerPacket> {
    const existing = this.packets.find((packet) => packet.type === type && predicate(packet))
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.resolve === wrapped)
        if (index >= 0) this.waiters.splice(index, 1)
        reject(new Error(`等待 ${type} 协议包超时`))
      }, timeout)
      const wrapped = (packet: PeerPacket): void => {
        clearTimeout(timer)
        resolve(packet)
      }
      this.waiters.push({ type, predicate, resolve: wrapped })
    })
  }

  /**
   * 处理新到达的数据。
   * @param chunk 数据块。
   * @returns 无返回值。
   */
  private receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    let index = this.buffer.indexOf(0x0a)
    while (index >= 0) {
      const line = this.buffer.subarray(0, index).toString('utf8')
      this.buffer = this.buffer.subarray(index + 1)
      try {
        const packet = JSON.parse(line) as PeerPacket
        const waiterIndex = this.waiters.findIndex(
          (waiter) => waiter.type === packet.type && waiter.predicate(packet)
        )
        if (waiterIndex >= 0) {
          const [waiter] = this.waiters.splice(waiterIndex, 1)
          waiter.resolve(packet)
        } else {
          this.packets.push(packet)
        }
      } catch {
        // 忽略损坏行，保持连接继续解析。
      }
      index = this.buffer.indexOf(0x0a)
    }
  }

  /**
   * 关闭连接。
   * @returns 无返回值。
   */
  close(): void {
    this.socket.destroy()
  }
}

interface PeerContext {
  deviceId: string
  context: tls.SecureContext
  privateKeyPem: string
  certificatePem: string
}

/**
 * 生成测试远端设备证书。
 * @param id 设备 ID。
 * @returns 设备 ID 与 TLS 上下文。
 */
function createPeer(id: string): PeerContext {
  const generated = generateDeviceCertificate(id)
  return {
    deviceId: id,
    privateKeyPem: generated.privateKeyPem,
    certificatePem: generated.certificatePem,
    context: tls.createSecureContext({
      key: generated.privateKeyPem,
      cert: generated.certificatePem
    })
  }
}

/**
 * 以测试设备身份连接互联服务。
 * @param port 服务 TCP 端口。
 * @param peer 测试设备。
 * @param serviceDeviceId 服务设备 ID。
 * @param deviceName 测试设备展示名称。
 * @returns 已握手连接与服务身份。
 */
async function connectPeer(
  port: number,
  peer: PeerContext,
  serviceDeviceId: string,
  deviceName = 'E2E 手机'
): Promise<{ connection: PeerConnection; serviceIdentity: any }> {
  const raw = net.connect(port, '127.0.0.1')
  await once(raw, 'connect')
  raw.write(
    `${JSON.stringify({
      id: Date.now(),
      type: 'kdeconnect.identity',
      body: {
        deviceId: peer.deviceId,
        deviceName,
        protocolVersion: 8,
        targetDeviceId: serviceDeviceId,
        targetProtocolVersion: 8
      }
    })}\n`
  )
  raw.pause()
  const socket = new tls.TLSSocket(raw, {
    isServer: true,
    secureContext: peer.context,
    requestCert: true,
    rejectUnauthorized: false
  })
  raw.resume()
  await once(socket, 'secure')
  socket.write(
    `${JSON.stringify({
      id: Date.now(),
      type: 'kdeconnect.identity',
      body: {
        deviceId: peer.deviceId,
        deviceName,
        deviceType: 'phone',
        protocolVersion: 8,
        incomingCapabilities: [
          'kdeconnect.clipboard',
          'kdeconnect.clipboard.connect',
          'kdeconnect.clipboard.file',
          'kdeconnect.share.request',
          'kdeconnect.share.request.update'
        ],
        outgoingCapabilities: [
          'kdeconnect.clipboard',
          'kdeconnect.clipboard.connect',
          'kdeconnect.clipboard.file',
          'kdeconnect.share.request',
          'kdeconnect.share.request.update'
        ]
      }
    })}\n`
  )
  const serviceIdentity = JSON.parse(await readLine(socket))
  const connection = new PeerConnection(socket)
  // readLine 为保留同批数据会暂停套接字，交接给连接对象后恢复读取。
  socket.resume()
  return { connection, serviceIdentity }
}

/**
 * 启动测试设备的载荷服务并回传内容。
 * @param peer 测试设备。
 * @param payload 待发送内容。
 * @returns 端口与完成信号。
 */
async function startPeerPayloadServer(
  peer: PeerContext,
  payload: Buffer
): Promise<{ port: number; done: Promise<void> }> {
  let resolveDone: () => void = () => undefined
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })
  const server = tls.createServer(
    {
      key: peer.privateKeyPem,
      cert: peer.certificatePem,
      requestCert: true,
      rejectUnauthorized: false
    },
    (socket) => {
      socket.on('error', () => undefined)
      // 与真实发送端一致：握手完成后稍等再写入，避免同一 tick 内写完并关闭。
      setTimeout(() => socket.end(payload, () => resolveDone()), 100)
    }
  )
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address() as net.AddressInfo
  void done.finally(() => server.close())
  return { port: address.port, done }
}

/**
 * 从服务的载荷服务下载文件。
 * @param peer 测试设备。
 * @param port 载荷端口。
 * @returns 收到的字节。
 */
async function downloadPayload(peer: PeerContext, port: number): Promise<Buffer> {
  const socket = tls.connect({
    host: '127.0.0.1',
    port,
    key: peer.privateKeyPem,
    cert: peer.certificatePem,
    requestCert: true,
    rejectUnauthorized: false
  })
  socket.on('error', () => undefined)
  const chunks: Buffer[] = []
  socket.on('data', (chunk: Buffer) => chunks.push(chunk))
  await once(socket, 'end', 15000)
  return Buffer.concat(chunks)
}

/**
 * 等待出现包含指定文本的 data URL 页面，用于区分进度窗与设备选择窗。
 * @param app 已启动的 Electron 应用。
 * @param text 页面中应出现的文本。
 * @param timeout 最长等待时间。
 * @returns 匹配页面；超时返回 undefined。
 */
async function findDataPageWithText(
  app: ElectronApplication,
  text: string,
  timeout = 10000
): Promise<Page | undefined> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const page of app.context().pages()) {
      if (!page.url().startsWith('data:text/html')) continue
      try {
        if (await page.getByText(text).count()) return page
      } catch {
        // 页面仍在加载时继续等待。
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return undefined
}

test('互联服务完成配对、剪贴板同步、双向文件传输并显示进度', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(180000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-interconnect-e2e-'))
  const receiveDir = path.join(temporary, 'received')
  const sendFile = path.join(temporary, 'send-me.txt')
  const sendContent = `TabDo interconnect ${'x'.repeat(256 * 1024)}`
  await fs.writeFile(sendFile, sendContent)
  let application: ElectronApplication | undefined
  let connection: PeerConnection | undefined
  let secondConnection: PeerConnection | undefined
  const logs: string[] = []
  try {
    const environment = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_SOURCE_PREVIEW: '1',
      TABDO_PREVIEW_OPEN_SETTINGS: '1',
      TABDO_DATA_ROOT: path.join(temporary, 'data'),
      TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
      TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
    }
    delete environment.ELECTRON_RUN_AS_NODE
    application = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env: environment
    })
    const app = application
    const main = await app.firstWindow()
    await expect(main.locator('.plugin-host')).toBeAttached({ timeout: 20000 })
    app.process().stdout?.on('data', (data) => logs.push(String(data)))
    app.process().stderr?.on('data', (data) => logs.push(String(data)))

    await expect
      .poll(
        () =>
          app
            .context()
            .pages()
            .some((page) => page.url().startsWith('http://127.0.0.1:15177')),
        { timeout: 20000 }
      )
      .toBe(true)
    const settings = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15177'))!
    await settings.locator('.settings-sidebar').getByRole('button', { name: '互联服务' }).click()
    await expect(settings.getByText('启用互联服务')).toBeVisible({ timeout: 15000 })
    await expect(settings.getByText('服务未启动')).toBeVisible()

    // 启用服务并读取本机身份。
    await settings
      .locator('.card .toggle input')
      .first()
      .evaluate((element) => {
        ;(element as HTMLInputElement).click()
      })
    await expect(settings.getByText('运行中', { exact: false }).first()).toBeVisible({
      timeout: 15000
    })
    const enabledState = await settings.evaluate(
      async () => await window.tabdo.internal.interconnectGetState()
    )
    expect(enabledState.success).toBe(true)
    const serviceDeviceId = enabledState.state!.status.deviceId
    const tcpPort = enabledState.state!.status.tcpPort
    expect(serviceDeviceId).toMatch(/^[a-f0-9]{32}$/)
    expect(tcpPort).toBeGreaterThanOrEqual(1716)
    expect(tcpPort).toBeLessThanOrEqual(1764)
    expect(enabledState.state!.status.fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)

    await settings.evaluate(
      async (directory) =>
        await window.tabdo.internal.interconnectSaveConfig({ downloadDir: directory }),
      receiveDir
    )
    await expect
      .poll(async () => {
        const state = await settings.evaluate(
          async () => await window.tabdo.internal.interconnectGetState()
        )
        return state.state!.config.downloadDir
      })
      .toBe(receiveDir)

    // 系统通知开关写入配置，显式关闭后仍保留，重新开启恢复默认行为。
    const notificationToggle = settings
      .locator('.setting-item', { hasText: '系统通知' })
      .locator('input[type="checkbox"]')
    await notificationToggle.evaluate((element) => {
      ;(element as HTMLInputElement).click()
    })
    await expect
      .poll(async () => {
        const state = await settings.evaluate(
          async () => await window.tabdo.internal.interconnectGetState()
        )
        return state.state!.config.notifications
      })
      .toBe(false)
    await notificationToggle.evaluate((element) => {
      ;(element as HTMLInputElement).click()
    })
    await expect
      .poll(async () => {
        const state = await settings.evaluate(
          async () => await window.tabdo.internal.interconnectGetState()
        )
        return state.state!.config.notifications
      })
      .toBe(true)

    // 模拟手机发起连接并请求配对。
    const peer = createPeer('p'.repeat(32))
    const connected = await connectPeer(tcpPort, peer, serviceDeviceId)
    connection = connected.connection
    expect(connected.serviceIdentity.body.deviceName).toBeTruthy()
    connection.send('kdeconnect.pair', { pair: true, timestamp: Math.floor(Date.now() / 1000) })
    await expect
      .poll(async () => {
        const state = await settings.evaluate(
          async () => await window.tabdo.internal.interconnectGetState()
        )
        return state.state!.devices.some((device) => device.pendingPair)
      })
      .toBe(true)
    await expect(settings.getByText('收到配对请求')).toBeVisible({ timeout: 15000 })
    await settings.getByRole('button', { name: '接受', exact: true }).click()
    await expect(settings.getByText('E2E 手机').first()).toBeVisible()
    await expect(settings.getByText('已配对').first()).toBeVisible()

    // 真实 KDE Connect 客户端收到发现广播后会重建链路并先关闭旧 socket。
    // 服务必须在新链路完成握手后直接接管，且替换过程中不得向界面推送离线状态。
    await settings.evaluate((deviceId) => {
      const scope = window as unknown as {
        __interconnectReachable: boolean[]
        __interconnectUnsubscribe?: () => void
        tabdo: {
          internal: {
            onInterconnectState: (
              callback: (state: { devices: { id: string; reachable: boolean }[] }) => void
            ) => () => void
          }
        }
      }
      scope.__interconnectReachable = []
      scope.__interconnectUnsubscribe = scope.tabdo.internal.onInterconnectState((state) => {
        const device = state.devices.find((item) => item.id === deviceId)
        if (device) scope.__interconnectReachable.push(device.reachable)
      })
    }, peer.deviceId)
    const replacement = await connectPeer(tcpPort, peer, serviceDeviceId)
    const replacementConnection = replacement.connection
    await connection.waitForClose()
    await expect
      .poll(async () => {
        const state = await settings.evaluate(
          async () => await window.tabdo.internal.interconnectGetState()
        )
        return state.state!.devices.find((device) => device.id === peer.deviceId)?.reachable
      })
      .toBe(true)
    // 留出事件投递时间，确认替换期间没有离线状态被推送到界面。
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(
      await settings.evaluate(
        () => (window as unknown as { __interconnectReachable: boolean[] }).__interconnectReachable
      )
    ).not.toContain(false)
    await settings.evaluate(() => {
      const scope = window as unknown as { __interconnectUnsubscribe?: () => void }
      scope.__interconnectUnsubscribe?.()
    })
    connection = replacementConnection

    // 主动剪贴板同步。
    await app.evaluate(({ clipboard }) => clipboard.writeText('E2E clipboard'))
    const syncResult = await settings.evaluate(
      async (deviceId) => await window.tabdo.internal.interconnectSyncClipboard(deviceId),
      peer.deviceId
    )
    expect(syncResult.success).toBe(true)
    const clipboardPacket = await connection.waitFor(
      'kdeconnect.clipboard',
      (packet) => packet.body.content === 'E2E clipboard'
    )
    expect(clipboardPacket.body.content).toBe('E2E clipboard')

    // “互联传输”文本匹配会先刷新设备列表，再把选中文本推送一次。
    const commandResult = await app.evaluate(async ({ app: electronApp }) => {
      const service = process.mainModule!.require(
        electronApp.getAppPath() + '/src/main/core/interconnect/service.ts'
      ).default
      return service.transferFromInput({ type: 'over', payload: 'Command clipboard' })
    })
    expect(commandResult.success).toBe(true)
    const commandPacket = await connection.waitFor(
      'kdeconnect.clipboard',
      (packet) => packet.body.content === 'Command clipboard'
    )
    expect(commandPacket.body.content).toBe('Command clipboard')

    // 服务发送文件，手机作为 TLS 客户端下载载荷。
    const sendResult = await app.evaluate(
      async ({ app: electronApp }, payload) => {
        const service = process.mainModule!.require(
          electronApp.getAppPath() + '/src/main/core/interconnect/service.ts'
        ).default
        return service.sendFiles([payload.filePath], payload.deviceId)
      },
      { filePath: sendFile, deviceId: peer.deviceId }
    )
    expect(sendResult.success).toBe(true)
    const sharePacket = await connection.waitFor('kdeconnect.share.request')
    expect(sharePacket.body.filename).toBe('send-me.txt')
    // 不向 KDE Connect 等接收端声明原文件时间，避免对方还原旧修改日期。
    expect(sharePacket.body.lastModified).toBeUndefined()
    expect(sharePacket.body.creationTime).toBeUndefined()
    const payloadPort = Number(sharePacket.payloadTransferInfo?.port)
    expect(payloadPort).toBeGreaterThan(0)

    // 进度窗在任务创建时出现，先核对发送状态再让接收方下载载荷。
    await expect
      .poll(() => app.windows().some((page) => page.url().startsWith('data:text/html')), {
        timeout: 10000
      })
      .toBe(true)
    const progress = app.windows().find((page) => page.url().startsWith('data:text/html'))!
    await expect(progress.getByText('E2E 手机')).toBeVisible({ timeout: 10000 })
    await expect(progress.getByText('send-me.txt')).toBeVisible({ timeout: 10000 })
    await progress.screenshot({ path: testInfo.outputPath('interconnect-progress.png') })

    const downloaded = await downloadPayload(peer, payloadPort)
    expect(downloaded.toString('utf8')).toBe(sendContent)

    await expect
      .poll(async () => {
        const state = await settings.evaluate(
          async () => await window.tabdo.internal.interconnectGetState()
        )
        return state.state!.transfers.find((item) => item.direction === 'send')?.status
      })
      .toBe('done')
    // 成功的发送任务在面板提供文件定位入口。
    await expect(progress.getByText('打开位置').first()).toBeVisible({ timeout: 10000 })
    await progress.screenshot({ path: testInfo.outputPath('interconnect-progress-done.png') })

    // 面板可清空已完成记录，不删除已落盘文件，也不影响随后到达的新任务。
    const clearButton = progress.getByRole('button', { name: '清空记录', exact: true })
    await expect(clearButton).toBeEnabled()
    await clearButton.click()
    await expect(progress.getByText('暂无传输任务')).toBeVisible({ timeout: 10000 })
    await expect
      .poll(async () => {
        const state = await settings.evaluate(
          async () => await window.tabdo.internal.interconnectGetState()
        )
        return state.state!.transfers.length
      })
      .toBe(0)
    await progress.screenshot({ path: testInfo.outputPath('interconnect-progress-cleared.png') })
    expect(await fs.readFile(sendFile, 'utf8')).toBe(sendContent)

    // 手机发送文件，服务写入配置的默认接收文件夹。
    const receiveContent = Buffer.from('from peer to TabDo')
    const payloadServer = await startPeerPayloadServer(peer, receiveContent)
    connection.send(
      'kdeconnect.share.request',
      {
        filename: 'from-peer.txt',
        // 远端声明的历史修改时间不应带到本机落点。
        lastModified: new Date('2001-02-03T04:05:06Z').getTime(),
        open: false
      },
      { payloadSize: receiveContent.length, payloadTransferInfo: { port: payloadServer.port } }
    )
    await payloadServer.done
    // 以宿主记录的落点和文件名读取，兼容同名文件的自动避让后缀。
    let receivedPath = ''
    await expect
      .poll(
        async () => {
          const state = await settings.evaluate(
            async () => await window.tabdo.internal.interconnectGetState()
          )
          const transfer = state.state!.transfers.find(
            (item) => item.direction === 'receive' && item.status === 'done'
          )
          if (!transfer?.destinationDir || !transfer.files[0]) return ''
          receivedPath = path.join(transfer.destinationDir, transfer.files[0].name)
          return receivedPath
        },
        { timeout: 10000 }
      )
      .not.toBe('')
    await expect
      .poll(async () => await fs.readFile(receivedPath, 'utf8'))
      .toBe('from peer to TabDo')
    // 接收文件使用当前时间，不保留发送方的旧修改时间。
    const receivedStat = await fs.stat(receivedPath)
    expect(Date.now() - receivedStat.mtimeMs).toBeLessThan(5 * 60 * 1000)

    // 设置页不再展示发送与接收记录，任务改由互联传输面板承担。
    await expect(settings.getByText('暂无传输任务')).toHaveCount(0)

    // 多台已配对设备同时在线时，互联传输先让用户选择目标设备。
    const secondPeer = createPeer('q'.repeat(32))
    const connectedSecond = await connectPeer(tcpPort, secondPeer, serviceDeviceId, 'E2E 平板')
    secondConnection = connectedSecond.connection
    await settings.evaluate(
      async () => await window.tabdo.internal.interconnectSaveConfig({ autoAcceptPairing: true })
    )
    secondConnection.send('kdeconnect.pair', {
      pair: true,
      timestamp: Math.floor(Date.now() / 1000)
    })
    await expect
      .poll(async () => {
        const state = await settings.evaluate(
          async () => await window.tabdo.internal.interconnectGetState()
        )
        return state.state!.devices.find((device) => device.id === secondPeer.deviceId)?.paired
      })
      .toBe(true)
    // 恢复默认设置，避免把测试偏好留给后续人工验收。
    await settings.evaluate(
      async () => await window.tabdo.internal.interconnectSaveConfig({ autoAcceptPairing: false })
    )

    const choicePromise = app.evaluate(
      async ({ app: electronApp }, payload) => {
        const service = process.mainModule!.require(
          electronApp.getAppPath() + '/src/main/core/interconnect/service.ts'
        ).default
        return service.transferFromInput({ type: 'files', payload: [{ path: payload.filePath }] })
      },
      { filePath: sendFile }
    )
    const chooser = await findDataPageWithText(app, '选择接收设备', 15000)
    expect(chooser).toBeTruthy()
    await chooser!.getByRole('button', { name: /E2E 平板/ }).click()
    const choiceResult = await choicePromise
    expect(choiceResult.success).toBe(true)
    expect(choiceResult.deviceId).toBe(secondPeer.deviceId)
    const secondShare = await secondConnection.waitFor('kdeconnect.share.request')
    const secondPort = Number(secondShare.payloadTransferInfo?.port)
    expect(secondPort).toBeGreaterThan(0)
    const secondDownloaded = await downloadPayload(secondPeer, secondPort)
    expect(secondDownloaded.toString('utf8')).toBe(sendContent)

    // 设置页回到顶部，核对文件传输板块只保留配置项。
    await settings.evaluate(() => {
      const panel = document.querySelector('.content-panel')
      if (panel) panel.scrollTop = 0
    })
    await settings.screenshot({ path: testInfo.outputPath('interconnect-settings.png') })
    // 单独截取文件传输卡片，确认记录列表已移除且说明文本不溢出。
    await settings.evaluate(() => {
      const panel = document.querySelector('.content-panel')
      const card = document.querySelectorAll('.content-panel .card')[1] as HTMLElement | undefined
      if (panel && card) panel.scrollTop = Math.max(0, card.offsetTop - 16)
    })
    await settings.screenshot({ path: testInfo.outputPath('interconnect-settings-transfer.png') })

    // 离线设备也必须能手动移出列表，覆盖重启后仅恢复信任记录与本次发现后断开的两种情况。
    secondConnection.close()
    await expect
      .poll(async () => {
        const state = await settings.evaluate(
          async () => await window.tabdo.internal.interconnectGetState()
        )
        return state.state!.devices.find((device) => device.id === secondPeer.deviceId)?.reachable
      })
      .toBe(false)
    // 删除本次运行记录，模拟只从持久化信任恢复、已无法再发现的失效条目。
    await app.evaluate(({ app: electronApp }, deviceId) => {
      const service = process.mainModule!.require(
        electronApp.getAppPath() + '/src/main/core/interconnect/service.ts'
      ).default
      service.devices.delete(deviceId)
    }, secondPeer.deviceId)
    const staleRow = settings.locator('.device-row').filter({ hasText: 'E2E 平板' })
    await staleRow.getByRole('button', { name: '取消配对', exact: true }).click()
    await expect(staleRow).toHaveCount(0)
    await expect
      .poll(async () => {
        const state = await settings.evaluate(
          async () => await window.tabdo.internal.interconnectGetState()
        )
        return state.state!.devices.some((device) => device.id === secondPeer.deviceId)
      })
      .toBe(false)

    connection.close()
    await expect
      .poll(async () => {
        const state = await settings.evaluate(
          async () => await window.tabdo.internal.interconnectGetState()
        )
        return state.state!.devices.find((device) => device.id === peer.deviceId)?.reachable
      })
      .toBe(false)
    const offlineRow = settings.locator('.device-row').filter({ hasText: 'E2E 手机' })
    await offlineRow.getByRole('button', { name: '取消配对', exact: true }).click()
    await expect(offlineRow).toHaveCount(0)

    await settings
      .locator('.card .toggle input')
      .first()
      .evaluate((element) => {
        ;(element as HTMLInputElement).click()
      })
    await expect(settings.getByText('服务未启动')).toBeVisible({ timeout: 15000 })
  } finally {
    connection?.close()
    secondConnection?.close()
    await fs.writeFile(testInfo.outputPath('interconnect.log'), logs.join(''))
    await application?.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
