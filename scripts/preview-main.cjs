const path = require('node:path')
const { app } = require('electron')
/**
 * 测试实例出现未捕获异常时立即失败，避免 Electron 的原生错误对话框阻塞桌面与清理。
 * @param {Error} error 导致测试无法继续的主进程异常。
 * @returns {void} 输出异常并以失败状态退出当前隔离实例。
 */
function failTestOnUncaughtException(error) {
  console.error('[E2E] 主进程未捕获异常，结束隔离实例:', error)
  app.exit(1)
}
// 只改变自动化测试入口；正常预览和产品仍使用原本的异常处理方式。
if (process.env.TABDO_E2E === '1') {
  process.on('uncaughtException', failTestOnUncaughtException)
}
process.chdir(path.resolve(__dirname, '..'))
process.env.TABDO_SOURCE_PREVIEW = '1'
app.setAppPath(process.cwd())
app.setName('TabDo Local Preview')
app.getVersion = () => require('../package.json').version
require('./source-loader.cjs')
require('../src/main/index.ts')
