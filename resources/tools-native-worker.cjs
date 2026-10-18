// 按次加载原生工具，进程退出同时回收原生静态缓存、屏幕帧和工作线程。
const addon = require(process.argv[2])

/**
 * 回传最终结果并结束工具进程；宿主也会等待进程退出后才发布完成结果。
 * @param {object} result 原生工具的成功、取消或失败结果。
 * @returns {void} 无返回值。
 */
function finish(result) {
  if (process.connected) process.send({ type: 'result', result }, () => process.exit(0))
  else process.exit(0)
}

process.on('message', (message) => {
  try {
    // 预抓帧与截图复用同一短生命周期进程，保持原有冻结画面能力。
    if (message.type === 'prime') addon.primeScreenshotFrame()
    else if (message.type === 'capture')
      addon.startRegionCaptureWithPrimedFrame(message.options || {}, finish)
    else if (message.type === 'color-picker') addon.startColorPicker(finish)
  } catch (error) {
    finish({ success: false, error: error.message || String(error) })
  }
})
// 宿主异常退出时不允许原生覆盖层成为孤儿进程。
process.on('disconnect', () => process.exit(0))
