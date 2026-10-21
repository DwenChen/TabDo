const { spawn } = require('node:child_process')
let recorder,
  addon,
  stopping = false,
  timer
/**
 * 通知原生录制器封装 MP4，超时只结束本工作进程创建的录制子进程。
 * @returns {void} 无返回值。
 */
function stop() {
  if (stopping) return
  stopping = true
  try {
    addon?.quit()
  } catch {}
  timer = setTimeout(() => recorder?.kill(), 7000)
  timer.unref()
}
process.on('message', (message) => {
  if (message?.type === 'stop') {
    stop()
    return
  }
  if (message?.type !== 'start' || recorder) return
  try {
    addon = require(message.addon)
    recorder = spawn(message.executable, message.args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let diagnostic = ''
    recorder.stderr.on('data', (chunk) => {
      diagnostic = (diagnostic + String(chunk)).slice(-4000)
    })
    recorder.stdout.on('data', (chunk) => {
      diagnostic = (diagnostic + String(chunk)).slice(-4000)
    })
    recorder.once('spawn', () => process.send?.({ type: 'ready', pid: recorder.pid }))
    recorder.once('error', (error) => {
      process.send?.({ type: 'error', message: error.message })
      process.exitCode = 1
    })
    recorder.once('close', (code) => {
      clearTimeout(timer)
      process.send?.({ type: 'finished', code, diagnostic }, () => {
        process.disconnect?.()
      })
    })
  } catch (error) {
    process.send?.({ type: 'error', message: error.message }, () => process.disconnect?.())
    process.exitCode = 1
  }
})
process.once('disconnect', stop)
process.once('SIGTERM', stop)
