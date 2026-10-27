import { expect, test, _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('builtin providers configure in settings, reuse AI, download safely and release tool processes', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(150_000)
  const root = path.resolve(__dirname, '../..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-builtin-providers-'))
  let application: ElectronApplication | undefined
  try {
    const environment = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_SOURCE_PREVIEW: '1',
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
    await expect
      .poll(
        () =>
          app
            .context()
            .pages()
            .some((page) => page.url().startsWith('http://127.0.0.1:15177')),
        { timeout: 30_000 }
      )
      .toBe(true)
    const settings = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15177'))!
    await expect(settings.getByText('鼠标按键弹出', { exact: true })).toBeVisible()
    await expect(settings.getByText('启用超级面板', { exact: true })).toHaveCount(0)
    await expect(settings.getByText('按下鼠标中键', { exact: true })).toBeVisible()
    expect(
      await app.evaluate(({ app }) => {
        const load = (file: string): any =>
          process.mainModule!.require(app.getAppPath() + '/src/main/' + file).default
        return {
          config: load('core/superPanelManager.ts').config,
          detached: load('api/shared/database.ts').dbGet('auto-detach-plugin'),
          kill: load('api/shared/database.ts').dbGet('out-kill-plugin')
        }
      })
    ).toMatchObject({
      config: { enabled: true, mouseButton: 'middle', longPressMs: 0 },
      detached: ['setting'],
      kill: ['setting']
    })

    const automaticTranslation = settings.getByLabel('选中文本自动翻译', { exact: true })
    await expect(automaticTranslation).toBeChecked()
    await automaticTranslation.locator('..').click()
    await expect
      .poll(() =>
        settings.evaluate(
          async () =>
            (await window.tabdo.internal.dbGet('settings-general')).superPanelAutoTranslate
        )
      )
      .toBe(false)
    const disabledCalls = await app.evaluate(async ({ app }) => {
      const load = (file: string): any =>
        process.mainModule!.require(app.getAppPath() + '/src/main/' + file).default
      const provider = load('core/provider/providerManager.ts'),
        original = provider.invoke
      let calls = 0
      provider.invoke = async () => {
        calls++
        return { text: 'should not display' }
      }
      try {
        await load('core/superPanelManager.ts').requestTranslation('disabled selection')
      } finally {
        provider.invoke = original
      }
      return calls
    })
    expect(disabledCalls).toBe(0)
    await automaticTranslation.locator('..').click()
    await expect
      .poll(() =>
        settings.evaluate(
          async () =>
            (await window.tabdo.internal.dbGet('settings-general')).superPanelAutoTranslate
        )
      )
      .toBe(true)
    await settings.getByRole('button', { name: '已安装插件', exact: true }).click()
    await expect(settings.locator('.plugin-item')).toHaveCount(0)
    await settings.getByRole('button', { name: '提供商', exact: true }).click()
    await settings.getByRole('button', { name: '翻译', exact: true }).click()
    await expect(settings.getByRole('heading', { name: '离线翻译引擎', exact: true })).toBeVisible()
    await expect(settings.getByText('离线翻译引擎（内置）')).toHaveCount(0)
    await expect(settings.locator('.capability-card')).toHaveCount(3)
    await settings.getByLabel('在线翻译服务').selectOption('builtin-baidu')
    const baidu = settings.locator('[data-provider="builtin-baidu"]')
    await baidu.getByLabel('AppID', { exact: true }).fill('test-app')
    await baidu.getByLabel('AppKey', { exact: true }).fill('test-secret')
    await expect(baidu.getByLabel('源语言', { exact: true })).toHaveValue('auto')
    await expect(baidu.getByLabel('目标语言', { exact: true })).toHaveValue('zh-CN')
    await baidu.getByLabel('源语言', { exact: true }).selectOption('ja')
    await baidu.getByLabel('目标语言', { exact: true }).selectOption('en')
    await baidu.getByRole('button', { name: '保存配置' }).click()
    await expect
      .poll(() =>
        settings.evaluate(
          async () =>
            (await window.tabdo.internal.providers.getSettings()).data!.params['builtin-baidu']
              .appID
        )
      )
      .toBe('test-app')

    expect(
      await settings.evaluate(
        async () =>
          (await window.tabdo.internal.providers.getSettings()).data!.params['builtin-baidu']
      )
    ).toMatchObject({ from: 'ja', to: 'en' })
    await settings.getByLabel('在线翻译服务').selectOption('builtin-google')
    await expect(settings.getByLabel('源语言', { exact: true })).toHaveValue('auto')
    await expect(settings.getByLabel('目标语言', { exact: true })).toHaveValue('zh-CN')
    await settings.getByLabel('在线翻译服务').selectOption('builtin-baidu')
    await expect(baidu.getByLabel('目标语言', { exact: true })).toHaveValue('en')
    // 使用本机 HTTP 夹具验证真实宿主 AI 适配器，绝不调用真实付费模型。
    await app.evaluate(async ({ app, net }) => {
      const load = (file: string): any =>
        process.mainModule!.require(app.getAppPath() + '/src/main/' + file).default
      const http = process.mainModule!.require('node:http')
      const server = http.createServer((request, response) => {
        let body = ''
        request.on('data', (chunk) => {
          body += chunk
        })
        request.on('end', () => {
          const input = JSON.parse(body)
          ;(globalThis as any).__providerAiInput = input
          const system = input.messages[0].content
          const content = system.includes('LaTeX')
            ? 'x+y=2'
            : system.includes('识别')
              ? 'AI 识别夹具结果'
              : '你好，世界'
          if ((globalThis as any).__providerAiDelay) awaitDelay()
          else finish()
          /**
           * 延迟夹具响应，以验证取消和换图后的迟到结果。
           * @returns 无返回值。
           */
          function awaitDelay(): void {
            setTimeout(finish, 600)
          }
          /**
           * 返回确定结果，并标记服务端已结束响应。
           * @returns 无返回值。
           */
          function finish(): void {
            ;(globalThis as any).__providerAiSettled = true
            if ((globalThis as any).__providerAiFail) {
              response.statusCode = 400
              response.end(JSON.stringify({ error: { message: '夹具翻译失败' } }))
              return
            }
            response.setHeader('Content-Type', 'application/json')
            response.end(
              JSON.stringify({
                choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }]
              })
            )
          }
        })
      })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      ;(globalThis as any).__providerAiServer = server
      load('api/shared/database.ts').dbPut('ai-models', {
        version: 2,
        providers: [
          {
            id: 'fixture-ai',
            name: 'Fixture AI',
            apiUrl: `http://127.0.0.1:${server.address().port}/v1`,
            apiKey: 'local-fixture',
            apiFormat: 'openai-chat',
            enabled: true,
            selectedModels: [
              {
                ref: 'fixture-vision',
                modelId: 'fixture-model',
                inputModalities: ['text', 'image']
              }
            ]
          }
        ]
      })

      // 用带真实 SHA 的微型归档覆盖网络传输，验证安装/校验/删除和进程树退出。
      const AdmZip = process.mainModule!.require(app.getAppPath() + '/node_modules/adm-zip')
      const zip = new AdmZip()
      const nativeIndex = `const {spawn}=require('node:child_process'); module.exports={init(){},async ocr(){const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:'ignore',windowsHide:true}); return {ok:true,lines:[{text:'离线识别成功|'+process.pid+'|'+child.pid,left:0,top:0,right:0,bottom:0,rate:1},{text:'HELLO WORLD',left:60,top:40,right:600,bottom:100,rate:1},{text:'SECOND LINE',left:60,top:150,right:600,bottom:210,rate:1}]};},dispose(){}}`
      zip.addFile('native/index.js', Buffer.from(nativeIndex))
      for (const name of [
        'build/Release/wechat_ocr.node',
        'wco_data/WeChatOCR.exe',
        'wco_data/mmmojo_64.dll'
      ])
        zip.addFile('native/' + name, Buffer.from('fixture'))
      const buffer = zip.toBuffer()
      const digest = process
        .mainModule!.require('node:crypto')
        .createHash('sha256')
        .update(buffer)
        .digest('hex')
      const assets = load('core/provider/modelAssets.ts')
      assets.archives.wechat = [{ file: 'native-win.zip', digest }]
      let fail = true
      const original = net.fetch.bind(net)
      net.fetch = ((url, options) => {
        if (String(url).endsWith('/native-win.zip')) {
          if (fail) {
            fail = false
            return Promise.resolve(new Response('corrupt'))
          }
          return Promise.resolve(new Response(new Uint8Array(buffer)))
        }
        return original(url, options)
      }) as typeof net.fetch
    })
    const aiTranslation = settings.locator('[data-provider="builtin-ai-translation"]')
    await aiTranslation.locator('.toggle').click()
    await aiTranslation.getByRole('button', { name: '设为默认' }).click()
    await settings.getByRole('button', { name: 'OCR', exact: true }).click()
    const aiOcr = settings.locator('[data-provider="builtin-ai-ocr"]')
    await expect(aiOcr.getByRole('heading', { name: 'AI OCR' })).toBeVisible()
    await expect(aiOcr.locator('input:not([type=checkbox]), select, textarea')).toHaveCount(0)
    await aiOcr.locator('.toggle').click()
    const wechat = settings.locator('[data-provider="builtin-wechat-ocr"]')
    await wechat.locator('.toggle').click()
    await expect(wechat.getByText(/校验失败/)).toBeVisible()
    await wechat.getByRole('button', { name: '重试下载' }).click()
    await expect(wechat.getByText('资源已安装，使用时加载引擎')).toBeVisible({ timeout: 15_000 })
    await wechat.getByRole('button', { name: '设为默认' }).click()
    await expect(wechat.getByRole('heading', { name: '离线OCR引擎', exact: true })).toBeVisible()
    const offlineFormula = settings.locator('[data-provider="builtin-latex"]')
    await expect(offlineFormula.getByRole('button', { name: '设为默认' })).toBeDisabled()
    const aiFormula = settings.locator('[data-provider="builtin-ai-latex"]')
    await aiFormula.locator('.toggle').click()
    await aiFormula.getByRole('button', { name: '设为默认' }).click()
    await expect(aiFormula.getByRole('button', { name: '默认', exact: true })).toBeVisible()
    expect(
      await settings.evaluate(
        async () => (await window.tabdo.internal.providers.getSettings()).data?.defaultId
      )
    ).toMatchObject({
      ocr: 'builtin-wechat-ocr',
      formula: 'builtin-ai-latex'
    })
    await expect(settings.getByRole('heading', { name: '离线公式识别引擎' })).toBeVisible()
    await expect(settings.getByRole('heading', { name: '图片上传通道' })).toBeVisible()
    await settings.evaluate(() => {
      document.documentElement.setAttribute('data-material', 'none')
      document.body.style.background = 'var(--bg-color)'
    })
    await fs.writeFile(
      testInfo.outputPath('ocr-providers.png'),
      Buffer.from(
        await app.evaluate(async ({ webContents }) =>
          (
            await webContents
              .getAllWebContents()
              .find((contents) => contents.getURL().startsWith('http://127.0.0.1:15177'))!
              .capturePage()
          )
            .toPNG()
            .toString('base64')
        ),
        'base64'
      )
    )

    const plugin = await main.evaluate(
      async () => (await window.tabdo.getAllPlugins()).find((entry) => entry.name === 'system')!
    )
    const serialized = JSON.stringify(plugin.features)
    for (const removed of [
      '截图识别公式',
      '截图识别并翻译',
      '截图识别文字',
      'TabDo 提供商',
      '代码翻译',
      '代码命名',
      '文本翻译',
      '识别图片并翻译'
    ])
      expect(serialized).not.toContain(removed)
    for (const featureCode of [
      'translate',
      'code-translate',
      'ocr-translate',
      'screen-ocr-translate'
    ]) {
      expect(
        await main.evaluate(
          ({ plugin, featureCode }) =>
            window.tabdo.launch({ path: plugin.path, type: 'plugin', featureCode }),
          { plugin, featureCode }
        )
      ).toMatchObject({ success: false, error: expect.stringContaining('该指令已移除') })
    }
    await main.evaluate(
      (plugin) =>
        window.tabdo.launch({
          path: plugin.path,
          type: 'plugin',
          featureCode: 'recognize',
          name: '文字识别'
        }),
      plugin
    )
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    let tools = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15178'))!
    /**
     * 直接截取工具 WebContents 当前可见区域，透明底色在测试中设为当前主题实色。
     * @param name 输出截图文件名。
     * @returns 截图保存结束后的 Promise。
     */
    async function captureTools(name: string): Promise<void> {
      await tools.evaluate(() => {
        document.documentElement.setAttribute('data-material', 'none')
        document.body.style.background = matchMedia('(prefers-color-scheme: dark)').matches
          ? '#202020'
          : '#ffffff'
      })
      await fs.writeFile(
        testInfo.outputPath(name),
        Buffer.from(
          await app.evaluate(async ({ webContents }) =>
            (
              await webContents
                .getAllWebContents()
                .find((contents) => contents.getURL().startsWith('http://127.0.0.1:15178'))!
                .capturePage()
            )
              .toPNG()
              .toString('base64')
          ),
          'base64'
        )
      )
    }
    await expect(tools.getByRole('button', { name: '重新识别' })).toBeVisible()
    await expect(tools.getByRole('navigation').getByRole('button')).toHaveCount(2)
    await expect(tools.getByText('文本翻译', { exact: true })).toHaveCount(0)
    await expect(tools.getByText('代码命名', { exact: true })).toHaveCount(0)
    const image = await tools.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 1200
      canvas.height = 300
      const context = canvas.getContext('2d')!
      context.fillStyle = 'white'
      context.fillRect(0, 0, 1200, 300)
      context.fillStyle = 'black'
      context.font = '60px monospace'
      context.fillText('HELLO WORLD', 60, 100)
      context.fillText('SECOND LINE', 60, 210)
      return canvas.toDataURL()
    })
    await tools.locator('input[type=file]').setInputFiles({
      name: 'fixture.png',
      mimeType: 'image/png',
      buffer: Buffer.from(image.split(',')[1], 'base64')
    })
    await expect(tools.getByLabel('处理结果')).toHaveValue(
      /离线识别成功\|\d+\|\d+\nHELLO WORLD\nSECOND LINE/
    )
    const pids = (await tools.getByLabel('处理结果').inputValue())
      .split('\n')[0]
      .split('|')
      .slice(1)
      .map(Number)
    expect(
      await app.evaluate(
        (_electron, pids) =>
          pids.map((pid) => {
            try {
              process.kill(pid, 0)
              return true
            } catch {
              return false
            }
          }),
        pids
      )
    ).toEqual([false, false])
    // 坐标使用原图像素，在缩小和放大后均与底图对齐。
    await expect(tools.locator('.ocr-box')).toHaveCount(2)
    const firstBox = tools.locator('.ocr-box[data-line="1"]')
    const originalRatio = await firstBox.evaluate(
      (box) =>
        box.getBoundingClientRect().width /
        document.querySelector('.image-layer img')!.getBoundingClientRect().width
    )
    expect(originalRatio).toBeCloseTo(540 / 1200, 3)
    await tools.getByRole('button', { name: '放大图片' }).click()
    expect(
      await firstBox.evaluate(
        (box) =>
          box.getBoundingClientRect().width /
          document.querySelector('.image-layer img')!.getBoundingClientRect().width
      )
    ).toBeCloseTo(originalRatio, 3)
    await tools.getByRole('button', { name: '适应宽度' }).click()
    await firstBox.click()
    await expect(tools.getByLabel('图上选中文字')).toHaveValue('HELLO WORLD')
    await captureTools('ocr-coordinate-selection.png')
    await tools.getByRole('button', { name: '翻译', exact: true }).click()
    await expect(tools.getByLabel('翻译结果', { exact: true })).toHaveValue('你好，世界')
    expect(await app.evaluate(() => (globalThis as any).__providerAiInput.messages)).toMatchObject([
      { role: 'system', content: expect.stringMatching(/auto.*zh-CN/) },
      { role: 'user', content: 'HELLO WORLD' }
    ])
    await expect(tools.getByLabel('处理结果')).toHaveValue(/HELLO WORLD\nSECOND LINE/)
    await expect(tools.locator('.ocr-box')).toHaveCount(2)
    await tools.getByRole('button', { name: '清除选区' }).click()
    // 用真实鼠标拖选一部分透明文字，验证无需整行复制。
    await firstBox.scrollIntoViewIfNeeded()
    const rect = (await firstBox.boundingBox())!
    await tools.mouse.move(rect.x + 2, rect.y + rect.height / 2)
    await tools.mouse.down()
    await tools.mouse.move(rect.x + rect.width * 0.44, rect.y + rect.height / 2, { steps: 12 })
    await tools.mouse.up()
    await expect(tools.getByLabel('图上选中文字')).toHaveValue(/^HELLO ?$/)
    await tools.getByRole('button', { name: '复制选中文字' }).click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('HELLO')
    await tools.getByRole('button', { name: '清除选区' }).click()
    await tools.locator('.line-details summary').click()
    await expect(tools.getByText('(60, 40) — (600, 100)', { exact: true })).toBeVisible()
    await tools.locator('.ocr-line').nth(1).hover()
    await expect(tools.locator('.ocr-box[data-line="2"]')).toHaveClass(/active/)
    await tools.locator('.line-details summary').click()
    await tools.getByRole('button', { name: '翻译', exact: true }).click()
    await expect(tools.getByLabel('翻译结果', { exact: true })).toHaveValue('你好，世界')
    expect(
      await app.evaluate(() => (globalThis as any).__providerAiInput.messages[1].content)
    ).toContain('HELLO WORLD\nSECOND LINE')
    await tools.getByLabel('翻译结果', { exact: true }).scrollIntoViewIfNeeded()
    await captureTools('ocr-translation-result.png')
    // 翻译失败不清除原文与坐标；关闭故障后可直接重试。
    await app.evaluate(() => {
      ;(globalThis as any).__providerAiFail = true
    })
    await tools.getByRole('button', { name: '翻译', exact: true }).click()
    await expect(tools.getByRole('status')).toContainText(/夹具翻译失败|400/)
    await expect(tools.getByLabel('处理结果')).toHaveValue(/HELLO WORLD/)
    await expect(tools.locator('.ocr-box')).toHaveCount(2)
    await app.evaluate(() => {
      ;(globalThis as any).__providerAiFail = false
    })
    await tools.getByRole('button', { name: '翻译', exact: true }).click()
    await expect(tools.getByLabel('翻译结果', { exact: true })).toHaveValue('你好，世界')
    // 换图取消翻译，旧服务响应完成后不得回填任何原文、坐标或译文。
    await app.evaluate(() => {
      ;(globalThis as any).__providerAiDelay = true
      ;(globalThis as any).__providerAiSettled = false
    })
    await tools.getByRole('button', { name: '翻译', exact: true }).click()
    await expect(tools.getByRole('button', { name: '正在翻译…' })).toBeVisible()
    await tools.locator('input[type=file]').setInputFiles({
      name: 'new.png',
      mimeType: 'image/png',
      buffer: Buffer.from(image.split(',')[1], 'base64')
    })
    await expect.poll(() => app.evaluate(() => (globalThis as any).__providerAiSettled)).toBe(true)
    await expect(tools.getByLabel('处理结果')).toHaveValue(/离线识别成功/)
    await expect(tools.getByLabel('翻译结果', { exact: true })).toHaveCount(0)
    await expect(tools.locator('.ocr-box')).toHaveCount(2)
    await app.evaluate(() => {
      ;(globalThis as any).__providerAiDelay = false
    })
    await tools.getByLabel('使用提供商').selectOption('builtin-ai-ocr')
    await expect(tools.getByLabel('处理结果')).toHaveValue('AI 识别夹具结果')
    expect(
      await app.evaluate(
        () => (globalThis as any).__providerAiInput.messages[1].content[1].image_url.url
      )
    ).toMatch(/^data:image/)
    await expect(tools.locator('.ocr-box')).toHaveCount(0)
    await expect(tools.getByText('当前服务未返回有效文字坐标', { exact: false })).toBeVisible()
    await tools.getByLabel('处理结果').fill('仅中文识别结果')
    await tools.getByRole('button', { name: '翻译', exact: true }).click()
    await expect(tools.getByLabel('翻译结果', { exact: true })).toHaveValue('你好，世界')
    expect(
      await app.evaluate(() => (globalThis as any).__providerAiInput.messages[0].content)
    ).toContain('zh-CN')

    // 超过离线引擎单次限制时明确提示，不静默截取前 1000 字符。
    await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/core/provider/providerManager.ts')
        .default.setEnabled('builtin-bergamot', true)
    )
    await tools.getByRole('button', { name: '刷新配置' }).click()
    await tools.getByLabel('翻译提供商').selectOption('builtin-bergamot')
    await tools.getByLabel('处理结果').fill('a'.repeat(1001))
    await tools.getByRole('button', { name: '翻译', exact: true }).click()
    await expect(tools.getByRole('status')).toContainText('单次最多处理 1000 个字符')
    await expect(tools.getByLabel('翻译结果', { exact: true })).toHaveCount(0)
    await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/core/provider/providerManager.ts')
        .default.setEnabled('builtin-bergamot', false)
    )
    // 公式识别仍使用独立模式，不显示文字翻译操作。
    expect(
      await settings.evaluate(() =>
        window.tabdo.internal.providers.setEnabled('builtin-ai-latex', true)
      )
    ).toMatchObject({ success: true })
    await tools.getByRole('button', { name: '公式识别', exact: true }).click()
    await expect(tools.getByLabel('处理结果')).toHaveValue('x+y=2')
    await expect(tools.getByLabel('公式预览').locator('.katex')).toBeVisible()
    await tools.getByLabel('处理结果').fill('\\frac{a}{b}')
    await expect(tools.getByLabel('公式预览').locator('.mfrac')).toBeVisible()
    await tools.getByRole('button', { name: '复制 $…$', exact: true }).click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('$\\frac{a}{b}$')
    await tools.locator('.result-scroll').evaluate((element) => {
      element.scrollTop = 0
    })
    await captureTools('formula-layout-preview.png')
    await expect(tools.getByRole('button', { name: '翻译', exact: true })).toHaveCount(0)
    await expect(tools.locator('.ocr-box')).toHaveCount(0)

    // 工具默认嵌入宿主，隐藏后立即销毁；重新进入不会复用旧运行时。
    await app.evaluate(({ app }) => {
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
        .default.hideWindow()
    })
    await expect.poll(() => tools.isClosed()).toBe(true)
    await main.evaluate(
      (plugin) =>
        window.tabdo.launch({
          path: plugin.path,
          type: 'plugin',
          featureCode: 'recognize',
          name: '文字识别'
        }),
      plugin
    )
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    tools = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15178'))!
    await expect(tools.getByText(/最近识别记录/)).toBeVisible()
    await app.evaluate(({ app }) =>
      process
        .mainModule!.require(app.getAppPath() + '/src/main/managers/windowManager.ts')
        .default.showSettings()
    )
    await settings.getByRole('button', { name: 'OCR', exact: true }).click()
    await wechat.getByRole('button', { name: '删除资源' }).click()
    await settings.getByRole('button', { name: '确定', exact: true }).click()
    await expect(wechat.getByText('资源未安装，启用后自动下载')).toBeVisible()
    await expect(wechat.getByRole('checkbox')).not.toBeChecked()
    expect(
      await settings.evaluate(
        async () =>
          (await window.tabdo.internal.providers.getSettings()).data!.params['builtin-baidu'].appKey
      )
    ).toBe('test-secret')
  } finally {
    if (application)
      await application
        .evaluate(() => (globalThis as any).__providerAiServer?.close())
        .catch(() => {})
    await application?.close()
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
