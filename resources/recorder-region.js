const selection = document.getElementById('selection'),
  toolbar = document.getElementById('toolbar'),
  sizes = document.getElementById('sizes'),
  widthInput = document.getElementById('width'),
  heightInput = document.getElementById('height')
let rect = {
    x: Math.round((innerWidth - Math.min(800, innerWidth - 40)) / 2),
    y: Math.max(48, Math.round((innerHeight - 800) / 2)),
    width: Math.min(800, innerWidth - 40),
    height: Math.min(600, innerHeight - 180)
  },
  drag = null
try {
  const saved = JSON.parse(
    localStorage.getItem('recorder-region-' + innerWidth + 'x' + innerHeight)
  )
  if (saved && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(saved[key])))
    rect = saved
} catch {
  /* 无历史选区时使用原版默认尺寸。 */
}
/**
 * 将矩形约束到当前显示器，允许任意边缘拖动但不产生越界区域。
 * @param {object} value 待约束矩形。
 * @returns {object} 合法矩形。
 */
function bounded(value) {
  const width = Math.max(16, Math.min(innerWidth, Math.round(value.width))),
    height = Math.max(16, Math.min(innerHeight, Math.round(value.height)))
  return {
    x: Math.max(0, Math.min(innerWidth - width, Math.round(value.x))),
    y: Math.max(0, Math.min(innerHeight - height, Math.round(value.y))),
    width,
    height
  }
}
/**
 * 更新选区及原版上下工具栏，靠近屏幕边缘时将控件翻转到可见位置。
 * @returns {void} 无返回值。
 */
function render() {
  rect = bounded(rect)
  Object.assign(selection.style, {
    left: rect.x + 'px',
    top: rect.y + 'px',
    width: rect.width + 'px',
    height: rect.height + 'px'
  })
  if (document.activeElement !== widthInput) widthInput.value = rect.width
  if (document.activeElement !== heightInput) heightInput.value = rect.height
  Object.assign(sizes.style, {
    left: Math.min(rect.x, innerWidth - sizes.offsetWidth - 8) + 'px',
    top: (rect.y >= 44 ? rect.y - 38 : rect.y + 8) + 'px'
  })
  const top = rect.y + rect.height + 16,
    height = toolbar.offsetHeight
  Object.assign(toolbar.style, {
    left: Math.max(10, Math.min(rect.x, innerWidth - toolbar.offsetWidth - 10)) + 'px',
    top:
      Math.max(
        10,
        top + height <= innerHeight - 10
          ? top
          : rect.y - height - 16 >= 10
            ? rect.y - height - 16
            : Math.min(innerHeight - height - 10, rect.y + rect.height - height - 10)
      ) + 'px'
  })
}
/**
 * 完成显式确认，向所属宿主提交矩形及本次工具栏选项。
 * @returns {void} 无返回值。
 */
function confirm() {
  if (document.getElementById('start').disabled) return
  const preferences = Object.fromEntries(
    ['systemAudio', 'microphone', 'cursor', 'clicks', 'keys'].map((key) => [
      key,
      document.getElementById(key).checked
    ])
  )
  try {
    localStorage.setItem('recorder-region-' + innerWidth + 'x' + innerHeight, JSON.stringify(rect))
  } catch {
    /* 存储受限不影响本次录制。 */
  }
  window.recorder.select({ ...rect, preferences })
}
document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || event.target.closest('#toolbar, #sizes')) return
  drag = {
    x: event.clientX,
    y: event.clientY,
    rect: { ...rect },
    edge: event.target.dataset.edge || (event.target.closest('#selection') ? 'move' : 'draw')
  }
  document.body.setPointerCapture(event.pointerId)
})
document.addEventListener('pointermove', (event) => {
  if (!drag) return
  const dx = event.clientX - drag.x,
    dy = event.clientY - drag.y,
    source = drag.rect,
    edge = drag.edge
  if (edge === 'move') rect = { ...source, x: source.x + dx, y: source.y + dy }
  else if (edge === 'draw')
    rect = {
      x: Math.min(drag.x, event.clientX),
      y: Math.min(drag.y, event.clientY),
      width: Math.abs(dx),
      height: Math.abs(dy)
    }
  else {
    const left = edge.includes('w')
      ? Math.max(0, Math.min(source.x + source.width - 16, source.x + dx))
      : source.x
    const top = edge.includes('n')
      ? Math.max(0, Math.min(source.y + source.height - 16, source.y + dy))
      : source.y
    const right = edge.includes('e')
      ? Math.max(source.x + 16, Math.min(innerWidth, source.x + source.width + dx))
      : source.x + source.width
    const bottom = edge.includes('s')
      ? Math.max(source.y + 16, Math.min(innerHeight, source.y + source.height + dy))
      : source.y + source.height
    rect = { x: left, y: top, width: right - left, height: bottom - top }
  }
  render()
})
document.addEventListener('pointerup', () => {
  drag = null
})
document.addEventListener('pointercancel', () => {
  drag = null
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.recorder.select(null)
    return
  }
  if (event.target.matches('input')) {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.target.blur()
    }
    return
  }
  if (event.key === 'Enter') confirm()
  else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault()
    rect.x += event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    rect.y += event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    render()
  }
})
widthInput.addEventListener('change', () => {
  rect.width = Number(widthInput.value) || rect.width
  render()
})
heightInput.addEventListener('change', () => {
  rect.height = Number(heightInput.value) || rect.height
  render()
})
document.getElementById('start').addEventListener('click', confirm)
document.getElementById('cancel').addEventListener('click', () => window.recorder.select(null))
let audioPending = 0
const audioVersions = { systemAudio: 0, microphone: 0 }
/**
 * 对区域工具栏的声音勾选检查设备，不申请或保留录音流。
 * @param {Event} event 原生复选框事件。
 * @returns {Promise<void>} 枚举结束后的 Promise。
 */
async function checkAudio(event) {
  const request = ++audioVersions[event.target.id]
  if (!event.target.checked) return
  const start = document.getElementById('start'),
    error = document.getElementById('audio-error')
  audioPending++
  start.disabled = true
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    if (request !== audioVersions[event.target.id]) return
    const available = devices.some(
      (device) => device.kind === (event.target.id === 'systemAudio' ? 'audiooutput' : 'audioinput')
    )
    event.target.checked = available
    error.hidden = available
    error.textContent = available
      ? ''
      : event.target.id === 'systemAudio'
        ? '未检测到可用扬声器'
        : '麦克风未连接或未被识别'
  } catch (failure) {
    if (request === audioVersions[event.target.id]) {
      event.target.checked = false
      error.hidden = false
      error.textContent = failure.message
    }
  } finally {
    audioPending--
    start.disabled = audioPending > 0
  }
}
document.getElementById('systemAudio').addEventListener('change', checkAudio)
document.getElementById('microphone').addEventListener('change', checkAudio)
window.recorder.onRegion(({ options }) => {
  for (const key of ['systemAudio', 'microphone', 'cursor', 'clicks', 'keys'])
    document.getElementById(key).checked = !!options[key]
  const style = document.documentElement.style
  if (/^#[\da-f]{3,8}$/i.test(options.primaryColor || ''))
    style.setProperty('--primary', options.primaryColor)
  if (options.theme === 'dark') {
    style.colorScheme = 'dark'
    style.setProperty('--surface', '#252a27')
    style.setProperty('--text', '#e7eee9')
    style.setProperty('--border', '#46534b')
    style.setProperty('--secondary', '#a9b7ad')
  }
  render()
})
render()
