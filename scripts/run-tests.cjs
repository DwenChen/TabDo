const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { prepare, workspacePath } = require('./project-maintenance.cjs')
const root = path.resolve(__dirname, '..')

/**
 * 保存本轮截图和 trace，避免下一轮 Playwright 清空唯一的失败证据。
 * @param {string} project 工作区根目录。
 * @param {string} directory 本轮测试归档目录。
 * @returns {string|null} 已归档的相对路径；没有产物时返回 null。
 * @throws {Error} 目标越界或复制失败时抛出。
 */
function archivePlaywrightArtifacts(project, directory) {
  const source = workspacePath(project, path.join(project, 'test-results/playwright'))
  if (!fs.existsSync(source)) return null
  const destination = workspacePath(project, path.join(directory, 'playwright'))
  fs.cpSync(source, destination, { recursive: true })
  return path.relative(project, destination).replaceAll('\\', '/')
}

/**
 * 统一运行单测或源码 E2E，自动留存日志与退出结果，结束后刷新维护索引。
 * @param {string} kind unit 或 e2e。
 * @param {string[]} args 原样转发的筛选参数，忽略包管理器额外的 -- 分隔符。
 * @returns {void} 无返回值；子进程结束后设置本进程退出码。
 * @throws {Error} 类型无效、日志目录无法创建或 CLI 无法解析时抛出。
 */
function run(kind, args) {
  if (!['unit', 'e2e'].includes(kind)) throw new Error('Expected unit or e2e')
  const packageName = kind === 'unit' ? 'vitest' : '@playwright/test'
  const cli = path.join(
    path.dirname(require.resolve(packageName + '/package.json')),
    kind === 'unit' ? 'vitest.mjs' : 'cli.js'
  )
  const forwarded = args.filter((arg) => arg !== '--')
  const commandArgs =
    kind === 'unit'
      ? [cli, 'run', ...forwarded]
      : [cli, 'test', '--config=playwright.e2e.config.ts', ...forwarded]
  const directory = path.join(
    root,
    '.artifacts/runs',
    new Date().toISOString().replace(/[:.]/g, '-') + '-' + kind
  )
  fs.mkdirSync(directory, { recursive: true })
  const log = fs.createWriteStream(path.join(directory, 'output.log'))
  const startedAt = new Date().toISOString()
  const child = spawn(process.execPath, commandArgs, {
    cwd: root,
    env: process.env,
    windowsHide: true,
    stdio: ['inherit', 'pipe', 'pipe']
  })
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk)
    log.write(chunk)
  })
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk)
    log.write(chunk)
  })
  child.on('error', (error) => {
    process.stderr.write(error.message + '\n')
    log.write(error.message + '\n')
  })
  child.once('close', (status, signal) => {
    // 测试失败也保留证据；维护失败不能掩盖原测试退出码。
    log.end()
    const exitCode = status ?? 1
    let artifacts = null
    try {
      if (kind === 'e2e') artifacts = archivePlaywrightArtifacts(root, directory)
    } catch (error) {
      console.error('[test-artifacts]', error.message)
      process.exitCode = 1
    }
    fs.writeFileSync(
      path.join(directory, 'result.json'),
      JSON.stringify(
        {
          kind,
          args: forwarded,
          startedAt,
          endedAt: new Date().toISOString(),
          exitCode,
          signal,
          artifacts
        },
        null,
        2
      ) + '\n'
    )
    try {
      prepare(root)
    } catch (error) {
      console.error('[maintenance]', error.message)
      process.exitCode = 1
    }
    if (!process.exitCode) process.exitCode = exitCode
    console.log('测试归档：' + path.relative(root, directory).replaceAll('\\', '/'))
  })
}

module.exports = { archivePlaywrightArtifacts }
if (require.main === module) {
  try {
    run(process.argv[2], process.argv.slice(3))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
