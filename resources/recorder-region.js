const selection = document.getElementById('selection'),
  toolbar = document.getElementById('toolbar'),
  sizes = document.getElementById('sizes'),
  hint = document.getElementById('hint'),
  startButton = document.getElementById('start'),
  widthInput = document.getElementById('width'),
  heightInput = document.getElementById('height')
// 打开时保持待选状态，由用户拖出录制区域，不再预置 800×600 选区。
let rect = null,
  drag = null,
  audioPending = 0
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
 * 同步“开始录制”按钮，仅在已有合法选区且没有声音检查任务时可用。
 * @returns {void} 无返回值。
 */
function syncStartButton() {
  startButton.disabled = !rect || audioPending > 0
}
/**
 * 更新选区及原版上下工具栏，靠近屏幕边缘时将控件翻转到可见位置。
 * 没有选区时只显示待选提示，并把工具栏居中放在屏幕底部。
 * @returns {void} 无返回值。
 */
function render() {
  selection.hidden = !rect
  sizes.hidden = !rect
  hint.textContent = rect
    ? '拖动调整录制区域 · Enter 开始 · Esc 取消'
    : '拖动鼠标选择录制区域 · Esc 取消'
  syncStartButton()
  if (!rect) {
    Object.assign(toolbar.style, {
      left: Math.max(10, Math.round((innerWidth - toolbar.offsetWidth) / 2)) + 'px',
      top: Math.max(10, innerHeight - toolbar.offsetHeight - 24) + 'px'
    })
    return
  }
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
  if (!rect || startButton.disabled) return
  const preferences = Object.fromEntries(
    ['systemAudio', 'microphone', 'cursor', 'clicks', 'keys'].map((key) => [
      key,
      document.getElementById(key).checked
    ])
  )
  window.recorder.select({ ...rect, preferences })
}
document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || event.target.closest('#toolbar, #sizes')) return
  // 阻止原生图片/文本选择，确保选区拖动始终由本页面接管。
  event.preventDefault()
  drag = {
    x: event.clientX,
    y: event.clientY,
    rect: rect ? { ...rect } : null,
    edge:
      event.target.dataset.edge || (rect && event.target.closest('#selection') ? 'move' : 'draw')
  }
  if (drag.edge === 'draw') {
    rect = {
      x: Math.round(event.clientX),
      y: Math.round(event.clientY),
      width: 16,
      height: 16
    }
    render()
  }
  document.body.setPointerCapture(event.pointerId)
})
document.addEventListener('pointermove', (event) => {
  if (!drag) return
  const dx = event.clientX - drag.x,
    dy = event.clientY - drag.y,
    source = drag.rect,
    edge = drag.edge
  if (edge === 'move' && source) rect = { ...source, x: source.x + dx, y: source.y + dy }
  else if (edge === 'draw' || !source)
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
  else if (rect && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault()
    rect.x += event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    rect.y += event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    render()
  }
})
widthInput.addEventListener('change', () => {
  if (!rect) return
  rect.width = Number(widthInput.value) || rect.width
  render()
})
heightInput.addEventListener('change', () => {
  if (!rect) return
  rect.height = Number(heightInput.value) || rect.height
  render()
})
document.getElementById('start').addEventListener('click', confirm)
document.getElementById('cancel').addEventListener('click', () => window.recorder.select(null))
const audioVersions = { systemAudio: 0, microphone: 0 }
/**
 * 对区域工具栏的声音勾选检查设备，不申请或保留录音流。
 * @param {Event} event 原生复选框事件。
 * @returns {Promise<void>} 枚举结束后的 Promise。
 */
async function checkAudio(event) {
  const request = ++audioVersions[event.target.id]
  if (!event.target.checked) return
  const error = document.getElementById('audio-error')
  audioPending++
  syncStartButton()
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
    syncStartButton()
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
