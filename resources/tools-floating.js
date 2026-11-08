/**
 * 查找当前窗口中的固定控件。
 * @param {string} id 控件标识。
 * @returns {HTMLElement} 对应控件。
 */
const $ = (id) => document.getElementById(id)
const canvas = $('canvas')
const ctx = canvas.getContext('2d')
const stage = $('stage')
// 两个编辑入口使用同一标记顺序、名称和线条图标；橡皮擦属于图片编辑操作。
const annotationCatalogue = window.annotationTools
$('drawing-tools').innerHTML = annotationCatalogue.tools
  .map(
    ({ id, label, key, path }) =>
      `<button class="tool-btn" data-tool="${id}" aria-label="${label}" aria-pressed="false" title="${label} (${key})">${annotationCatalogue.svg(path)}</button>`
  )
  .join('')
for (const [id, path] of Object.entries(annotationCatalogue.actions)) {
  const button = id === 'eraser' ? document.querySelector('[data-tool="eraser"]') : $(id)
  button.innerHTML = annotationCatalogue.svg(path)
}
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
// 每个工具拥有独立的本次窗口参数；切换只恢复自己的选择，不修改其他工具或持久配置。
const toolOptions = Object.fromEntries(
  [...annotationCatalogue.tools.map(({ id }) => id), 'eraser'].map((id) => [
    id,
    {
      color: id === 'highlighter' ? '#eeff00' : '#ff3b30',
      size: 4,
      font: 24
    }
  ])
)
let mosaicMode = 'brush',
  mosaicRadius = 22,
  mosaicDensity = 10,
  mosaicSample = null,
  mosaicSampleDensity = 0,
  mosaicPointer = null
