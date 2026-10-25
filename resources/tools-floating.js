/**
 * 查找当前窗口中的固定控件。
 * @param {string} id 控件标识。
 * @returns {HTMLElement} 对应控件。
 */
const $ = (id) => document.getElementById(id)
const canvas = $('canvas')
const ctx = canvas.getContext('2d')
const stage = $('stage')
let content,
  image,
  pinnedTop = true,
  tool = 'pen',
  current = null,
  textPosition = null
let shapes = [],
  undone = [],
  disposed = false
let resizeStart = null
let dragStart = null
let penColor = '#ff3b30',
  highlighterColor = '#eeff00'
const noteColors = {
  '#c1f3bd': '#adeea8',
  '#d3bdf3': '#bfa8e6',
  '#f3cbbd': '#e7b2a1',
  '#bdd7f3': '#9bc1e6',
  '#f3f0bd': '#e6de9c'
}

/**
 * 执行宿主操作并统一显示错误，避免未处理的 IPC 拒绝。
 * @param {string} action 窗口操作名称。
 * @param {unknown} value 操作参数。
 * @returns {Promise<unknown>} 宿主结果。
 */
async function invoke(action, value) {
  try {
    return await window.floating.invoke(action, value)
  } catch (error) {
    $('status').textContent = error.message
    $('status').classList.add('error')
    return undefined
  }
}

/**
 * 按原图坐标绘制单个矢量标记，避免撤销历史保存多份大图。
 * @param {object} shape 标记与画笔参数。
 * @returns {void} 无返回值。
 */
