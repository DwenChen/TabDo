import {
  expect as playwrightExpect,
  test,
  _electron as electron,
  type ElectronApplication
} from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
const expect = playwrightExpect.configure({ timeout: 30_000 })

/**
 * 直接捕获已稳定的插件正文。
 * @param app 源码 Electron 实例。
 * @param url 插件开发服务地址。
 * @param file 自动归档中的截图路径。
 * @returns 正文截图写入完成的 Promise。
 */
async function capturePlugin(app: ElectronApplication, url: string, file: string): Promise<void> {
  const screenshot = await app.evaluate(async ({ webContents }, prefix) => {
    const view = webContents.getAllWebContents().find((entry) => entry.getURL().startsWith(prefix))!
    return (await view.capturePage()).toPNG().toString('base64')
  }, url)
  await fs.writeFile(file, Buffer.from(screenshot, 'base64'))
}

test('呼叫AI使用提供商、内置解释器、审批和提问，关闭后清理并保留产物', async ({
  browserName: _browserName
}, testInfo) => {
  test.setTimeout(180_000)
  const root = path.resolve(__dirname, '../..'),
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-call-ai-e2e-'))
  let application: ElectronApplication | undefined
  const logs: string[] = []
  try {
    const env = {
      ...process.env,
      TABDO_E2E: '1',
      TABDO_SOURCE_PREVIEW: '1',
      TABDO_PREVIEW_OPEN_SETTINGS: '1',
      TABDO_DATA_ROOT: path.join(temporary, 'data'),
      TABDO_LEGACY_USER_DATA_PATH: path.join(temporary, 'legacy'),
      ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174',
      TABDO_SETTING_DEV_SERVER_URL: 'http://127.0.0.1:15177'
    }
    delete env.ELECTRON_RUN_AS_NODE
    application = await electron.launch({
      args: [path.join(root, 'scripts/preview-main.cjs')],
      cwd: root,
      env
    })
    const app = application
    app.process().stdout?.on('data', (chunk) => logs.push(String(chunk)))
    app.process().stderr?.on('data', (chunk) => logs.push(String(chunk)))
    const main = await app.firstWindow()
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((page) => page.url().startsWith('http://127.0.0.1:15177'))
      )
      .toBe(true)
    const settings = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15177'))!
    await settings.getByRole('button', { name: '关于', exact: true }).click()
    await settings.getByRole('button', { name: '阅读本地教程' }).click()
    await settings.getByRole('button', { name: '用呼叫AI完成一次性任务' }).click()
    const artifactGuide = settings.getByText('在回复正文或末尾点击文件名', { exact: false })
    await expect(settings.getByText('拖入、粘贴文件、图片和文件夹', { exact: false })).toBeVisible()
    await expect(artifactGuide).toBeVisible()
    await artifactGuide.scrollIntoViewIfNeeded()
    await expect(artifactGuide).toBeInViewport({ ratio: 0.8 })
    await capturePlugin(app, 'http://127.0.0.1:15177', testInfo.outputPath('call-ai-guide.png'))
    await settings.getByRole('button', { name: '返回关于' }).click()
    await expect(settings.getByTestId('call-ai-setting')).toHaveCount(0)
    await settings.getByRole('button', { name: '呼叫AI', exact: true }).click()
    await expect(settings.getByTestId('call-ai-setting')).toBeVisible({ timeout: 30_000 })
    await expect(settings.getByRole('heading', { name: '呼叫AI', exact: true })).toHaveCount(0)
    const managerButtons = await settings
      .locator('.manager-actions .icon-button')
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().left))
    expect(managerButtons).toHaveLength(2)
    expect(managerButtons[0]).toBe(managerButtons[1])
    const addButtons = settings.locator('.manager-actions .accent-action')
    await expect(addButtons).toHaveText(['添加', '添加'])
    expect(
      await addButtons.evaluateAll((elements) =>
        elements.every((element) => {
          const style = getComputedStyle(element)
          const bounds = element.getBoundingClientRect()
          const text = document.createRange()
          text.selectNodeContents(element)
          const label = text.getBoundingClientRect()
          const centeredX =
            Math.abs(label.left + label.width / 2 - bounds.left - bounds.width / 2) < 1
          const centeredY =
            Math.abs(label.top + label.height / 2 - bounds.top - bounds.height / 2) < 1
          const sample = document.createElement('span')
          sample.style.color = 'var(--primary-color)'
          element.append(sample)
          const matches = style.color === getComputedStyle(sample).color && centeredX && centeredY
          sample.remove()
          return matches
        })
      )
    ).toBe(true)
    await expect(settings.getByLabel('结果产物默认位置')).toBeVisible()
    await expect(settings.getByLabel('结果产物默认位置')).toHaveValue(/[/\\]TabDo[/\\]Call_AI$/)
    await settings.getByText('运行时与额外库', { exact: true }).click()
    const runtimeRows = settings.locator('.runtime-row')
    for (const label of ['更新', '清理额外库']) {
      const buttons = runtimeRows.getByRole('button', { name: label, exact: true })
      await expect(buttons).toHaveCount(2)
      await expect(buttons.first()).toHaveAttribute('title', label)
      await expect(buttons.first()).toHaveText('')
    }
    const checkRuntime = settings.getByRole('button', { name: '检查状态', exact: true })
    const checkRow = checkRuntime.locator('xpath=../..')
    await checkRuntime.click()
    await expect(checkRow.getByRole('status')).toHaveText('状态已检查')
    await expect(checkRow.locator('.runtime-check-mark')).toBeVisible()
    const statusOffset = await checkRow
      .getByRole('status')
      .evaluate((element) =>
        Math.abs(
          element.getBoundingClientRect().right -
            element.parentElement!.getBoundingClientRect().right
        )
      )
    expect(statusOffset).toBeLessThan(1)
    await expect(
      settings.locator('.call-ai-setting .runtime-row small').filter({ hasText: '正常' })
    ).toHaveCount(2)
    await settings.getByLabel('结果产物默认位置').fill(path.join(temporary, 'outputs'))
    await settings.getByLabel('结果产物默认位置').press('Enter')
    await expect
      .poll(() =>
        settings.evaluate(
          async () => (await window.tabdo.internal.callAi('state')).settings.outputDirectory
        )
      )
      .toBe(path.join(temporary, 'outputs'))
    await settings.getByText('全局规则', { exact: true }).click()
    for (const rule of ['测试规则：所有产物保持 UTF-8', '第二条规则']) {
      await settings.getByRole('button', { name: '添加规则', exact: true }).click()
      await settings.getByLabel('添加规则', { exact: true }).fill(rule)
      await settings.getByRole('button', { name: '保存规则' }).click()
      await expect(settings.locator('.rule-list')).toContainText(rule)
    }
    await settings.getByRole('button', { name: '编辑规则 2' }).click()
    await settings.getByRole('textbox', { name: '编辑规则 2', exact: true }).fill('第二条已编辑')
    await settings.getByRole('button', { name: '保存规则' }).click()
    await expect(settings.locator('.rule-list')).toContainText('第二条已编辑')
    await settings.getByRole('button', { name: '删除规则 2' }).click()
    await expect(settings.locator('.rule-list li')).toHaveCount(1)
    await expect(settings.locator('.notice')).toHaveCount(0)
    const mcpServer = path.join(temporary, 'manual-mcp.cjs')
    const manualStarted = path.join(temporary, 'manual-started.txt')
    const inspectionPid = path.join(temporary, 'mcp-inspection-pid.txt')
    await fs.writeFile(
      mcpServer,
      `
      const fs = require('node:fs')
      const path = require('node:path')
      const readline = require('node:readline')
      const inspecting = path.basename(path.dirname(process.cwd())) === 'mcp-inspections'
      if (inspecting) fs.writeFileSync(${JSON.stringify(inspectionPid)}, String(process.pid))
      else fs.writeFileSync(${JSON.stringify(manualStarted)}, 'started')
      const tool = (name, description) => ({
        name, description, inputSchema: { type: 'object', properties: {}, additionalProperties: false }
      })
      readline.createInterface({ input: process.stdin }).on('line', (line) => {
        const request = JSON.parse(line)
        if (request.id === undefined) return
        let result = {}
        if (request.method === 'initialize') result = {
          protocolVersion: request.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: 'manual', version: '1' }
        }
        if (request.method === 'tools/list') {
          result = request.params?.cursor === 'next'
            ? { tools: [tool('other', 'second page')] }
            : { tools: [tool('echo', 'manual echo')], ...(inspecting ? { nextCursor: 'next' } : {}) }
        }
        if (request.method === 'tools/call') result = {
          content: [{ type: 'text', text: 'manual-result' }]
        }
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n')
      })`
    )
    await settings.locator('.add-menu > summary').click()
    await settings.getByRole('button', { name: '手动配置', exact: true }).click()
    const editor = settings.getByRole('dialog', { name: '手动配置' })
    await editor.getByLabel('MCP 配置 JSON').fill(
      JSON.stringify(
        {
          mcpServers: { manual: { name: '手动MCP', command: 'node', args: [mcpServer] } }
        },
        null,
        2
      )
    )
    await expect(editor.getByRole('button', { name: '确认', exact: true })).toBeEnabled()
    const modalOffset = await editor.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return Math.max(
        Math.abs(bounds.left + bounds.width / 2 - window.innerWidth / 2),
        Math.abs(bounds.top + bounds.height / 2 - window.innerHeight / 2)
      )
    })
    expect(modalOffset).toBeLessThan(3)
    await capturePlugin(
      app,
      'http://127.0.0.1:15177',
      testInfo.outputPath('call-ai-mcp-editor.png')
    )
    await editor.getByRole('button', { name: '确认', exact: true }).click()
    await expect(editor).toBeHidden()
    const mcpToggle = settings.getByRole('switch', { name: '启用 手动MCP' })
    await mcpToggle.click()
    await expect(mcpToggle).toHaveAttribute('aria-checked', 'false')
    await settings.getByText('手动MCP', { exact: true }).click()
    await expect(fs.stat(inspectionPid)).rejects.toThrow()
    await settings.getByRole('button', { name: '查看工具', exact: true }).click()
    const listedTools = settings.getByRole('list', { name: 'MCP 工具' })
    await expect(listedTools.locator('code')).toHaveText(['echo', 'other'])
    await expect(listedTools.locator('small')).toHaveText(['manual echo', 'second page'])
    const inspectionProcess = Number(await fs.readFile(inspectionPid, 'utf8'))
    await expect
      .poll(() => {
        try {
          process.kill(inspectionProcess, 0)
          return true
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
          throw error
        }
      })
      .toBe(false)
    await expect(mcpToggle).toHaveAttribute('aria-checked', 'false')
    await settings.getByText('手动MCP', { exact: true }).click()
    await mcpToggle.click()
    await expect(mcpToggle).toHaveAttribute('aria-checked', 'true')
    const skill = path.join(temporary, '手动Skill.zip')
    const agentSkill = path.join(temporary, '对话Skill.zip')
    const manualZip = new AdmZip()
    manualZip.addFile(
      '手动Skill/SKILL.md',
      Buffer.from(
        '---\nname: manual\ndescription: >-\n  查看已安装\n  Skill 的描述\n---\n# Skill\nSKILL_MANUAL_ONLY_SENTINEL'
      )
    )
    manualZip.addFile('手动Skill/references/notes.txt', Buffer.from('relative resources'))
    await fs.writeFile(skill, manualZip.toBuffer())
    const agentZip = new AdmZip()
    agentZip.addFile('SKILL.md', Buffer.from('# Dialog Skill'))
    await fs.writeFile(agentSkill, agentZip.toBuffer())
    await app.evaluate(({ dialog }, directory) => {
      ;(globalThis as any).__callAiOriginalOpenDialog = dialog.showOpenDialog
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [directory] })) as any
    }, skill)
    await settings.locator('.manager-actions > button').filter({ hasText: '添加' }).click()
    await expect(settings.getByText('手动Skill', { exact: true })).toBeVisible()
    await settings.getByText('手动Skill', { exact: true }).click()
    await expect(settings.getByText('查看已安装 Skill 的描述', { exact: true })).toBeVisible()
    await expect(settings.getByText('SKILL_MANUAL_ONLY_SENTINEL')).toHaveCount(0)
    await settings.getByTestId('call-ai-setting').evaluate((element) => element.scrollTo(0, 0))
    await capturePlugin(app, 'http://127.0.0.1:15177', testInfo.outputPath('call-ai-settings.png'))
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = (globalThis as any).__callAiOriginalOpenDialog
    })
    await settings.getByText('网页搜索', { exact: true }).click()
    await settings.getByLabel('Brave Search API 密钥').fill('fixture-search-key')
    await settings.getByLabel('Brave Search API 密钥').blur()
    await expect(settings.getByRole('button', { name: '移除密钥' })).toBeVisible()
    const searchProvider = settings.getByLabel('搜索服务')
    await searchProvider.selectOption('bocha')
    await settings.getByLabel('博查搜索 API 密钥').fill('fixture-bocha-key')
    await settings.getByLabel('博查搜索 API 密钥').blur()
    await expect(settings.getByRole('button', { name: '移除密钥' })).toBeVisible()
    await searchProvider.selectOption('brave')
    await expect(settings.getByLabel('Brave Search API 密钥')).toHaveAttribute(
      'placeholder',
      '已配置，输入可替换'
    )
    await expect(settings.locator('.notice')).toHaveCount(0)
    const desktop = path.join(temporary, '测试桌面')
    const picture = path.join(temporary, '附件图片.png')
    const draggedFile = path.join(temporary, '拖入的资料.txt')
    await fs.mkdir(desktop)
    await fs.writeFile(path.join(desktop, '原有文件.txt'), 'keep')
    await fs.writeFile(
      picture,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
        'base64'
      )
    )
    await fs.writeFile(draggedFile, '本地资料')
    await app.evaluate(
      async ({ app, shell }, { agentSkill, mcpServer, desktop }) => {
        // 记录主进程收到的系统打开请求，避免启动测试机上的默认软件。
        const artifactActions: Array<{ action: string; target: string }> = []
        ;(globalThis as any).__callAiArtifactActions = artifactActions
        shell.openPath = async (target) => {
          artifactActions.push({ action: 'open', target })
          return ''
        }
        shell.showItemInFolder = (target) => {
          artifactActions.push({ action: 'reveal', target })
        }
        // 将系统桌面重定向到隔离夹具，所有其他 app 路径保持隔离配置。
        const getPath = app.getPath.bind(app)
        app.getPath = (name) => (name === 'desktop' ? desktop : getPath(name))
        const load = (file: string): any =>
          process.mainModule!.require(app.getAppPath() + '/src/main/' + file)
        const service = load('core/aiProviderService.ts').default
        service.addProvider({
          name: '测试提供商',
          apiUrl: 'http://127.0.0.1:1/v1',
          apiKey: 'test-only',
          apiFormat: 'openai-chat',
          enabled: true,
          selectedModels: [
            {
              ref: 'call-ai-test',
              modelId: 'call-ai-test',
              description: '可识图的测试模型',
              inputModalities: ['text', 'image']
            }
          ]
        })
        service.addProvider({
          name: 'DeepSeek',
          apiUrl: 'https://api.deepseek.com/v1',
          apiKey: 'fixture-deepseek-key',
          apiFormat: 'openai-chat',
          enabled: true,
          selectedModels: [
            {
              ref: 'call-ai-deepseek',
              modelId: 'deepseek-flash',
              inputModalities: ['text', 'image']
            }
          ]
        })
        const adapters = load('api/plugin/aiProtocol/adapters.ts')
        const https = process.mainModule!.require('node:https')
        const { PassThrough } = process.mainModule!.require('node:stream')
        const { EventEmitter } = process.mainModule!.require('node:events')
        const webRequests: Array<{ url: string; body: any; auth: string }> = []
        ;(globalThis as any).__callAiWebRequests = webRequests
        const request = https.request
        https.request = (url: URL, options: any, callback: (response: any) => void) => {
          if (url.origin !== 'https://api.deepseek.com' || !url.pathname.startsWith('/v1/tools/'))
            return request(url, options, callback)
          const connection = new EventEmitter()
          connection.end = (body: string) => {
            webRequests.push({
              url: url.href,
              body: JSON.parse(body),
              auth: options.headers.authorization
            })
            const response = Object.assign(new PassThrough(), { statusCode: 200, headers: {} })
            callback(response)
            const output = url.pathname.endsWith('/fetch')
              ? JSON.stringify({ title: '夹具网页', content: '# 夹具正文' })
              : webRequests.length === 1
                ? '{"results":[{"summary": DNS 解析测试}]}'
                : JSON.stringify({
                    results: [
                      { url: 'https://example.com/page', title: '夹具', summary: '夹具摘要' }
                    ]
                  })
            response.end(output)
          }
          return connection
        }
        let turn = 0
        ;(globalThis as any).__callAiPrompts = []
        adapters.createAdapter = () => ({
          stream: async (input: any, _signal: AbortSignal, delta: (value: any) => void) => {
            const lastUser = input.messages.findLastIndex((entry: any) => entry.role === 'user')
            const task = input.messages[lastUser].content
            const replies = input.messages
              .slice(lastUser + 1)
              .filter((entry: any) => entry.role === 'tool')
            const tool = (name: string, args: unknown) => ({
              content: '',
              toolCalls: [
                {
                  id: `call-${lastUser}-${replies.length}`,
                  type: 'function',
                  function: { name, arguments: JSON.stringify(args) }
                }
              ],
              finishReason: 'tool_calls'
            })
            if (task === '验证长回复结束后滚动') {
              const formula = String.raw`\(\frac{\sqrt{x^2+1}+\sum_{i=1}^n i}{\left(1+\alpha\right)^2}\)`
              const paragraph = '长回复中的公式 ' + formula + '\n\n'
              const first =
                '长回复前段已到达\n\n' +
                paragraph.repeat(320) +
                '~~~javascript\nconst live = true\n~~~\n\n~~~python\nprint("接收中")'
              const suffix = [
                '~~~javascript\nconst complete = true\n~~~',
                '公式异常时保留该式 ' + String.raw`\(\notARealCommand{x}\)` + ' 的源码。',
                '末尾的行内式 ' + String.raw`\(e^{-2\pi i k n/N}\)` + ' 继续排版。',
                String.raw`\[\boxed{F[k]=\sum_{n=0}^{N-1}f[n]e^{-2\pi i kn/N}}\]`,
                '| 量 | 定义 |\n| --- | --- |\n| 幅度 | ' +
                  String.raw`\(\lvert F[k]\rvert\)` +
                  ' |',
                '长回复尾段已到达'
              ].join('\n\n')
              const last = '\n~~~\n\n' + paragraph.repeat(280) + suffix
              // 等测试滚动到旧内容后释放最后一批正文。
              const finish = new Promise<void>((resolve) => {
                ;(globalThis as any).__finishLongCallAiReply = resolve
              })
              delta({ content: first })
              await finish
              delta({ content: last })
              return { content: first + last, toolCalls: [], finishReason: 'stop' }
            }
            if (task === '验证同一条回复内的图示、代码和 HTML') {
              const stillRegistered = input.tools.some(
                ({ function: entry }) => entry.name === 'show_demo'
              )
              const content = stillRegistered
                ? '旧演示工具仍在注册'
                : [
                    '## 放大器信号路径',
                    '~~~svg\n<svg viewBox="0 0 560 112" xmlns="http://www.w3.org/2000/svg">' +
                      '<title>放大器原理图</title><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#3375bc"/></marker></defs>' +
                      '<rect x="18" y="22" width="135" height="60" rx="8" fill="#dbeafe"/><text x="86" y="57" text-anchor="middle" fill="#14283e">输入级</text>' +
                      '<path d="M 157 52 H 210" fill="none" stroke="#3375bc" stroke-width="2" marker-end="url(#arrow)"/><path d="M 350 52 H 403" fill="none" stroke="#3375bc" stroke-width="2" marker-end="url(#arrow)"/>' +
                      '<rect x="213" y="22" width="135" height="60" rx="8" fill="#d1fae5"/><text x="280" y="57" text-anchor="middle" fill="#164538">放大级</text>' +
                      '<rect x="406" y="22" width="135" height="60" rx="8" fill="#e0e7ff"/><text x="474" y="57" text-anchor="middle" fill="#28275b">输出级</text>' +
                      '<foreignObject><div>不可嵌入</div></foreignObject></svg>\n~~~',
                    '~~~javascript\nconst rendered = "<img>";\n~~~',
                    '~~~html\n<section><p><strong>观察</strong>：输入经放大后送到输出端。</p><img src="http://127.0.0.1:1/hidden" onerror="window.__unsafeMarkup = true"><script>window.__unsafeMarkup = true</script></section>\n~~~',
                    String.raw`行内公式 \(E=mc^2\)，美元价格 $5 和 $10。`,
                    String.raw`\[\frac{a+b}{2}\]`,
                    '同一条回复结束。'
                  ].join('\n\n')
              delta({ content })
              return { content, toolCalls: [], finishReason: 'stop' }
            }
            if (task === '验证 HTML 回复翻页到底') {
              const content = '<section><p>仅 HTML 回复的末段</p></section>' + '\n'.repeat(2500)
              delta({ content })
              return { content, toolCalls: [], finishReason: 'stop' }
            }
            if (task === '验证网页检索恢复') {
              const search = tool('web_search', { query: '网页检索夹具' })
              if (!replies.length) {
                search.toolCalls[0].function.arguments = '{"query": DNS 解析测试}'
                return search
              }
              if (replies.length < 3) return search
              if (replies.length === 3)
                return tool('web_fetch', { url: 'https://example.com/page' })
              if (replies.length < 41) return search
              const recovered =
                replies[1].content.includes('返回了无效的 JSON') &&
                replies[2].content.includes('夹具摘要') &&
                replies[3].content.includes('夹具正文')
              const content = recovered ? '检索已恢复并完成超过四十次往返' : '检索夹具失败'
              delta({ content })
              return { content, toolCalls: [], finishReason: 'stop' }
            }
            if (task === '验证请求失败 https://example.com/path') {
              delta({ reasoningContent: '准备处理请求' })
              throw Object.assign(new Error('PRIVATE_PROVIDER_BODY'), { status: 429 })
            }
            if (JSON.stringify(task).includes('验证文件匹配及文件夹')) {
              const sent = JSON.stringify(task)
              const content =
                sent.includes('data:image/png;base64,') && sent.includes('文件夹路径')
                  ? '已收到内联图片与文件夹路径'
                  : '图片或文件夹未提交'
              delta({ content })
              return { content, toolCalls: [], finishReason: 'stop' }
            }
            if (typeof task === 'string' && /^验证(完全权限)?关闭网页/.test(task)) {
              if (!replies.length) return tool('web_search', { query: '不应发出' })
              const enabled = input.tools.some(({ function: entry }) => /^web_/.test(entry.name))
              const content = enabled ? '关闭时意外注册网页工具' : '本轮网页工具仍关闭'
              delta({ content })
              return { content, toolCalls: [], finishReason: 'stop' }
            }
            if (JSON.stringify(task).includes('处理这些附件。')) {
              const content = JSON.stringify(task).includes('data:image/png;base64,')
                ? '已收到匹配图片'
                : '匹配图片未发送'
              delta({ content })
              return { content, toolCalls: [], finishReason: 'stop' }
            }
            if (typeof task === 'string' && task.startsWith('验证类似命令')) {
              const repeat = task === '验证类似命令复用'
              if (!replies.length || (repeat && replies.length < 3))
                return tool('run_code', {
                  language: 'node',
                  code:
                    replies.length === 2 ? 'console.log("不同的参数")' : 'console.log("相同的参数")'
                })
              const content =
                repeat &&
                !replies.slice(0, 2).every(({ content }) => content.includes('相同的参数'))
                  ? '类似命令验证失败'
                  : '类似命令验证完成'
              delta({ content })
              return { content, toolCalls: [], finishReason: 'stop' }
            }
            ;(globalThis as any).__callAiPrompts.push(input)
            turn++
            if (turn <= 3) delta({ reasoningContent: `第 ${turn} 轮思考` })
            if (turn === 2) delta({ content: ' \n ' })
            if (turn === 1)
              return tool('run_code', {
                language: 'node',
                code: 'console.log("native-script-execution")'
              })
            if (turn === 2)
              return tool('ask_user', { question: '结果需要什么格式？', options: ['文本', '表格'] })
            if (turn === 3) {
              delta({ content: '我会先保存结果文件。' })
              return tool('write_file', { path: '结果.txt', content: '一次性结果产物' })
            }
            if (turn === 4) {
              const saved = JSON.parse(replies.at(-1).content)[0].path
              delta({
                content: [
                  '**任务已完成**',
                  '',
                  '卡片已经做好了，文件保存在：',
                  '',
                  '`' + saved + '`',
                  '',
                  '**卡片内容结构**',
                  '',
                  '复查文件：' + saved,
                  '',
                  '这是一套**《示例图鉴》（Demo）工具包**（预览版）。',
                  '',
                  '`一套**《示例图鉴》工具包**`',
                  '',
                  '|项目|状态|',
                  '|---|---|',
                  '|产物|已保存|',
                  '[来源链接](https://example.com/full-path)',
                  '[外部文件](file:///C:/unregistered.txt)',
                  '<script>window.__unsafe=1</script>'
                ].join('\n')
              })
              return { content: '任务已完成', toolCalls: [], finishReason: 'stop' }
            }
            if (turn === 5)
              return tool('run_code', {
                language: 'python',
                artifacts: ['python-result.txt', 'missing.txt'],
                code: 'import os\nfrom pathlib import Path\nPath(os.environ["TABDO_OUTPUT"],"python-result.txt").write_text("python-ok",encoding="utf-8")\nprint("python-ok")'
              })
            if (turn === 6) return tool('mcp_manual_0', {})
            if (turn === 7) {
              delta({ content: '手动引用已完成' })
              return { content: '手动引用已完成', toolCalls: [], finishReason: 'stop' }
            }
            if (turn === 8) return tool('install_skill', { source: agentSkill })
            if (turn === 9)
              return tool('configure_mcp', {
                action: 'add',
                json: JSON.stringify({
                  mcpServers: { via_chat: { name: '对话MCP', command: 'node', args: [mcpServer] } }
                })
              })
            if (turn === 10) {
              delta({ content: '对话安装已完成' })
              return { content: '对话安装已完成', toolCalls: [], finishReason: 'stop' }
            }
            if (turn === 11)
              return tool('write_files', {
                directory: 'desktop',
                files: Array.from({ length: 5 }, (_, index) => ({
                  path: `测试${index + 1}.txt`,
                  content: ''
                }))
              })
            if (turn === 12) {
              const content = '桌面文件已创建\n\n- 测试1.txt\n- [测试2.txt](测试2.txt)\n\n完成。'
              delta({ content })
              return { content, toolCalls: [], finishReason: 'stop' }
            }
            return tool('run_code', {
              language: 'node',
              code: 'require("fs").writeFileSync(require("path").join(process.env.TABDO_OUTPUT,"long-pid.txt"),String(process.pid));setInterval(()=>{},1000)'
            })
          }
        })
      },
      { agentSkill, mcpServer, desktop }
    )
    const plugin = await main.evaluate(async () =>
      (await window.tabdo.getAllPlugins()).find((entry: any) => entry.name === 'system')
    )
    await main.evaluate(
      (plugin) =>
        window.tabdo.launch({ path: plugin.path, type: 'plugin', featureCode: 'call-ai' }),
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
    const page = app
      .context()
      .pages()
      .find((page) => page.url().startsWith('http://127.0.0.1:15178'))!
    await expect(page.getByRole('heading', { name: '这次需要完成什么？' })).toBeVisible({
      timeout: 30_000
    })
    await expect(page.getByLabel('任务输入')).toBeEnabled({ timeout: 30_000 })
    const size = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }))
    expect(Math.abs(size.width - 650)).toBeLessThan(8)
    expect(Math.abs(size.height - 440)).toBeLessThan(8)
    await expect(page.getByText('一次性对话', { exact: true })).toHaveCount(0)
    await expect(page.getByText('临时常驻 · 关闭后销毁', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('权限模式')).toHaveValue('approve')
    await expect(page.getByLabel('AI模型')).not.toHaveValue('')
    await settings.evaluate(async () => {
      const api = window.tabdo.internal
      await api.dbPut('settings-general', {
        ...(await api.dbGet('settings-general')),
        primaryColor: 'custom',
        customColor: '#3867d6'
      })
      await api.updatePrimaryColor('custom', '#3867d6')
    })
    const modelPicker = page.getByLabel('AI模型')
    await expect(modelPicker.locator('option[value=""]')).toHaveCount(0)
    const composerActions = page.locator('.composer-actions')
    await expect(page.locator('.call-ai > header')).toHaveCount(0)
    await expect(composerActions.getByLabel('AI模型')).toHaveCount(1)
    await expect(composerActions.getByLabel('权限模式')).toHaveCount(1)
    const permissionPicker = composerActions.getByLabel('权限模式')
    await expect(permissionPicker).toHaveAttribute('title', '请求批准')
    await expect(permissionPicker.locator('.permission-icon')).toHaveText('')
    expect(
      await permissionPicker.evaluate((select) => getComputedStyle(select, '::picker-icon').display)
    ).toBe('none')
    const shieldOffset = await permissionPicker.evaluate((select) => {
      const control = select.getBoundingClientRect()
      const shield = select.querySelector('svg')!.getBoundingClientRect()
      return {
        x: Math.abs(control.x + control.width / 2 - shield.x - shield.width / 2),
        y: Math.abs(control.y + control.height / 2 - shield.y - shield.height / 2)
      }
    })
    expect(shieldOffset.x).toBeLessThan(1)
    expect(shieldOffset.y).toBeLessThan(1)
    await permissionPicker.click()
    await expect(permissionPicker.getByRole('option', { name: '请求批准' })).toBeVisible()
    await expect(permissionPicker.getByRole('option', { name: '完全权限' })).toBeVisible()
    await permissionPicker.press('Escape')
    await expect(modelPicker.locator('.model-label')).toHaveText('call-ai-test')
    await modelPicker.click()
    await expect
      .poll(() =>
        modelPicker.evaluate((select) => {
          const picker = getComputedStyle(select, '::picker(select)')
          const arrow = getComputedStyle(select, '::picker-icon')
          return [select.matches(':open'), picker.borderRadius, arrow.color]
        })
      )
      .toEqual([true, '10px', 'rgb(56, 103, 214)'])
    await expect(modelPicker.locator('.model-option').filter({ hasText: '测试提供商' })).toHaveText(
      '测试提供商 - call-ai-test 可识图的测试模型'
    )
    await modelPicker.press('Escape')
    let chatTitlebar: typeof page | undefined
    await expect
      .poll(async () => {
        const titlebars = app
          .context()
          .pages()
          .filter((entry) => entry.url().includes('detached-titlebar.html'))
        for (const entry of titlebars) {
          const icon = await entry.evaluate(() =>
            document.body.innerText.includes('呼叫AI')
              ? document.querySelector('.plugin-logo')?.getAttribute('src')
              : ''
          )
          if (icon?.startsWith('data:image/png;base64,')) {
            chatTitlebar = entry
            return true
          }
        }
        return false
      })
      .toBe(true)
    await expect(chatTitlebar!.getByRole('button', { name: '临时常驻', exact: true })).toHaveCount(
      0
    )
    await expect(chatTitlebar!.getByTitle('开发者工具', { exact: true })).toHaveCount(0)
    await page.getByLabel('任务输入').fill('最小化时保留的草稿')
    await app.evaluate(({ app }) => {
      const detached = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/detachedWindowManager.ts'
      ).default
      const chat = detached
        .getAllWindows()
        .find((entry: any) => entry.toolFeatureCode === 'call-ai')
      chat.window.minimize()
      chat.window.restore()
    })
    await expect(page.getByLabel('任务输入')).toHaveValue('最小化时保留的草稿')
    await page.getByLabel('任务输入').clear()
    const webSearch = page.getByRole('switch', { name: '网页搜索' })
    await expect(webSearch).toHaveAttribute('aria-checked', 'false')
    await expect(webSearch).toHaveAttribute('title', '开启网页搜索')
    await expect(webSearch).toHaveText('')
    await expect(webSearch.locator('svg')).toBeVisible()
    for (const name of ['附件', '引用', '打开结果目录', '发送']) {
      const control = composerActions.getByRole('button', { name, exact: true })
      await expect(control).toHaveText('')
      await expect(control.locator('svg')).toBeVisible()
    }
    for (const width of [520, 650]) {
      await app.evaluate(({ app, webContents }, width) => {
        const view = webContents
          .getAllWebContents()
          .find((entry) => entry.getURL().startsWith('http://127.0.0.1:15178'))!
        const owner = process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(view.id)
        owner.setContentSize(width, owner.getContentSize()[1])
      }, width)
      await expect
        .poll(async () => Math.abs((await page.evaluate(() => window.innerWidth)) - width))
        .toBeLessThan(8)
      expect(
        await composerActions.evaluate((actions) => {
          const bounds = actions.getBoundingClientRect()
          return [...actions.querySelectorAll(':scope > button, select')].every((element) => {
            const control = element.getBoundingClientRect()
            return control.left >= bounds.left && control.right <= bounds.right + 1
          })
        })
      ).toBe(true)
      if (width === 520)
        await capturePlugin(
          app,
          'http://127.0.0.1:15178',
          testInfo.outputPath('call-ai-narrow.png')
        )
    }
    await expect(page.getByText('Enter 发送', { exact: false })).toHaveCount(0)
    await expect(page.getByText('可以处理文件、编写代码', { exact: false })).toHaveCount(0)
    await capturePlugin(app, 'http://127.0.0.1:15178', testInfo.outputPath('call-ai-initial.png'))
    await page.getByLabel('任务输入').fill('测试脚本、向用户提问、保存结果')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('请求批准 · run_code', { exact: true })).toBeVisible({
      timeout: 40_000
    })
    const approval = page.getByLabel('请求批准操作')
    const reasoning = page.locator('.message.assistant .reasoning')
    await expect(reasoning).toHaveCount(1)
    await reasoning.locator('summary').click()
    await expect(reasoning.locator('pre')).toHaveText('第 1 轮思考')
    const codeBounds = (await approval.locator('pre').boundingBox())!
    const buttonBounds = (await approval
      .getByRole('button', { name: '批准本次操作' })
      .boundingBox())!
    expect(buttonBounds.y - codeBounds.y - codeBounds.height).toBeGreaterThan(20)
    await page.getByRole('button', { name: '批准本次操作' }).click()
    await expect(page.getByText('结果需要什么格式？', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '文本', exact: true }).click()
    await expect(page.getByText('请求批准 · write_file', { exact: true })).toBeVisible()
    await expect(reasoning).toHaveCount(1)
    await expect(reasoning).toHaveAttribute('open', '')
    await expect(reasoning.locator('pre')).toHaveText('第 1 轮思考\n\n第 2 轮思考\n\n第 3 轮思考')
    await reasoning.locator('summary').click()
    await page.getByRole('button', { name: '批准本次操作' }).click()
    await expect(page.getByText('任务已完成', { exact: true })).toBeVisible()
    await expect(
      page.locator('.markdown strong').filter({ hasText: '《示例图鉴》（Demo）工具包' })
    ).toBeVisible()
    await expect(
      page.locator('.markdown code').filter({ hasText: '一套**《示例图鉴》工具包**' })
    ).toBeVisible()
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible()
    const bubble = (await page.locator('.message.user .plain').boundingBox())!
    const assistant = (await page.locator('.message.assistant').last().boundingBox())!
    expect(bubble.x - assistant.x).toBeGreaterThan(30)
    expect(Math.abs(bubble.x + bubble.width - assistant.x - assistant.width)).toBeLessThan(2)
    expect(await page.evaluate(() => (window as any).__unsafe)).toBeUndefined()
    const evidence = await app.evaluate(({ app, webContents }) => {
      const load = (file: string): any =>
        process.mainModule!.require(app.getAppPath() + '/src/main/' + file)
      const prompts = (globalThis as any).__callAiPrompts
      const last = prompts[3]
      const owner = webContents
        .getAllWebContents()
        .find((entry) => entry.getURL().startsWith('http://127.0.0.1:15178'))!
      return {
        runtime: app.getPath('userData') + '/call-ai',
        resident: load('core/temporaryResidency.ts').isTemporaryResident(owner),
        messages: last.messages,
        tools: last.tools.map((tool: any) => tool.function.name),
        owner: owner.id
      }
    })
    expect(evidence.resident).toBe(false)
    expect(evidence.tools).toEqual(
      expect.arrayContaining(['run_code', 'install_skill', 'install_mcp', 'configure_mcp'])
    )
    expect(evidence.tools.some((name: string) => name.startsWith('ctx_'))).toBe(false)
    expect(evidence.tools).not.toContain('web_search')
    expect(evidence.tools).not.toContain('web_fetch')
    const execution = evidence.messages.find((message: { role: string }) => message.role === 'tool')
    expect(execution?.content.trim()).toBe('native-script-execution')
    const sourceLink = page.getByRole('link', { name: '来源链接' })
    await expect(sourceLink).toHaveCSS('text-decoration-line', 'none')
    await sourceLink.hover()
    await expect(page.locator('.link-hint')).toHaveText('https://example.com/full-path')
    expect(JSON.stringify(evidence.messages)).toContain('测试规则')
    expect(JSON.stringify(evidence.messages)).toContain('mcp-packages')
    expect(JSON.stringify(evidence.messages)).not.toContain('SKILL_MANUAL_ONLY_SENTINEL')
    await expect(fs.stat(manualStarted)).rejects.toThrow()
    const directories = await fs.readdir(path.join(temporary, 'outputs'))
    expect(directories[0]).toMatch(/^Call_AI-/)
    const artifact = path.join(temporary, 'outputs', directories[0], '结果.txt')
    expect(await fs.readFile(artifact, 'utf8')).toBe('一次性结果产物')
    const resultReply = page.locator('.message.assistant').filter({ hasText: '任务已完成' })
    const resultLinks = resultReply.locator('.markdown:not(.reply-plain)').getByRole('link', {
      name: '结果.txt',
      exact: true
    })
    const artifactLink = resultLinks.first()
    await expect(resultLinks).toHaveCount(2)
    await expect(page.getByText('结果产物', { exact: true })).toHaveCount(0)
    await expect(artifactLink).toHaveAttribute('data-link-target', artifact)
    await expect(resultReply).not.toContainText(artifact)
    await expect(resultReply.locator('.reply-files a')).toHaveCount(0)
    await expect(resultReply.getByText('卡片内容结构', { exact: true })).toBeVisible()
    const order = await artifactLink.evaluate((link) => {
      const paragraph = link.closest('p')
      return [
        paragraph?.previousElementSibling?.textContent,
        paragraph?.nextElementSibling?.textContent
      ]
    })
    expect(order).toEqual(['卡片已经做好了，文件保存在：', '卡片内容结构'])
    await artifactLink.scrollIntoViewIfNeeded()
    await expect(artifactLink).toBeInViewport()
    await capturePlugin(
      app,
      'http://127.0.0.1:15178',
      testInfo.outputPath('call-ai-artifact-path.png')
    )
    await expect(artifactLink).toHaveCSS('text-decoration-line', 'none')
    await artifactLink.focus()
    await artifactLink.press('Enter')
    const reveal = resultReply.getByRole('button', { name: '在文件夹中显示 结果.txt', exact: true })
    await expect(reveal).toHaveAttribute('title', '在文件夹中显示')
    await expect(reveal).toHaveText('')
    await expect(reveal).toBeVisible()
    await reveal.click()
    await expect(page.getByText('外部文件', { exact: true })).not.toHaveAttribute('href')
    expect(
      await page.evaluate(
        (id) =>
          window.tabdo.internal
            .callAi('artifact', { id, action: 'open' })
            .catch((error) => error.message),
        artifact
      )
    ).toContain('产物链接无效')
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__callAiArtifactActions))
      .toEqual([
        { action: 'open', target: artifact },
        { action: 'reveal', target: artifact }
      ])
    await page.getByLabel('任务输入').fill('/')
    await page.getByRole('button', { name: '手动Skill Skill', exact: true }).click()
    await page.getByLabel('任务输入').fill('/')
    const manualMcp = page.getByRole('button', { name: '手动MCP MCP', exact: true })
    await expect(manualMcp).toBeDisabled()
    await webSearch.click()
    await expect(webSearch).toHaveAttribute('aria-checked', 'true')
    await manualMcp.click()
    await page.getByLabel('任务输入').fill('使用本轮手动引用并运行Python')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('请求批准 · 连接 MCP：手动MCP', { exact: true })).toBeVisible()
    await expect(fs.stat(manualStarted)).rejects.toThrow()
    await page.getByRole('button', { name: '批准本次操作' }).click()
    await expect(page.getByText('请求批准 · run_code', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '批准本次操作' }).click()
    await expect(page.getByText('请求批准 · mcp_manual_0', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '批准本次操作' }).click()
    await expect(page.getByText('手动引用已完成', { exact: true })).toBeVisible()
    expect(await fs.readFile(path.join(path.dirname(artifact), 'python-result.txt'), 'utf8')).toBe(
      'python-ok'
    )
    const pythonReply = page.locator('.message.assistant').filter({ hasText: '手动引用已完成' })
    await expect(
      pythonReply
        .locator('.reply-files')
        .getByRole('link', { name: 'python-result.txt', exact: true })
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'missing.txt', exact: true })).toHaveCount(0)
    expect(await fs.readFile(manualStarted, 'utf8')).toBe('started')
    expect(
      await app.evaluate(() => JSON.stringify((globalThis as any).__callAiPrompts[4].messages))
    ).toContain('SKILL_MANUAL_ONLY_SENTINEL')
    const genericTools = await app.evaluate(() => (globalThis as any).__callAiPrompts[4].tools)
    expect(
      genericTools.find(({ function: tool }) => tool.name === 'web_search').function.description
    ).toContain('Brave Search')
    expect(genericTools.some(({ function: tool }) => tool.name === 'web_fetch')).toBe(true)
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible()
    await capturePlugin(
      app,
      'http://127.0.0.1:15178',
      testInfo.outputPath('call-ai-conversation.png')
    )
    await page.getByLabel('任务输入').fill('安装这个 Skill 并配置这个 MCP')
    await page.getByRole('button', { name: '发送' }).click()
    for (const action of ['install_skill', 'configure_mcp']) {
      await expect(page.getByText(`请求批准 · ${action}`, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: '批准本次操作' }).click()
    }
    await expect(page.getByText('对话安装已完成', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible()
    await page.getByLabel('任务输入').fill('/')
    await expect(page.getByRole('button', { name: '对话Skill Skill', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '对话MCP MCP', exact: true })).toBeVisible()
    await settings.getByRole('button', { name: '刷新 Skill' }).click()
    await expect(settings.getByRole('switch', { name: '启用 对话Skill' })).toBeVisible()
    await expect(settings.getByRole('switch', { name: '启用 对话MCP' })).toBeVisible()
    await settings.getByText('对话Skill', { exact: true }).click()
    await expect(settings.getByText('此 Skill 未声明描述。', { exact: true })).toBeVisible()
    await settings.getByRole('switch', { name: '启用 对话Skill' }).click()
    await expect(page.getByRole('button', { name: '对话Skill Skill', exact: true })).toHaveCount(0)
    await page.getByLabel('选择附件文件').setInputFiles(picture)
    await expect(page.getByRole('link', { name: '附件图片.png' })).toBeVisible()
    await page.evaluate(() => {
      const input = document.createElement('input')
      input.type = 'file'
      input.id = 'call-ai-test-drop'
      document.body.append(input)
    })
    await page.locator('#call-ai-test-drop').setInputFiles(draggedFile)
    await page.evaluate(() => {
      const source = window.document.querySelector<HTMLInputElement>('#call-ai-test-drop')!
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(source.files![0])
      const target = window.document.querySelector('[data-testid="call-ai"]')!
      target.dispatchEvent(
        new DragEvent('dragover', { dataTransfer, bubbles: true, cancelable: true })
      )
      target.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }))
      source.remove()
    })
    await expect(page.getByRole('link', { name: '拖入的资料.txt' })).toBeVisible()
    await page
      .getByRole('combobox', { name: 'AI模型' })
      .selectOption({ label: 'DeepSeek - deepseek-flash' })
    await expect(modelPicker.locator('.model-label')).toHaveText('deepseek-flash')
    await page.getByLabel('任务输入').fill('参考附件，在桌面新建五个空白 txt')
    await page.getByRole('button', { name: '发送' }).click()
    const batch = page.getByLabel('请求批准操作')
    await expect(batch.getByText('请求批准 · write_files', { exact: true })).toBeVisible()
    await expect(batch.locator('pre')).toContainText('测试5.txt')
    expect(await fs.readdir(desktop)).toEqual(['原有文件.txt'])
    await batch.getByRole('button', { name: '批准本次操作' }).click()
    await expect(page.getByText('桌面文件已创建', { exact: true })).toBeVisible()
    await expect(page.getByLabel('请求批准操作')).toHaveCount(0)
    const batchReply = page.locator('.message.assistant').filter({ hasText: '桌面文件已创建' })
    for (let index = 1; index <= 5; index++) {
      expect((await fs.stat(path.join(desktop, `测试${index}.txt`))).size).toBe(0)
      await expect(
        batchReply
          .locator(index <= 2 ? '.markdown' : '.reply-files')
          .getByRole('link', { name: `测试${index}.txt`, exact: true })
      ).toHaveAttribute('data-link-target', path.join(desktop, `测试${index}.txt`))
    }
    await expect(batchReply.getByRole('link')).toHaveCount(5)
    await expect(batchReply.getByRole('button', { name: /^在文件夹中显示 / })).toHaveCount(5)
    const lastBatchFile = batchReply.getByRole('link', { name: '测试5.txt' })
    await lastBatchFile.scrollIntoViewIfNeeded()
    await expect(lastBatchFile).toBeInViewport()
    await capturePlugin(
      app,
      'http://127.0.0.1:15178',
      testInfo.outputPath('call-ai-reply-artifacts.png')
    )
    expect(await fs.readFile(path.join(desktop, '原有文件.txt'), 'utf8')).toBe('keep')
    const sent = await app.evaluate(() => (globalThis as any).__callAiPrompts[10])
    expect(JSON.stringify(sent)).toContain('data:image/png;base64,')
    expect(JSON.stringify(sent)).toContain('拖入的资料.txt')
    expect(
      sent.tools.find(({ function: tool }) => tool.name === 'web_search').function.description
    ).toContain('DeepSeek Search')
    expect(
      sent.tools.find(({ function: tool }) => tool.name === 'web_fetch').function.description
    ).toContain('DeepSeek Fetch')
    expect(JSON.stringify(sent)).not.toContain('fixture-deepseek-key')
    expect(JSON.stringify(sent)).not.toContain('fixture-search-key')
    expect(
      await page
        .locator('.markdown ul')
        .last()
        .evaluate((list) => parseFloat(getComputedStyle(list).paddingInlineStart))
    ).toBeGreaterThan(15)
    await capturePlugin(
      app,
      'http://127.0.0.1:15178',
      testInfo.outputPath('call-ai-batch-markdown.png')
    )
    await expect(webSearch).toBeEnabled()
    await webSearch.click()
    await expect(webSearch).toHaveAttribute('aria-checked', 'false')
    await page.getByLabel('任务输入').fill('验证关闭网页搜索')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('本轮网页工具仍关闭', { exact: true })).toBeVisible()
    expect(await app.evaluate(() => (globalThis as any).__callAiWebRequests.length)).toBe(0)
    // 原会话内重新开启，下一轮应重新注册 Search 和 Fetch。
    await expect(webSearch).toBeEnabled()
    await webSearch.click()
    await expect(webSearch).toHaveAttribute('aria-checked', 'true')
    await page.getByLabel('任务输入').fill('验证网页检索恢复')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('检索已恢复并完成超过四十次往返', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible()
    await expect(page.getByLabel('请求批准操作')).toHaveCount(0)
    await expect(page.locator('.error')).toHaveCount(0)
    const webRequests = await app.evaluate(() => (globalThis as any).__callAiWebRequests)
    expect(webRequests).toHaveLength(40)
    expect(webRequests[0]).toEqual({
      url: 'https://api.deepseek.com/v1/tools/search',
      body: { query: '网页检索夹具', count: 8, need_content: false },
      auth: 'Bearer fixture-deepseek-key'
    })
    expect(webRequests[2].url).toBe('https://api.deepseek.com/v1/tools/fetch')
    // 使用真实正文右键，替换原生弹层和系统文件剪贴板读取。
    await app.evaluate(({ app, Menu, webContents }, id) => {
      const owner = webContents.fromId(id)!
      const { ClipboardMonitor } = process.mainModule!.require(
        app.getAppPath() + '/src/main/core/native/index.ts'
      )
      const readFiles = ClipboardMonitor.getClipboardFiles
      const actions: string[] = []
      ;(globalThis as any).__callAiMenuActions = actions
      ;(globalThis as any).__callAiClipboardFiles = '[]'
      const popup = Menu.prototype.popup
      const { copy } = owner
      const exposePaste = (_event: Electron.Event, params: Electron.ContextMenuParams): void => {
        if (params.isEditable) params.editFlags.canPaste = false
      }
      owner.prependListener('context-menu', exposePaste)
      ClipboardMonitor.getClipboardFiles = () =>
        JSON.parse((globalThis as any).__callAiClipboardFiles)
      ;(globalThis as any).__restoreCallAiMenu = () => {
        Menu.prototype.popup = popup
        owner.removeListener('context-menu', exposePaste)
        ClipboardMonitor.getClipboardFiles = readFiles
        owner.copy = copy
      }
      owner.copy = () => {
        actions.push('复制')
      }
      Menu.prototype.popup = function () {
        for (const item of this.items) {
          if (item.label === '粘贴') actions.push(item.label)
          item.click()
        }
      }
    }, evidence.owner)
    // 等正文排版完成，再建立原生右键菜单要读取的选区。
    const resultText = page
      .locator('.markdown:not(.reply-plain)')
      .getByText('检索已恢复并完成超过四十次往返', { exact: true })
    await resultText.evaluate((element) => {
      const selection = window.getSelection()!
      selection.selectAllChildren(element)
    })
    await resultText.click({ button: 'right' })
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__callAiMenuActions))
      .toEqual(['复制'])
    const input = page.getByLabel('任务输入')
    await app.evaluate((_electron, file) => {
      ;(globalThis as any).__callAiClipboardFiles = JSON.stringify([
        { path: file, name: '拖入的资料.txt', isDirectory: false }
      ])
    }, draggedFile)
    await input.fill('保留输入')
    await input.click({ button: 'right' })
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__callAiMenuActions))
      .toEqual(['复制', '粘贴'])
    const pasted = page.locator('.draft-attachments').getByRole('link', { name: '拖入的资料.txt' })
    await expect(pasted).toHaveAttribute('data-link-target', draggedFile)
    await expect(input).toHaveValue('保留输入')
    await page.getByRole('button', { name: '移除拖入的资料.txt' }).click()
    await input.press('Control+v')
    await expect(pasted).toHaveAttribute('data-link-target', draggedFile)
    await input.press('Control+v')
    await expect(pasted).toHaveCount(1)
    await expect(input).toHaveValue('保留输入')
    await app.evaluate(() => {
      ;(globalThis as any).__callAiClipboardFiles = '[]'
    })
    await input.evaluate((element) => {
      const data = new DataTransfer()
      const png = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=='
        ),
        (character) => character.charCodeAt(0)
      )
      data.items.add(new File([png], '截图.png', { type: 'image/png' }))
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      )
    })
    await expect(page.getByText('粘贴图片', { exact: true })).toBeVisible()
    await capturePlugin(
      app,
      'http://127.0.0.1:15178',
      testInfo.outputPath('call-ai-paste-attachments.png')
    )
    await page.getByRole('button', { name: '移除粘贴图片' }).click()
    await page.getByRole('button', { name: '移除拖入的资料.txt' }).click()
    await app.evaluate(() => (globalThis as any).__restoreCallAiMenu())
    await app.evaluate(({ clipboard }) => clipboard.writeText('普通粘贴文字'))
    await input.fill('')
    await input.press('Control+v')
    await expect(input).toHaveValue('普通粘贴文字')
    await webSearch.click()
    await page.getByLabel('任务输入').fill('验证类似命令复用')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(approval.locator('pre')).toContainText('相同的参数')
    await approval.getByRole('button', { name: '允许类似命令' }).click()
    await expect(approval.locator('pre')).toContainText('不同的参数')
    await approval.getByRole('button', { name: '拒绝', exact: true }).click()
    await expect(page.getByText('类似命令验证完成', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible()
    await page.getByLabel('任务输入').fill('验证类似命令跨轮')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('类似命令验证完成', { exact: true })).toHaveCount(2)
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible()
    await page.getByLabel('任务输入').fill('启动长命令以验证关闭清理')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('请求批准 · run_code', { exact: true })).toBeVisible()
    const disabledTools = await app.evaluate(() => (globalThis as any).__callAiPrompts[12].tools)
    expect(
      disabledTools.some(({ function: tool }) => ['web_fetch', 'web_search'].includes(tool.name))
    ).toBe(false)
    await page.getByRole('button', { name: '批准本次操作' }).click()
    const pidFile = path.join(path.dirname(artifact), 'long-pid.txt')
    await expect.poll(async () => Boolean(await fs.stat(pidFile).catch(() => null))).toBe(true)
    const pid = Number(await fs.readFile(pidFile, 'utf8'))
    await app.evaluate(
      ({ app }, ownerId) =>
        process
          .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
          .default.getWindowByPluginWebContents(ownerId)
          .close(),
      evidence.owner
    )
    await expect
      .poll(async () => (await fs.readdir(path.join(evidence.runtime, 'sessions'))).length)
      .toBe(0)
    expect(await fs.readFile(artifact, 'utf8')).toBe('一次性结果产物')
    await expect.poll(() => page.isClosed()).toBe(true)
    expect(() => process.kill(pid, 0)).toThrow()
    // 重新打开得到全新正文和空聊天，权限恢复上一次的选择。
    await main.evaluate(
      (plugin) =>
        window.tabdo.launch({ path: plugin.path, type: 'plugin', featureCode: 'call-ai' }),
      plugin
    )
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((entry) => entry.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    const reopened = app
      .context()
      .pages()
      .find((entry) => entry.url().startsWith('http://127.0.0.1:15178'))!
    await expect(reopened.getByRole('heading', { name: '这次需要完成什么？' })).toBeVisible()
    await expect(reopened.getByLabel('权限模式')).toHaveValue('approve')
    await expect(reopened.locator('.message')).toHaveCount(0)
    await expect(reopened.locator('.attachments button')).toHaveCount(0)
    await main.evaluate(
      (plugin) =>
        window.tabdo.launch({
          path: plugin.path,
          type: 'plugin',
          featureCode: 'call-ai',
          cmdType: 'over',
          param: { type: 'over', payload: 'SELECTED_TEXT_SENTINEL' }
        }),
      plugin
    )
    await expect(reopened.getByRole('button', { name: '移除选中文本' })).toBeVisible()
    await main.evaluate(
      ({ plugin, file }) =>
        window.tabdo.launch({
          path: plugin.path,
          type: 'plugin',
          featureCode: 'call-ai',
          cmdType: 'files',
          param: { type: 'files', payload: [{ path: file, name: '结果.txt' }] }
        }),
      { plugin, file: artifact }
    )
    await expect(reopened.getByRole('link', { name: '结果.txt' })).toHaveAttribute(
      'data-link-target',
      artifact
    )
    await main.evaluate(
      ({ plugin, folder }) =>
        window.tabdo.launch({
          path: plugin.path,
          type: 'plugin',
          featureCode: 'call-ai',
          cmdType: 'window',
          param: {
            type: 'window',
            payload: { path: folder, app: 'test.exe', className: 'TestWindow' }
          }
        }),
      { plugin, folder: temporary }
    )
    await expect(reopened.getByRole('link', { name: '窗口所在路径' })).toHaveAttribute(
      'data-link-target',
      temporary
    )
    await expect(reopened.locator('.message')).toHaveCount(0)
    const clipboardContent = {
      type: 'image',
      image: 'data:image/png;base64,' + (await fs.readFile(picture)).toString('base64')
    }
    // 从超级面板搜索入口取得图片匹配，再走同一面板的实际启动路由。
    const matchedType = await app.evaluate(
      async ({ ipcMain, webContents }, { url, clipboardContent }) => {
        const mainView = webContents.getAllWebContents().find((view) => view.getURL() === url)!
        const result = new Promise<any>((resolve) => {
          ipcMain.once('super-panel-search-result', (_event, data) => resolve(data))
        })
        mainView.send('super-panel-search', { text: '', clipboardContent })
        const { results } = await result
        const command = results.find((entry: any) => entry.featureCode === 'call-ai')
        if (command) mainView.send('super-panel-launch', { command, clipboardContent })
        return command?.cmdType
      },
      { url: main.url(), clipboardContent }
    )
    expect(matchedType).toBe('img')
    await expect(reopened.getByRole('button', { name: '移除选中图片' })).toBeVisible()
    await expect(reopened.locator('.message')).toHaveCount(0)
    await reopened.getByRole('button', { name: '发送' }).click()
    await expect(reopened.getByText('已收到匹配图片', { exact: true })).toBeVisible()
    await expect(reopened.locator('.message.user')).toContainText('选中图片')
    await expect(reopened.locator('.message.user')).not.toContainText('data:image')
    const retryText = '验证请求失败 https://example.com/path'
    await reopened.getByLabel('任务输入').fill(retryText)
    await expect(reopened.locator('.draft-attachments').getByRole('link')).toHaveAttribute(
      'href',
      'https://example.com/path'
    )
    await reopened.getByRole('button', { name: '发送' }).click()
    const failed = reopened.locator('.assistant').filter({ hasText: '本轮未完成' })
    await expect(failed.getByRole('alert')).toContainText('模型服务达到频率或额度限制')
    await expect(failed.getByText('思考过程')).toBeVisible()
    await expect(reopened.getByText('PRIVATE_PROVIDER_BODY')).toHaveCount(0)
    const retryButton = reopened.getByRole('button', { name: '重试此消息' })
    await retryButton.click()
    await expect(reopened.getByLabel('任务输入')).toHaveValue(retryText)
    await expect(failed).toHaveCount(1)
    await expect(reopened.locator('.message.user').getByRole('link')).toHaveAttribute(
      'href',
      'https://example.com/path'
    )
    await reopened.getByLabel('任务输入').fill('验证类似命令未跨窗口')
    await reopened.getByRole('button', { name: '发送' }).click()
    const newApproval = reopened.getByLabel('请求批准操作')
    await expect(newApproval.locator('pre')).toContainText('相同的参数')
    await newApproval.getByRole('button', { name: '批准本次操作' }).click()
    await expect(reopened.getByText('类似命令验证完成', { exact: true })).toBeVisible()
    await expect(reopened.getByLabel('权限模式')).toBeEnabled()
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as any
    })
    await reopened.getByLabel('权限模式').selectOption('full')
    await expect(reopened.getByLabel('权限模式')).toHaveAttribute('title', '完全权限')
    await expect(reopened.locator('.permission-icon')).toHaveCSS('color', 'rgb(201, 48, 59)')
    await reopened.getByLabel('任务输入').fill('验证完全权限关闭网页')
    await reopened.getByRole('button', { name: '发送' }).click()
    await expect(reopened.getByText('本轮网页工具仍关闭', { exact: true })).toBeVisible()
    expect(await app.evaluate(() => (globalThis as any).__callAiWebRequests.length)).toBe(40)
    await app.evaluate(({ app, webContents }) => {
      const owner = webContents
        .getAllWebContents()
        .find((entry) => entry.getURL().startsWith('http://127.0.0.1:15178'))!
      process
        .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
        .default.getWindowByPluginWebContents(owner.id)
        .close()
    })
    await expect.poll(() => reopened.isClosed()).toBe(true)
    await main.evaluate(
      (plugin) =>
        window.tabdo.launch({ path: plugin.path, type: 'plugin', featureCode: 'call-ai' }),
      plugin
    )
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((entry) => entry.url().startsWith('http://127.0.0.1:15178'))
      )
      .toBe(true)
    const restored = app
      .context()
      .pages()
      .find((entry) => entry.url().startsWith('http://127.0.0.1:15178'))!
    await expect(restored.getByLabel('权限模式')).toHaveValue('full')
    await expect(restored.getByLabel('权限模式')).toHaveAttribute('title', '完全权限')
    await expect(restored.locator('.permission-icon')).toHaveCSS('color', 'rgb(201, 48, 59)')
    await expect(restored.getByRole('switch', { name: '网页搜索' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
    // 匹配入口提交磁盘图片，并将实际目录作为本地文件投放。
    await main.evaluate(
      ({ plugin, picture }) =>
        window.tabdo.launch({
          path: plugin.path,
          type: 'plugin',
          featureCode: 'call-ai',
          cmdType: 'files',
          param: { type: 'files', payload: [{ path: picture, name: '附件图片.png' }] }
        }),
      { plugin, picture }
    )
    await expect(
      restored.locator('.draft-attachments').getByRole('link', { name: '附件图片.png' })
    ).toBeVisible()
    const folder = path.join(temporary, '附件目录')
    await fs.mkdir(folder)
    const cdp = await restored.context().newCDPSession(restored)
    const drag = { x: 50, y: 60, data: { items: [], files: [folder], dragOperationsMask: 1 } }
    await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', ...drag })
    await cdp.send('Input.dispatchDragEvent', { type: 'drop', ...drag })
    await cdp.detach()
    await expect(restored.getByRole('link', { name: '附件目录' })).toHaveAttribute(
      'data-link-target',
      folder
    )
    await restored.getByLabel('任务输入').fill('验证文件匹配及文件夹')
    await restored.getByRole('button', { name: '发送' }).click()
    await expect(restored.getByText('已收到内联图片与文件夹路径', { exact: true })).toBeVisible()
    const svgPath = path.join(temporary, '放大器原理图.svg')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, svgPath)
    await restored.getByLabel('任务输入').fill('验证同一条回复内的图示、代码和 HTML')
    await restored.getByRole('button', { name: '发送' }).click()
    const mixed = restored.locator('.message.assistant').filter({ hasText: '放大器信号路径' })
    await expect(mixed).toHaveCount(1)
    const diagram = mixed.getByRole('img', { name: '放大器原理图' })
    await expect(diagram).toContainText('放大级')
    await expect(diagram.locator('path[marker-end]').first()).toHaveAttribute(
      'marker-end',
      /url\(#reply-svg-/
    )
    await expect(mixed.locator('.reply-html')).toContainText('输入经放大后送到输出端。')
    await expect(mixed.locator('foreignObject, script, [onerror], img')).toHaveCount(0)
    expect(await restored.evaluate(() => (window as any).__unsafeMarkup)).toBeUndefined()
    await expect(mixed.locator('.math-inline .katex')).toHaveCount(1)
    await expect(mixed.locator('.math-display .katex')).toHaveCount(1)
    await expect(mixed).toContainText('美元价格 $5 和 $10')
    await expect(mixed.locator('.reply-code .hljs-keyword')).toHaveText('const')
    expect(
      await mixed
        .locator('.markdown')
        .evaluate((node) =>
          [...node.querySelectorAll('.reply-diagram, .reply-code, .reply-html')].map(
            (item) => item.className
          )
        )
    ).toEqual(['reply-diagram', 'reply-code', 'reply-html'])
    await mixed.getByRole('button', { name: '复制代码' }).click()
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('const rendered = "<img>";')
    await mixed.getByRole('button', { name: '导出 SVG' }).click()
    await expect(mixed.getByRole('button', { name: '已导出 SVG' })).toBeVisible()
    const exported = await fs.readFile(svgPath, 'utf8')
    expect(exported).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(exported).toContain('放大级')
    expect(exported).not.toMatch(/foreignObject|<script|https?:\/\/(?!www\.w3\.org)/)
    await diagram.scrollIntoViewIfNeeded()
    await expect(diagram).toBeInViewport()
    await capturePlugin(
      app,
      'http://127.0.0.1:15178',
      testInfo.outputPath('call-ai-inline-reply.png')
    )

    await restored.getByLabel('任务输入').fill('验证长回复结束后滚动')
    await restored.getByRole('button', { name: '发送' }).click()
    const conversation = restored.locator('.conversation')
    const longReply = restored.locator('.message.assistant').filter({ hasText: '长回复前段已到达' })
    await expect(longReply).toBeVisible()
    // 最后一批正文尚未发送，完整公式和代码已排版，未闭合的围栏保持原文。
    await expect(longReply.locator('math')).toHaveCount(320)
    const liveCode = longReply.locator('.reply-code').filter({ hasText: 'const live = true' })
    await expect(liveCode.locator('.hljs-keyword')).toHaveText('const')
    await expect(longReply.locator('.reply-plain')).toContainText('print("接收中")')
    await liveCode.evaluate((node) => node.setAttribute('data-streaming-proof', 'kept'))
    await expect
      .poll(() =>
        conversation.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop)
      )
      .toBeLessThan(100)
    await conversation.hover()
    await restored.mouse.wheel(0, -100000)
    await expect.poll(() => conversation.evaluate((node) => node.scrollTop)).toBe(0)
    await app.evaluate(() => (globalThis as any).__finishLongCallAiReply())
    await expect(longReply).toContainText('长回复尾段已到达')
    await expect(liveCode).toHaveAttribute('data-streaming-proof', 'kept')
    await expect(
      longReply
        .locator('.reply-code')
        .filter({ hasText: 'const complete = true' })
        .locator('.hljs-keyword')
    ).toHaveText('const')
    // 旧版本达到整条回复的预算后，末尾的有效公式会全部退成 TeX。
    await expect(longReply.locator('math')).toHaveCount(603)
    await expect(
      longReply.locator('.math-inline').filter({ hasText: 'notARealCommand' })
    ).toHaveCount(1)
    await expect(longReply.locator('table td math')).toHaveCount(1)
    await expect(longReply.locator('.math-display math').last()).toHaveAttribute('display', 'block')
    await expect.poll(() => conversation.evaluate((node) => node.scrollTop)).toBe(0)
    await conversation.press('PageDown')
    await expect.poll(() => conversation.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
    await conversation.press('Control+End')
    await expect
      .poll(() =>
        conversation.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop)
      )
      .toBeLessThan(100)
    await expect(restored.getByLabel('任务输入')).toBeEnabled()
    await expect(longReply.getByText('长回复尾段已到达', { exact: true })).toBeInViewport()
    await expect(longReply.locator('table td math')).toBeInViewport()
    await capturePlugin(
      app,
      'http://127.0.0.1:15178',
      testInfo.outputPath('call-ai-long-formula-tail.png')
    )
    await restored.getByLabel('任务输入').fill('验证 HTML 回复翻页到底')
    await restored.getByRole('button', { name: '发送' }).click()
    const htmlTail = restored.locator('.reply-html').getByText('仅 HTML 回复的末段')
    await expect(htmlTail).toBeVisible()
    await conversation.press('Control+End')
    await expect(htmlTail).toBeInViewport({ ratio: 0.8 })
    expect(
      await conversation.evaluate(
        (node) =>
          document.scrollingElement?.scrollTop === 0 &&
          node.scrollHeight - node.scrollTop - node.clientHeight <= 2
      )
    ).toBe(true)
    await capturePlugin(app, 'http://127.0.0.1:15178', testInfo.outputPath('call-ai-bottom.png'))
    await app.evaluate(({ app, webContents }) => {
      const view = webContents
        .getAllWebContents()
        .find((entry) => entry.getURL().startsWith('http://127.0.0.1:15178'))!
      const owner = process
        .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
        .default.getWindowByPluginWebContents(view.id)
      owner.setContentSize(520, owner.getContentSize()[1])
    })
    await expect
      .poll(async () => Math.abs((await restored.evaluate(() => window.innerWidth)) - 520))
      .toBeLessThan(8)
    await conversation.press('Control+End')
    await expect(htmlTail).toBeInViewport({ ratio: 0.8 })
    await expect(restored.getByLabel('任务输入')).toBeInViewport()
    await capturePlugin(
      app,
      'http://127.0.0.1:15178',
      testInfo.outputPath('call-ai-bottom-narrow.png')
    )
    await app.evaluate(({ app, webContents }) => {
      const view = webContents
        .getAllWebContents()
        .find((entry) => entry.getURL().startsWith('http://127.0.0.1:15178'))!
      process
        .mainModule!.require(app.getAppPath() + '/src/main/core/detachedWindowManager.ts')
        .default.getWindowByPluginWebContents(view.id)
        .close()
    })
    await expect.poll(() => restored.isClosed()).toBe(true)
    const unrelated = path.join(temporary, 'outputs', '用户自有文件.txt')
    await fs.writeFile(unrelated, 'preserve')
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as any
    })
    await settings.getByRole('button', { name: '一键清理', exact: true }).click()
    expect(await fs.readFile(artifact, 'utf8')).toBe('一次性结果产物')
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as any
    })
    await settings.getByRole('button', { name: '一键清理', exact: true }).click()
    await expect.poll(async () => Boolean(await fs.stat(artifact).catch(() => null))).toBe(false)
    expect(await fs.readFile(unrelated, 'utf8')).toBe('preserve')
    expect((await fs.stat(path.join(desktop, '测试5.txt'))).size).toBe(0)
  } finally {
    if (application) await application.close().catch(() => {})
    await fs.writeFile(testInfo.outputPath('call-ai-host.log'), logs.join(''))
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