const annotationFont = '"Microsoft YaHei", "Segoe UI", sans-serif'
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
  if (type === 'number') {
    const radius = Math.max(12, size * 3 + 8)
    ctx.arc(a.x, a.y, radius, 0, Math.PI * 2)
    ctx.fill()
    const rgb = color.match(/[a-f\d]{2}/gi).map((part) => parseInt(part, 16))
    ctx.fillStyle = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 170 ? '#333333' : '#ffffff'
    ctx.font = `bold ${Math.floor(radius * (shape.number > 99 ? 0.9 : 1.15))}px "Segoe UI", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(shape.number), a.x, a.y, radius * 1.6)
    ctx.textAlign = 'start'
  }
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
    drawArrow(a, b, size)
  }
  if (type === 'text') {
    ctx.font = `${font}px ${annotationFont}`
    ctx.textBaseline = 'top'
    ctx.fillText(text, a.x, a.y)
  }
}

/**
 * 沿用截图的内凹机翼箭头，按用户要求将箭尾收为单一尖点，短箭头保留长度钳制。
 * @param {{x:number,y:number}} a 起点。
 * @param {{x:number,y:number}} b 终点。
 * @param {number} thick 原图像素线宽。
 * @returns {void} 在当前填色下绘制两个相连多边形。
 */
function drawArrow(a, b, thick) {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (length < 1) return
  let headLength = thick * 4 + 8
  const headHalfWidth = thick * 2.4 + 5,
    notch = headLength * 0.4
  if (headLength > length) headLength = length * 0.6
  const ux = (b.x - a.x) / length,
    uy = (b.y - a.y) / length,
    nx = -uy,
    ny = ux
  const baseX = b.x - ux * headLength,
    baseY = b.y - uy * headLength
  const notchX = baseX + ux * notch,
    notchY = baseY + uy * notch
  const endHalfWidth = headHalfWidth * 0.55
  const endX = notchX + ux * 1.5,
    endY = notchY + uy * 1.5
  // 箭身与箭头略重叠，避免抗锯齿在连接处产生细缝。
  ctx.beginPath()
  // 起点只保留一个顶点，消除平切尾端，使箭身从真正的尖点逐渐变宽。
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(endX - nx * endHalfWidth, endY - ny * endHalfWidth)
  ctx.lineTo(endX + nx * endHalfWidth, endY + ny * endHalfWidth)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(baseX + nx * headHalfWidth, baseY + ny * headHalfWidth)
  ctx.lineTo(notchX, notchY)
  ctx.lineTo(baseX - nx * headHalfWidth, baseY - ny * headHalfWidth)
  ctx.closePath()
  ctx.fill()
}

/**
 * 释放当前会话的小尺寸马赛克采样图，不持有原图的额外完整副本。
 * @returns {void} 清空采样画布及其浓度身份。
 */
function releaseMosaicSample() {
  if (mosaicSample) mosaicSample.width = mosaicSample.height = 0
  mosaicSample = null
  mosaicSampleDensity = 0
}

/**
 * 将涂抹路径的圆和连接四边形加入同向蒙版，快速移动和重叠时不留洞。
 * @param {Path2D} mask 所有马赛克共用的并集路径。
 * @param {object} shape 一次涂抹或框选的历史参数。
 * @returns {void} 扩充路径，不修改底图或已提交标记。
 */
function addMosaicMask(mask, shape) {
  const a = shape.points[0],
    b = shape.points[shape.points.length - 1]
  if (shape.mode === 'rect') {
    mask.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
    return
  }
  const radius = shape.radius
  for (let i = 0; i < shape.points.length; i++) {
    const p = shape.points[i],
      previous = shape.points[Math.max(0, i - 1)]
    mask.moveTo(p.x + radius, p.y)
    mask.arc(p.x, p.y, radius, 0, Math.PI * 2)
    const distance = Math.hypot(p.x - previous.x, p.y - previous.y)
    if (!distance) continue
    const nx = (-(p.y - previous.y) / distance) * radius,
      ny = ((p.x - previous.x) / distance) * radius
    // 与圆保持相同绕向，非零填充规则才能对所有胶囊区域正确取并集。
    mask.moveTo(previous.x - nx, previous.y - ny)
    mask.lineTo(p.x - nx, p.y - ny)
    mask.lineTo(p.x + nx, p.y + ny)
    mask.lineTo(previous.x + nx, previous.y + ny)
    mask.closePath()
  }
}

/**
 * 仿照截图的揭示蒙版：统一采样原图，按涂抹和框选并集显示，浓度影响全部马赛克。
 * @param {object[]} visible 当前历史和正在绘制的标记。
 * @returns {void} 在底图上合成马赛克；无马赛克时立即释放采样图。
 */
function drawMosaics(visible) {
  const mosaics = visible.filter((shape) => shape.type === 'mosaic' && validShape(shape))
  if (!mosaics.length) {
    releaseMosaicSample()
    return
  }
  if (!mosaicSample || mosaicSampleDensity !== mosaicDensity) {
    releaseMosaicSample()
    mosaicSample = new OffscreenCanvas(
      Math.ceil(canvas.width / mosaicDensity),
      Math.ceil(canvas.height / mosaicDensity)
    )
    const sampleContext = mosaicSample.getContext('2d')
    sampleContext.imageSmoothingQuality = 'high'
    sampleContext.drawImage(image, 0, 0, mosaicSample.width, mosaicSample.height)
    mosaicSampleDensity = mosaicDensity
  }
  const mask = new Path2D()
  for (const shape of mosaics) addMosaicMask(mask, shape)
  ctx.save()
  ctx.clip(mask)
  // 最近邻放大保留色块边界，始终从原图采样，重叠不发生二次模糊。
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(mosaicSample, 0, 0, canvas.width, canvas.height)
  ctx.restore()
}

/**
 * 重绘原图和标记，并同步撤销按钮及已提交标记数量，供可见画布状态检查。
 * @returns {void} 无返回值。
 */
function render() {
  if (!image || disposed) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0)
  const visible = current ? [...shapes, current] : shapes
  drawMosaics(visible)
  const spotlights = visible.filter((shape) => shape.type === 'spotlight' && validShape(shape))
  if (spotlights.length) {
    // 先绘制区域并集的遮罩，重叠聚光区不重复变暗，其他标记始终清晰。
    ctx.save()
    for (const shape of spotlights) {
      const [a, b] = shape.points
      // 连续求各区域补集的交集，避免重叠孔洞反转，也无需额外分配整图遮罩。
      const outside = new Path2D()
      outside.rect(0, 0, canvas.width, canvas.height)
      outside.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
      ctx.clip(outside, 'evenodd')
    }
    ctx.fillStyle = 'rgba(0,0,0,0.56)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
  }
  for (const shape of visible) if (!['spotlight', 'mosaic'].includes(shape.type)) draw(shape)
  syncMosaicSelection()
  // 只发布已经提交到画布的标记数；按下画笔或临时拖动不冒充有效标注。
  canvas.dataset.annotationCount = String(shapes.length)
  canvas.dataset.nextNumber = String(nextNumber())
  const numberButton = document.querySelector('[data-tool="number"]')
  numberButton.title = `序号圆圈 (N) · 下一个 ${nextNumber()}`
  $('undo').disabled = !shapes.length
  $('redo').disabled = !undone.length
}

/**
 * 从当前有效历史计算下一个序号，撤销和清空后自然回退。
 * @returns {number} 下一枚圆圈的序号。
 */
function nextNumber() {
  return (
    Math.max(0, ...shapes.filter((shape) => shape.type === 'number').map((shape) => shape.number)) +
    1
  )
}

/**
 * 拒绝未拖出有效区域的标记，序号圆圈允许单击贴图。
 * @param {object} shape 待提交的标记。
 * @returns {boolean} 是否应进入撤销历史。
 */
function validShape(shape) {
  if (
    ['rect', 'ellipse', 'arrow', 'spotlight'].includes(shape.type) ||
    (shape.type === 'mosaic' && shape.mode === 'rect')
  ) {
    const [a, b = a] = shape.points
    return shape.type === 'spotlight' || shape.type === 'mosaic'
      ? Math.abs(b.x - a.x) >= 2 && Math.abs(b.y - a.y) >= 2
      : Math.hypot(b.x - a.x, b.y - a.y) >= 2
  }
  return true
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
  syncTextEntry()
  updateMosaicCursor()
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
 * 提交有效标记并清空重做分支；序号始终归属于可撤销的历史。
 * @returns {void} 无返回值。
 */
function finish() {
  if (!current) return
  if (validShape(current)) {
    shapes.push(current)
    undone = []
  }
  current = null
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
 * 将透明文字框贴在原图落点，字号随图片缩放，边框、文字与光标对应当前颜色。
 * @returns {void} 更新可见输入框的位置、颜色和按正文伸展的宽度。
 */
function syncTextEntry() {
  const entry = $('text-entry')
  if (!image || !textPosition || entry.hidden) return
  const rect = canvas.getBoundingClientRect(),
    scale = rect.width / canvas.width
  const font = Number($('font-size').value)
  ctx.save()
  ctx.font = `${font}px ${annotationFont}`
  const width = Math.max(20, ctx.measureText(entry.value || '').width) * scale + 12
  ctx.restore()
  const left = Math.max(1, rect.left + textPosition.x * scale - 5)
  const top = Math.max(1, rect.top + textPosition.y * scale - 5)
  entry.style.left = `${left}px`
  entry.style.top = `${top}px`
  entry.style.fontSize = `${font * scale}px`
  entry.style.width = `${Math.min(width, Math.max(20, innerWidth - left - 2))}px`
  entry.style.setProperty('--annotation-text-color', $('color').value)
}

/**
 * 同步马赛克笔的实际覆盖圆，离开图片或切换模式时撤下，不进入导出画布。
 * @param {PointerEvent|null} event 当前指针；省略时复用上次位置并重算缩放。
 * @returns {void} 更新独立DOM光标的显示和尺寸。
 */
function updateMosaicCursor(event = null) {
  if (event) mosaicPointer = { x: event.clientX, y: event.clientY }
  const cursor = $('mosaic-cursor'),
    rect = canvas.getBoundingClientRect()
  const visible =
    content?.edit &&
    tool === 'mosaic' &&
    mosaicMode === 'brush' &&
    mosaicPointer &&
    mosaicPointer.x >= rect.left &&
    mosaicPointer.x < rect.right &&
    mosaicPointer.y >= rect.top &&
    mosaicPointer.y < rect.bottom
  cursor.hidden = !visible
  if (!visible) return
  cursor.style.left = `${mosaicPointer.x}px`
  cursor.style.top = `${mosaicPointer.y}px`
  cursor.style.width = `${(mosaicRadius * 2 * rect.width) / canvas.width}px`
  cursor.style.height = `${(mosaicRadius * 2 * rect.height) / canvas.height}px`
}

/**
 * 在框选期间显示边界参考线，导出和历史只保存区域蒙版。
 * @returns {void} 无有效框选时立即撤下边界。
 */
function syncMosaicSelection() {
  const selection = $('mosaic-selection')
  const visible = current?.type === 'mosaic' && current.mode === 'rect' && validShape(current)
  selection.hidden = !visible
  if (!visible) return
  const [a, b] = current.points,
    rect = canvas.getBoundingClientRect()
  selection.style.left = `${rect.left + (Math.min(a.x, b.x) * rect.width) / canvas.width}px`
  selection.style.top = `${rect.top + (Math.min(a.y, b.y) * rect.height) / canvas.height}px`
  selection.style.width = `${(Math.abs(b.x - a.x) * rect.width) / canvas.width}px`
  selection.style.height = `${(Math.abs(b.y - a.y) * rect.height) / canvas.height}px`
}

/**
 * 同步马赛克图标选中态，框选不展示无效笔刷大小，颜色不影响马赛克。
 * @returns {void} 调整控件与光标，不改变已提交路径的笔刷半径。
 */
function syncMosaicControls() {
  $('mosaic-controls').hidden = tool !== 'mosaic'
  $('mosaic-brush-sizes').hidden = mosaicMode !== 'brush'
  document.querySelectorAll('[data-mosaic-mode]').forEach((button) => {
    const active = button.dataset.mosaicMode === mosaicMode
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  })
  document.querySelectorAll('[data-mosaic-radius]').forEach((button) => {
    const active = Number(button.dataset.mosaicRadius) === mosaicRadius
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  })
  document.querySelectorAll('[data-mosaic-density]').forEach((button) => {
    const active = Number(button.dataset.mosaicDensity) === mosaicDensity
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  })
  canvas.style.cursor =
    tool === 'mosaic' && mosaicMode === 'brush' ? 'none' : tool === 'text' ? 'text' : 'crosshair'
  fit()
}

/**
 * 用截图同款2×2、3×3、4×4棋盘格表示浓度，图案随当前按钮颜色显示。
 * @param {number} divisions 棋盘每边格数，取自本地固定控件。
 * @returns {string} 不含可见文字的SVG图标。
 */
function mosaicDensityIcon(divisions) {
  const step = 16 / divisions,
    cells = [],
    lines = []
  for (let row = 0; row < divisions; row++) {
    for (let column = 0; column < divisions; column++) {
      if ((row + column) % 2 === 0)
        cells.push(
          `<rect x="${4 + column * step}" y="${4 + row * step}" width="${step}" height="${step}"/>`
        )
    }
  }
  for (let i = 0; i <= divisions; i++) {
    const p = 4 + i * step
    lines.push(`M${p} 4V20M4 ${p}H20`)
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor">${cells.join('')}</g><path d="${lines.join('')}" fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="0.8"/></svg>`
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
 * 恢复当前工具独立颜色并显示对应参数；文字使用字形字号而非笔触圆点。
 * @returns {void} 无返回值。
 */
function syncColor() {
  const highlighter = tool === 'highlighter'
  const color = toolOptions[tool].color
  $('color').value = color
  $('color-preview').style.background = color
  $('color-toggle').setAttribute('aria-label', highlighter ? '荧光笔颜色' : '画笔颜色')
  document.querySelectorAll('[data-color]').forEach((button) => {
    button.hidden = highlighter && ['#1c1c1e', '#ffffff'].includes(button.dataset.color)
    button.setAttribute('aria-pressed', String(button.dataset.color === color))
  })
  $('highlighter-yellow').hidden = !highlighter
  // 聚光灯只定义清晰区域，不显示无效颜色及笔触参数。
  document.querySelector('.color-control').hidden = ['spotlight', 'mosaic'].includes(tool)
  document.querySelector('.size-control').hidden = ['spotlight', 'mosaic', 'text'].includes(tool)
  $('font-control').hidden = tool !== 'text'
  syncTextEntry()
}

/**
 * 恢复当前工具的独立笔触、字号与颜色，并同步按钮选中态和正在编辑的文字。
 * @returns {void} 只更新当前窗口控件，不改写已有标记或其他工具的参数。
 */
function syncAnnotationStyle() {
  const options = toolOptions[tool]
  $('size').value = String(options.size)
  $('font-size').value = String(options.font)
  document.querySelectorAll('[data-size]').forEach((button) => {
    const active = Number(button.dataset.size) === options.size
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  })
  document.querySelectorAll('[data-font-size]').forEach((button) => {
    const active = Number(button.dataset.fontSize) === options.font
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  })
  syncColor()
}

document.querySelectorAll('[data-tool]').forEach((button) =>
  button.addEventListener('click', () => {
    finishText(true)
    tool = button.dataset.tool
    syncAnnotationStyle()
    togglePalette(false)
    document.querySelectorAll('[data-tool]').forEach((item) => {
      item.classList.toggle('active', item === button)
      item.setAttribute('aria-pressed', String(item === button))
    })
    mosaicPointer = null
    syncMosaicControls()
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
    syncTextEntry()
    $('text-entry').focus()
    return
  }
  canvas.setPointerCapture(event.pointerId)
  current = {
    type: tool,
    points: [point(event)],
    color: $('color').value,
    size: Number($('size').value),
    font: Number($('font-size').value),
    number: tool === 'number' ? nextNumber() : undefined,
    mode: tool === 'mosaic' ? mosaicMode : undefined,
    radius: tool === 'mosaic' ? mosaicRadius : undefined
  }
  render()
})
canvas.addEventListener('pointermove', (event) => {
  updateMosaicCursor(event)
  if (!current || current.type === 'number') return
  const next = point(event)
  if (
    ['pen', 'highlighter', 'eraser'].includes(current.type) ||
    (current.type === 'mosaic' && current.mode === 'brush')
  ) {
    if (current.points.length < 20000) current.points.push(next)
  } else current.points[1] = next
  render()
})
canvas.addEventListener('pointerleave', () => {
  mosaicPointer = null
  updateMosaicCursor()
})
canvas.addEventListener('pointerup', finish)
canvas.addEventListener('pointercancel', () => {
  current = null
  render()
})
$('text-entry').addEventListener('keydown', (event) => {
  // 输入法确认候选仍属于原生编辑，不能提前提交整个文字标记。
  if (event.isComposing) {
    event.stopPropagation()
    return
  }
  if (event.key === 'Enter' || event.key === 'Escape') {
    event.stopPropagation()
    finishText(event.key === 'Enter')
  }
})
$('text-entry').addEventListener('blur', () => finishText(true))
$('text-entry').addEventListener('input', syncTextEntry)
// 修改文字颜色时保留输入焦点，避免工具栏先触发blur而提前提交旧颜色。
for (const button of [
  $('color-toggle'),
  ...document.querySelectorAll('[data-color], [data-font-size]')
]) {
  button.addEventListener('pointerdown', (event) => {
    if (!$('text-entry').hidden) event.preventDefault()
  })
}
document.querySelectorAll('[data-mosaic-mode]').forEach((button) => {
  button.onclick = () => {
    mosaicMode = button.dataset.mosaicMode
    syncMosaicControls()
  }
})
document.querySelectorAll('[data-mosaic-radius]').forEach((button) => {
  button.onclick = () => {
    mosaicRadius = Number(button.dataset.mosaicRadius)
    syncMosaicControls()
  }
})
document.querySelectorAll('[data-mosaic-density]').forEach((button) => {
  button.innerHTML = mosaicDensityIcon(Number(button.dataset.grid))
  button.onclick = () => {
    mosaicDensity = Number(button.dataset.mosaicDensity)
    syncMosaicControls()
    render()
  }
})
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
    toolOptions[tool].color = button.dataset.color
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
  mosaicPointer = null
  updateMosaicCursor()
})
document.querySelectorAll('[data-size]').forEach((button) => {
  button.onclick = () => {
    toolOptions[tool].size = Number(button.dataset.size)
    syncAnnotationStyle()
  }
})
document.querySelectorAll('[data-font-size]').forEach((button) => {
  button.onclick = () => {
    toolOptions.text.font = Number(button.dataset.fontSize)
    syncAnnotationStyle()
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
stage.addEventListener('scroll', () => {
  syncTextEntry()
  syncMosaicSelection()
  mosaicPointer = null
  updateMosaicCursor()
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
      e: 'eraser',
      n: 'number',
      s: 'spotlight'
    }[key]
    if (selected) document.querySelector(`[data-tool="${selected}"]`).click()
  }
})
window.addEventListener('beforeunload', () => {
  disposed = true
  releaseMosaicSample()
  mosaicPointer = null
  $('mosaic-cursor').hidden = true
  $('mosaic-selection').hidden = true
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
