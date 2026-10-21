let started = 0,
  phase = 'preparing'
const status = document.querySelector('#status'),
  detail = document.querySelector('#detail'),
  stop = document.querySelector('#stop')
/**
 * 根据控制条自身的会话更新经过时间。
 * @returns {void} 无返回值。
 */
function tick() {
  if (phase !== 'recording') return
  const elapsed = Math.floor((Date.now() - started) / 1000)
  status.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
}
const timer = setInterval(tick, 500)
window.recorder.onState((state) => {
  phase = state.phase
  started = state.started || 0
  if (phase === 'recording') tick()
  else status.textContent = state.message || '准备录制'
  stop.disabled = phase === 'saving'
  stop.textContent = phase === 'countdown' ? '取消' : '停止'
  detail.textContent = phase === 'saving' ? '正在封装 MP4，请稍候' : '停止并保存 · 可拖动'
})
stop.addEventListener('click', () => window.recorder.stop())
window.addEventListener('beforeunload', () => clearInterval(timer), { once: true })