function draw(shape) {
  const { points, color, size, font, type, text } = shape
  const a = points[0],
    b = points[points.length - 1]
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (type === 'pen' || type === 'highlighter') {
    ctx.globalAlpha = type === 'highlighter' ? 0.3 : 1
    ctx.lineWidth = type === 'highlighter' ? size * 4 : size
    ctx.moveTo(a.x, a.y)
    for (const p of points) ctx.lineTo(p.x, p.y)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  if (type === 'eraser') {
    // 仅在笔迹范围恢复原图，擦除操作也进入矢量历史以支持撤销。
    ctx.save()
    const radius = Math.max(3, size * 2)
    for (let index = 0; index < points.length; index++) {
      const p = points[index],
        previous = points[Math.max(0, index - 1)]
      const steps = Math.max(1, Math.ceil(Math.hypot(p.x - previous.x, p.y - previous.y) / radius))
      for (let step = 0; step <= steps; step++) {
        const x = previous.x + ((p.x - previous.x) * step) / steps
        const y = previous.y + ((p.y - previous.y) * step) / steps
        ctx.moveTo(x + radius, y)
        ctx.arc(x, y, radius, 0, Math.PI * 2)
      }
    }
    ctx.clip()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0)
    ctx.restore()
  }
  if (type === 'rect') ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
  if (type === 'ellipse') {
    ctx.ellipse(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      Math.abs(b.x - a.x) / 2,
      Math.abs(b.y - a.y) / 2,
      0,
      0,
      Math.PI * 2
    )
    ctx.stroke()
  }
  if (type === 'arrow') {
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    const angle = Math.atan2(b.y - a.y, b.x - a.x),
      length = Math.max(12, size * 4)
    ctx.beginPath()
    ctx.moveTo(b.x, b.y)
    ctx.lineTo(b.x - length * Math.cos(angle - 0.5), b.y - length * Math.sin(angle - 0.5))
    ctx.lineTo(b.x - length * Math.cos(angle + 0.5), b.y - length * Math.sin(angle + 0.5))
    ctx.closePath()
    ctx.fill()
  }
  if (type === 'text') {
    ctx.font = `${font}px sans-serif`
    ctx.textBaseline = 'top'
    ctx.fillText(text, a.x, a.y)
  }
  if (type === 'mosaic') {
    // 马赛克采样当前图像的固定网格，真实遮盖内容而非绘制半透明色块。
    const block = Math.max(8, size * 2)
    for (const p of points) {
      const x = Math.max(0, Math.floor(p.x / block) * block),
        y = Math.max(0, Math.floor(p.y / block) * block)
      const w = Math.min(block, canvas.width - x),
        h = Math.min(block, canvas.height - y)
      if (w <= 0 || h <= 0) continue
      const pixel = ctx.getImageData(
        Math.min(canvas.width - 1, x + Math.floor(w / 2)),
        Math.min(canvas.height - 1, y + Math.floor(h / 2)),
        1,
        1
      ).data
      ctx.fillStyle = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`
      ctx.fillRect(x, y, w, h)
    }
  }
}

/**
 * 重绘原图和标记，并同步撤销按钮及已提交标记数量，供可见画布状态检查。
 * @returns {void} 无返回值。
 */
function render() {
  if (!image || disposed) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0)
  for (const shape of shapes) draw(shape)
  if (current) draw(current)
  // 只发布已经提交到画布的标记数；按下画笔或临时拖动不冒充有效标注。
  canvas.dataset.annotationCount = String(shapes.length)
  $('undo').disabled = !shapes.length
  $('redo').disabled = !undone.length
}

/**
 * 在可见区域适配图片，100% 模式允许滚动查看原始分辨率。
 * @returns {void} 无返回值。
 */
function fit() {
  if (!image) return
  if (!content.edit) {
    // 透明窗口本身已锁定图片比例，画布铺满客户区消除整数像素舍入后的透明细条。
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    return
  }
  const zoom = $('zoom').value
  const scale =
    zoom === 'fit'
      ? Math.min(
          1,
          (stage.clientWidth - (content.edit ? 16 : 0)) / canvas.width,
          (stage.clientHeight - (content.edit ? 16 : 0)) / canvas.height
        )
      : Number(zoom)
  canvas.style.width = `${Math.max(1, canvas.width * scale)}px`
  canvas.style.height = `${Math.max(1, canvas.height * scale)}px`
}

/**
 * 将指针转换为有界的原始图像坐标。
 * @param {PointerEvent} event 当前指针事件。
 * @returns {{x:number,y:number}} 图像坐标。
 */
function point(event) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: Math.max(
      0,
      Math.min(canvas.width - 1, ((event.clientX - rect.left) * canvas.width) / rect.width)
    ),
    y: Math.max(
      0,
      Math.min(canvas.height - 1, ((event.clientY - rect.top) * canvas.height) / rect.height)
    )
  }
}

/**
 * 固定当前标记并限制单窗口历史大小。
 * @returns {void} 无返回值。
 */
function finish() {
  if (!current) return
  shapes.push(current)
  current = null
  undone = []
  render()
}

/**
 * 结束文字标记输入，空文字不会产生撤销项。
 * @param {boolean} save 是否保留当前输入。
 * @returns {void} 无返回值。
 */
function finishText(save) {
  if ($('text-entry').hidden) return
  if (save && $('text-entry').value.trim()) {
    current = {
      type: 'text',
      points: [textPosition],
      text: $('text-entry').value,
      color: $('color').value,
      size: Number($('size').value),
      font: Number($('font-size').value)
    }
    finish()
  }
  $('text-entry').hidden = true
  $('text-entry').value = ''
  textPosition = null
}

/**
 * 应用原便签的纸色和标题栏色，仅改变当前窗口外观。
 * @param {string} color 五种预设纸色之一。
 * @returns {void} 无返回值。
 */
function updateNoteAppearance(color) {
  const paper = noteColors[color] ? color : '#f3f0bd'
  document.body.style.setProperty('--note-color', paper)
  document.body.style.setProperty('--note-header', noteColors[paper])
  document.querySelectorAll('[data-note-color]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.noteColor === paper))
  })
}

/**
 * 将剪贴板新增条目接到当前编辑内容末尾，并滚动定位；不覆盖用户已有编辑。
 * @param {string[]} texts 本批追加的剪贴板文字。
 * @returns {void} 无返回值。
 */
function appendNoteText(texts) {
  if (disposed || content?.type !== 'text') return
  const note = $('note')
  const addition = texts.filter((text) => typeof text === 'string' && text.length).join('\n\n')
  if (!addition) return
  const combined = [note.value, addition].filter(Boolean).join('\n\n')
  if (combined.length > 1_000_000) {
    $('note-label').textContent = '内容过长，请新建便签后追加'
    return
  }
  note.value = combined
  note.focus()
  note.setSelectionRange(note.value.length, note.value.length)
  note.scrollTop = note.scrollHeight
  $('note-label').textContent = `${content.label} · 已追加`
}
const unsubscribeAppend = window.floating.onAppend(appendNoteText)
const unsubscribeDock = window.floating.onDock((state) => {
  document.body.dataset.dock = !state || state.expanded ? 'expanded' : 'collapsed'
  document.body.dataset.edge = state?.edge || ''
  $('note-dock-tab').hidden = !state || state.expanded
  // 竖排色签去掉标签里的空格，避免“便签 1”在竖直方向拉开过大间距。
  $('note-dock-tab').textContent = (content?.label || '便签').replace(/\s+/g, '')
  $('note-options').hidden = true
})
const unsubscribePointer = window.floating.onPointer((inside) => {
  document.body.dataset.pointer = inside ? 'inside' : 'outside'
})
const unsubscribeDockPreference = window.floating.onDockPreference((enabled) => {
  $('note-dock-toggle').checked = enabled
})

/**
 * 展开或收起颜色面板，并把浮层约束在可见窗口内。
 * @param {boolean} visible 是否显示预设配色。
 * @returns {void} 无返回值。
 */
function togglePalette(visible) {
  const palette = $('color-palette')
  palette.hidden = !visible
  $('color-toggle').setAttribute('aria-expanded', String(visible))
  if (!visible) return
  const rect = $('color-toggle').getBoundingClientRect()
  palette.style.left = `${Math.max(6, Math.min(rect.left, innerWidth - palette.offsetWidth - 6))}px`
  palette.style.top = `${Math.max(6, Math.min(rect.bottom + 5, innerHeight - palette.offsetHeight - 6))}px`
}

/**
 * 同步两种窗口的置顶按钮，不替换原插件图标。
 * @returns {Promise<void>} 操作完成后的 Promise。
 */
async function toggleTop() {
  const result = await invoke('top', !pinnedTop)
  if (typeof result !== 'boolean') return
  pinnedTop = result
  for (const id of ['top', 'note-top', 'float-top']) {
    $(id).setAttribute('aria-pressed', String(pinnedTop))
    $(id).title = pinnedTop ? '取消置顶' : '保持置顶'
  }
}

/**
 * 切换工具时恢复各自颜色；其他标注共用画笔颜色，荧光笔不提供黑白色。
 * @returns {void} 无返回值。
 */
function syncColor() {
  const highlighter = tool === 'highlighter'
  const color = highlighter ? highlighterColor : penColor
  $('color').value = color
  $('color-preview').style.background = color
  $('color-toggle').setAttribute('aria-label', highlighter ? '荧光笔颜色' : '画笔颜色')
  document.querySelectorAll('[data-color]').forEach((button) => {
    button.hidden = highlighter && ['#1c1c1e', '#ffffff'].includes(button.dataset.color)
    button.setAttribute('aria-pressed', String(button.dataset.color === color))
  })
  $('highlighter-yellow').hidden = !highlighter
}

document.querySelectorAll('[data-tool]').forEach((button) =>
  button.addEventListener('click', () => {
    finishText(true)
    tool = button.dataset.tool
    syncColor()
    togglePalette(false)
    document
      .querySelectorAll('[data-tool]')
      .forEach((item) => item.classList.toggle('active', item === button))
    canvas.style.cursor = tool === 'text' ? 'text' : 'crosshair'
  })
)
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !content?.edit) return
  // 阻止画布的默认焦点转移，否则刚显示的文字输入会立即 blur 并被清空。
  event.preventDefault()
  if (shapes.length >= 200) {
    $('status').textContent = '已达 200 个标记，请复制或保存后继续编辑'
    return
  }
  finishText(true)
  if (tool === 'text') {
    textPosition = point(event)
    $('text-entry').hidden = false
    $('text-entry').style.left = `${Math.max(8, Math.min(event.clientX, innerWidth - 240))}px`
    $('text-entry').style.top = `${Math.max(8, Math.min(event.clientY, innerHeight - 44))}px`
    $('text-entry').focus()
    return
  }
  canvas.setPointerCapture(event.pointerId)
  current = {
    type: tool,
    points: [point(event)],
    color: $('color').value,
    size: Number($('size').value),
    font: Number($('font-size').value)
  }
})
canvas.addEventListener('pointermove', (event) => {
  if (!current) return
  const next = point(event)
  if (['pen', 'highlighter', 'eraser', 'mosaic'].includes(current.type)) {
    if (current.points.length < 20000) current.points.push(next)
  } else current.points[1] = next
  render()
})
canvas.addEventListener('pointerup', finish)
canvas.addEventListener('pointercancel', () => {
  current = null
  render()
})
$('text-entry').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === 'Escape') {
    event.stopPropagation()
    finishText(event.key === 'Enter')
  }
})
$('text-entry').addEventListener('blur', () => finishText(true))
$('undo').onclick = () => {
  finishText(true)
  if (shapes.length) undone.push(shapes.pop())
  render()
}
$('redo').onclick = () => {
  if (undone.length) shapes.push(undone.pop())
  render()
}
// 保留编辑区焦点，原生撤销历史才能精确作用于当前便签。
for (const action of ['undo', 'redo']) {
  $(`note-${action}`).onmousedown = (event) => event.preventDefault()
  $(`note-${action}`).onclick = () => invoke(`note-${action}`)
}
$('clear').onclick = () => {
  finishText(false)
  shapes = []
  undone = []
  render()
}
$('zoom').onchange = fit
$('color-toggle').onclick = () => togglePalette($('color-palette').hidden)
document.querySelectorAll('[data-color]').forEach((button) => {
  button.onclick = () => {
    if (tool === 'highlighter') highlighterColor = button.dataset.color
    else penColor = button.dataset.color
    syncColor()
    togglePalette(false)
  }
})
document.querySelectorAll('[data-note-color]').forEach((button) => {
  button.onclick = () => updateNoteAppearance(button.dataset.noteColor)
})
$('note-more').onclick = () => {
  $('note-options').hidden = !$('note-options').hidden
  $('note-more').setAttribute('aria-expanded', String(!$('note-options').hidden))
}
$('note-opacity').oninput = () => {
  document.querySelector('.frame').style.opacity = Number($('note-opacity').value) / 100
}
$('note-dock-toggle').onchange = async () => {
  const enabled = await invoke('dock', $('note-dock-toggle').checked)
  // 宿主拒绝时回滚界面状态，避免显示与实际贴靠行为不一致。
  if (typeof enabled === 'boolean') $('note-dock-toggle').checked = enabled
}
/**
 * 在编辑完成后校验便签字号，允许清空并连续手动输入。
 * @returns {void} 无返回值。
 */
function applyNoteFontSize() {
  const requested = Number($('note-font-size').value)
  const size = Math.max(12, Math.min(32, requested > 0 ? Math.round(requested) : 14))
  $('note-font-size').value = String(size)
  $('note').style.fontSize = `${size}px`
}
$('note-font-size').onchange = applyNoteFontSize
$('note-font-size').onblur = applyNoteFontSize
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.color-control, #color-palette')) togglePalette(false)
  if (!event.target.closest('#note-options, #note-more')) {
    $('note-options').hidden = true
    $('note-more').setAttribute('aria-expanded', 'false')
  }
  const handle =
    content?.type === 'text'
      ? event.target.closest('#note-header, #note-dock-tab')
      : !content?.edit
        ? event.target.closest('#canvas')
        : null
  if (!handle || event.button !== 0 || event.target.closest('button, input, select, textarea'))
    return
  // 用客户区指针拖动避免原生 app-region 吞掉悬停，屏幕坐标随窗口移动保持连续。
  dragStart = {
    id: event.pointerId,
    x: event.screenX,
    y: event.screenY,
    left: window.screenX,
    top: window.screenY,
    width: innerWidth,
    height: innerHeight,
    // 收起色签的拖动同时也是点击目标：位移很小按点击处理。
    tab: Boolean(event.target.closest('#note-dock-tab')),
    moved: false
  }
  handle.setPointerCapture(event.pointerId)
  void invoke('drag-start')
  event.preventDefault()
})
document.addEventListener('pointermove', (event) => {
  if (!dragStart || dragStart.id !== event.pointerId) return
  if (Math.abs(event.screenX - dragStart.x) + Math.abs(event.screenY - dragStart.y) > 4)
    dragStart.moved = true
  const drag = dragStart
  void invoke('move', {
    x: dragStart.left + event.screenX - dragStart.x,
    y: dragStart.top + event.screenY - dragStart.y,
    width: dragStart.width,
    height: dragStart.height
  }).then((result) => {
    // 色签拖出后以恢复后的纸张为拖动基准，避免下一帧沿用小标签的旧坐标跳出屏幕。
    if (result?.undocked && dragStart === drag) {
      Object.assign(drag, {
        left: result.bounds.x,
        top: result.bounds.y,
        x: event.screenX,
        y: event.screenY,
        tab: false
      })
    }
  })
})
/**
 * 结束标题栏或色签拖动：位移很小的色签操作按点击解除贴靠，其余交给宿主判定贴靠。
 * @param {Event} event 指针结束或窗口失焦事件；取消时仅释放宿主拖动态。
 * @returns {void} 无返回值。
 */
function endDrag(event) {
  const drag = dragStart
  dragStart = null
  if (!drag) return
  const cancelled = event.type !== 'pointerup'
  void invoke('drag-end', { moved: !cancelled && drag.moved })
  if (cancelled) return
  if (content?.type !== 'text') return
  if (drag.tab && !drag.moved) {
    void invoke('undock')
    return
  }
}
document.addEventListener('pointerup', endDrag)
document.addEventListener('pointercancel', endDrag)
document.querySelectorAll('[data-resize]').forEach((handle) => {
  handle.onpointerdown = (event) => {
    if (event.button !== 0) return
    resizeStart = {
      x: event.screenX,
      y: event.screenY,
      left: window.screenX,
      top: window.screenY,
      width: innerWidth,
      height: innerHeight,
      direction: handle.dataset.resize
    }
    handle.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  handle.onpointermove = (event) => {
    if (!resizeStart) return
    const start = resizeStart,
      direction = start.direction
    const dx = event.screenX - start.x,
      dy = event.screenY - start.y
    const width = Math.max(
      content.type === 'text' ? 220 : content.edit ? 320 : 96,
      Math.min(
        3000,
        start.width + (direction.includes('w') ? -dx : direction.includes('e') ? dx : 0)
      )
    )
    const height = Math.max(
      content.type === 'text' ? 140 : content.edit ? 180 : 64,
      Math.min(
        3000,
        start.height + (direction.includes('n') ? -dy : direction.includes('s') ? dy : 0)
      )
    )
    void invoke('resize', {
      width,
      height,
      x: start.left + (direction.includes('w') ? start.width - width : 0),
      y: start.top + (direction.includes('n') ? start.height - height : 0),
      // 宿主按拖动方向固定对侧边缘；图片悬浮会按比例重算尺寸，必须知道拖的是哪条边。
      direction
    })
  }
  handle.addEventListener('pointerup', () => {
    resizeStart = null
  })
  handle.addEventListener('pointercancel', () => {
    resizeStart = null
  })
})
window.addEventListener('blur', () => {
  endDrag({ type: 'blur' })
  resizeStart = null
  togglePalette(false)
})
document.querySelectorAll('[data-size]').forEach((button) => {
  button.onclick = () => {
    $('size').value = button.dataset.size
    document.querySelectorAll('[data-size]').forEach((item) => {
      item.classList.toggle('active', item === button)
      item.setAttribute('aria-pressed', String(item === button))
    })
  }
})
$('close').onclick = () => invoke('close')
$('note-close').onclick = () => invoke('close')
$('float-close').onclick = () => invoke('close')
$('float-top').onclick = toggleTop
$('new-note').onclick = () => invoke('new-note')
$('top').onclick = toggleTop
$('note-top').onclick = toggleTop
$('copy-text').onclick = () => invoke('copy-text', $('note').value)
$('copy-image').onclick = async () => {
  finishText(true)
  if (await invoke('copy-image', canvas.toDataURL('image/png')))
    $('status').textContent = '图片已复制'
}
$('save-image').onclick = async () => {
  finishText(true)
  if (await invoke('save-image', canvas.toDataURL('image/png')))
    $('status').textContent = '图片已保存'
}
window.addEventListener('resize', () => {
  fit()
  togglePalette(false)
})
document.addEventListener('keydown', (event) => {
  if (
    content?.type === 'text' &&
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'n'
  ) {
    event.preventDefault()
    $('new-note').click()
    return
  }
  if (event.key === 'Escape') {
    if (!$('color-palette').hidden) togglePalette(false)
    else if (!$('note-options').hidden) {
      $('note-options').hidden = true
      $('note-more').setAttribute('aria-expanded', 'false')
    } else invoke('close')
    return
  }
  // 输入文字时保留原生编辑快捷键，避免误触绘图或复制整图。
  if (content?.type !== 'image' || event.target.matches('input, textarea, select')) return
  const key = event.key.toLowerCase()
  // 单纯悬浮图片只保留复制/保存，不接受任何标注工具或历史快捷键。
  if (!content.edit && !((event.ctrlKey || event.metaKey) && ['c', 's'].includes(key))) return
  if (event.ctrlKey || event.metaKey) {
    const action = {
      z: event.shiftKey ? 'redo' : 'undo',
      y: 'redo',
      c: 'copy-image',
      s: 'save-image'
    }[key]
    if (!action) return
    event.preventDefault()
    $(action).click()
  } else {
    const selected = {
      b: 'pen',
      h: 'highlighter',
      r: 'rect',
      o: 'ellipse',
      a: 'arrow',
      t: 'text',
      m: 'mosaic',
      e: 'eraser'
    }[key]
    if (selected) document.querySelector(`[data-tool="${selected}"]`).click()
  }
})
window.addEventListener('beforeunload', () => {
  disposed = true
  unsubscribeAppend()
  unsubscribeDock()
  unsubscribePointer()
  unsubscribeDockPreference()
  shapes = []
  undone = []
  current = null
  resizeStart = null
  dragStart = null
  content = null
  $('note').value = ''
  if (image) {
    image.onload = null
    image.src = ''
    image = null
  }
  canvas.width = 0
  canvas.height = 0
})

/**
 * 从宿主取得本窗口内容后初始化视图，不保留工具插件页面。
 * @returns {Promise<void>} 初始化完成后的 Promise。
 */
async function init() {
  content = await invoke('init')
  if (!content || disposed) return
  document.body.dataset.kind = content.type
  document.body.dataset.mode = content.type === 'image' && !content.edit ? 'float' : 'edit'
  // 浮层移出带滤镜及滚动的工具栏，避免窄窗口裁剪色板。
  document.body.appendChild($('color-palette'))
  pinnedTop = content.top
  if (content.type === 'text') {
    document.title = content.label
    $('note-label').textContent = content.label
    $('note-header').hidden = false
    $('note-body').hidden = false
    $('note').value = content.text
    $('note-dock-toggle').checked = content.dockEnabled !== false
    applyNoteFontSize()
    updateNoteAppearance(content.color)
    content.text = undefined
    await invoke('ready')
    return
  }
  $('image-tools').hidden = !content.edit
  $('float-controls').hidden = !!content.edit
  $('stage').hidden = false
  canvas.hidden = false
  image = new Image()
  image.onload = async () => {
    if (disposed) return
    if (image.width * image.height > 40_000_000) {
      $('status').textContent = '图片超过 4000 万像素，请先裁剪后标记'
      image.src = ''
      return
    }
    canvas.width = image.width
    canvas.height = image.height
    render()
    fit()
    document.querySelector('[data-tool="pen"]').click()
    // 高竖图缩放后可能触发工具栏再次换行，有限次重测使图片与实际栏高共同收敛。
    for (let attempt = 0; attempt < 3; attempt++) {
      const toolbar = $('image-tools').offsetHeight
      await invoke('fit-image', { width: canvas.width, height: canvas.height, toolbar })
      if (disposed) return
      if ($('image-tools').offsetHeight === toolbar) break
    }
    fit()
    $('status').textContent = '拖动工具栏移动 · Esc 关闭 · Ctrl+Z 撤销 · Ctrl+S 保存 · Ctrl+C 复制'
    content.image = undefined
    void invoke('ready')
  }
  image.onerror = () => {
    $('status').textContent = '图片解码失败'
  }
  image.src = content.image
}
void init()
