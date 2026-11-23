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
  history = [],
  future = [],
  disposed = false
let resizeStart = null
let dragStart = null
// 选中标记与拖动会话：只修改已提交历史，选中框和手柄属于独立浮层，不写入导出图片。
let selectedShape = -1
let shapeEdit = null
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
// 聚光灯支持框选与笔触两种清晰区域；笔触复用马赛克的胶囊蒙版算法。
let spotlightMode = 'rect',
  spotlightRadius = 22,
  spotlightLayer = null
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
 * @param {CanvasRenderingContext2D} target 目标上下文；橡皮擦使用独立透明层。
 * @returns {void} 无返回值。
 */
function draw(shape, target = ctx) {
  const { points, color, size, font, type, text } = shape
  const a = points[0],
    b = points[points.length - 1]
  target.strokeStyle = color
  target.fillStyle = color
  target.lineWidth = size
  target.lineCap = 'round'
  target.lineJoin = 'round'
  target.beginPath()
  if (type === 'number') {
    const radius = numberRadius(shape)
    target.arc(a.x, a.y, radius, 0, Math.PI * 2)
    target.fill()
    const rgb = color.match(/[a-f\d]{2}/gi).map((part) => parseInt(part, 16))
    target.fillStyle =
      rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 170 ? '#333333' : '#ffffff'
    target.font = `bold ${Math.floor(radius * (shape.number > 99 ? 0.9 : 1.15))}px "Segoe UI", sans-serif`
    target.textAlign = 'center'
    target.textBaseline = 'middle'
    target.fillText(String(shape.number), a.x, a.y, radius * 1.6)
    target.textAlign = 'start'
  }
  if (type === 'pen' || type === 'highlighter') {
    target.globalAlpha = type === 'highlighter' ? 0.3 : 1
    target.lineWidth = type === 'highlighter' ? size * 4 : size
    target.moveTo(a.x, a.y)
    for (const p of points) target.lineTo(p.x, p.y)
    target.stroke()
    target.globalAlpha = 1
  }
  if (type === 'eraser') {
    // 在独立透明层上用 destination-out 擦除标记，不裁剪原图本身；
    // 这样擦除边缘只会减少标记透明度，不会把画布边缘变成半透明水印。
    target.save()
    target.globalCompositeOperation = 'destination-out'
    target.globalAlpha = 1
    target.strokeStyle = '#000'
    target.fillStyle = '#000'
    // 荧光笔线宽为笔触的四倍，半径需略大于半个荧光笔宽度并留出抗锯齿余量。
    const radius = Math.max(4, size * 2 + 2)
    // 以加宽的圆头折线一次擦除，避免逐点圆之间出现扇贝形缺口留下虚线状残影。
    target.lineWidth = radius * 2
    target.lineCap = 'round'
    target.lineJoin = 'round'
    if (points.length > 1) {
      target.beginPath()
      target.moveTo(points[0].x, points[0].y)
      for (let index = 1; index < points.length; index++) {
        target.lineTo(points[index].x, points[index].y)
      }
      target.stroke()
    } else {
      target.beginPath()
      target.arc(a.x, a.y, radius, 0, Math.PI * 2)
      target.fill()
    }
    target.restore()
    return
  }
  if (type === 'rect') target.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
  if (type === 'ellipse') {
    target.ellipse(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      Math.abs(b.x - a.x) / 2,
      Math.abs(b.y - a.y) / 2,
      0,
      0,
      Math.PI * 2
    )
    target.stroke()
  }
  if (type === 'arrow') {
    drawArrow(a, b, size, target)
  }
  if (type === 'text') {
    target.font = `${font}px ${annotationFont}`
    target.textBaseline = 'top'
    target.fillText(text, a.x, a.y)
  }
}

/**
 * 沿用截图的内凹机翼箭头，按用户要求将箭尾收为单一尖点，短箭头保留长度钳制。
 * @param {{x:number,y:number}} a 起点。
 * @param {{x:number,y:number}} b 终点。
 * @param {number} thick 原图像素线宽。
 * @param {CanvasRenderingContext2D} target 目标上下文。
 * @returns {void} 在当前填色下绘制两个相连多边形。
 */
function drawArrow(a, b, thick, target = ctx) {
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
  target.beginPath()
  // 起点只保留一个顶点，消除平切尾端，使箭身从真正的尖点逐渐变宽。
  target.moveTo(a.x, a.y)
  target.lineTo(endX - nx * endHalfWidth, endY - ny * endHalfWidth)
  target.lineTo(endX + nx * endHalfWidth, endY + ny * endHalfWidth)
  target.closePath()
  target.fill()
  target.beginPath()
  target.moveTo(b.x, b.y)
  target.lineTo(baseX + nx * headHalfWidth, baseY + ny * headHalfWidth)
  target.lineTo(notchX, notchY)
  target.lineTo(baseX - nx * headHalfWidth, baseY - ny * headHalfWidth)
  target.closePath()
  target.fill()
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
 * 马赛克与聚光灯共用：框选加矩形，笔触加胶囊。
 * @param {Path2D} mask 所有区域共用的并集路径。
 * @param {object} shape 一次涂抹或框选的标记参数。
 * @returns {void} 扩充路径，不修改底图或已提交标记。
 */
function addRegionMask(mask, shape) {
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
 * @param {CanvasRenderingContext2D} target 目标上下文。
 * @returns {void} 在底图上合成马赛克；无马赛克时立即释放采样图。
 */
function drawMosaics(visible, target = ctx) {
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
  for (const shape of mosaics) addRegionMask(mask, shape)
  target.save()
  target.clip(mask)
  // 最近邻放大保留色块边界，始终从原图采样，重叠不发生二次模糊。
  target.imageSmoothingEnabled = false
  target.drawImage(mosaicSample, 0, 0, canvas.width, canvas.height)
  target.restore()
}

/** 当前会话的透明标记层，仅在存在橡皮擦时使用。 */
let annotationLayer = null

/**
 * 取得与画布同尺寸的透明标记层。
 * @returns {HTMLCanvasElement} 标记层画布。
 */
function ensureAnnotationLayer() {
  if (!annotationLayer) annotationLayer = document.createElement('canvas')
  if (annotationLayer.width !== canvas.width || annotationLayer.height !== canvas.height) {
    annotationLayer.width = canvas.width
    annotationLayer.height = canvas.height
  }
  return annotationLayer
}

/**
 * 释放聚光灯压暗层，避免为无聚光灯的图片长期持有一张整图。
 * @returns {void} 无返回值。
 */
function releaseSpotlightLayer() {
  if (spotlightLayer) spotlightLayer.width = spotlightLayer.height = 0
  spotlightLayer = null
}

/**
 * 绘制聚光区外的变暗遮罩，重叠区域不重复变暗。
 * 框选与笔触共用同一并集路径，笔触重叠时也不会出现孔洞。
 * @param {object[]} visible 当前可见标记。
 * @param {CanvasRenderingContext2D} target 目标上下文。
 * @returns {void} 无返回值。
 */
function drawSpotlights(visible, target = ctx) {
  const spotlights = visible.filter((shape) => shape.type === 'spotlight' && validShape(shape))
  if (!spotlights.length) {
    releaseSpotlightLayer()
    return
  }
  // 先在独立压暗层上用 destination-out 挖出清晰区域，再整体合成，重叠区域只压暗一次。
  if (!spotlightLayer) spotlightLayer = new OffscreenCanvas(canvas.width, canvas.height)
  if (spotlightLayer.width !== canvas.width || spotlightLayer.height !== canvas.height) {
    spotlightLayer.width = canvas.width
    spotlightLayer.height = canvas.height
  }
  const mask = spotlightLayer.getContext('2d')
  mask.setTransform(1, 0, 0, 1, 0, 0)
  mask.globalAlpha = 1
  mask.globalCompositeOperation = 'source-over'
  mask.clearRect(0, 0, spotlightLayer.width, spotlightLayer.height)
  mask.fillStyle = 'rgba(0,0,0,0.56)'
  mask.fillRect(0, 0, spotlightLayer.width, spotlightLayer.height)
  const clear = new Path2D()
  for (const shape of spotlights) addRegionMask(clear, shape)
  // destination-out 按源 alpha 擦除，挖孔必须使用不透明黑色，否则会留下半透明压暗。
  mask.fillStyle = '#000'
  mask.globalCompositeOperation = 'destination-out'
  mask.fill(clear)
  target.drawImage(spotlightLayer, 0, 0)
}

/**
 * 重绘原图和标记，并同步撤销按钮及已提交标记数量，供可见画布状态检查。
 * @returns {void} 无返回值。
 */
function render() {
  if (!image || disposed) return
  const visible = current ? [...shapes, current] : shapes
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0)
  // 马赛克与聚光灯属于底图效果，先落到原图上；橡皮擦只在标记层内擦除，
  // 不能把之后才绘制的压暗遮罩擦出旧路径。
  drawMosaics(visible)
  drawSpotlights(visible)
  if (visible.some((shape) => shape.type === 'eraser')) {
    const layer = ensureAnnotationLayer()
    const layerContext = layer.getContext('2d')
    layerContext.setTransform(1, 0, 0, 1, 0, 0)
    layerContext.globalAlpha = 1
    layerContext.globalCompositeOperation = 'source-over'
    layerContext.clearRect(0, 0, layer.width, layer.height)
    for (const shape of visible) {
      if (!['spotlight', 'mosaic'].includes(shape.type)) draw(shape, layerContext)
    }
    ctx.drawImage(layer, 0, 0)
  } else {
    for (const shape of visible) if (!['spotlight', 'mosaic'].includes(shape.type)) draw(shape)
  }
  syncMosaicSelection()
  // 历史变化后丢弃越界的选中索引，避免手柄指向已撤销的标记。
  if (selectedShape >= shapes.length) selectedShape = -1
  syncAnnotationSelection()
  // 只发布已经提交到画布的标记数；按下画笔或临时拖动不冒充有效标注。
  canvas.dataset.annotationCount = String(shapes.length)
  canvas.dataset.nextNumber = String(nextNumber())
  const numberButton = document.querySelector('[data-tool="number"]')
  numberButton.title = `序号圆圈 (N) · 下一个 ${nextNumber()}`
  $('undo').disabled = !history.length
  $('redo').disabled = !future.length
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
  if (shape.type === 'spotlight' || shape.type === 'mosaic') {
    if (shape.mode === 'brush') return shape.points.length >= 1
    const [a, b = a] = shape.points
    return Math.abs(b.x - a.x) >= 2 && Math.abs(b.y - a.y) >= 2
  }
  if (['rect', 'ellipse', 'arrow'].includes(shape.type)) {
    const [a, b = a] = shape.points
    return Math.hypot(b.x - a.x, b.y - a.y) >= 2
  }
  return true
}

/**
 * 序号圆圈的半径，缩放后沿用保存值，未缩放时按笔触推导。
 * @param {object} shape 序号标记。
 * @returns {number} 原图坐标下的半径。
 */
function numberRadius(shape) {
  return typeof shape.radius === 'number'
    ? Math.max(6, shape.radius)
    : Math.max(12, (shape.size || 4) * 3 + 8)
}

/**
 * 复制单个标记，避免拖动和撤销快照与画布状态共享引用。
 * @param {object} shape 待复制的标记。
 * @returns {object} 点数组已独立的新标记。
 */
function cloneShape(shape) {
  return { ...shape, points: shape.points.map((point) => ({ x: point.x, y: point.y })) }
}

/**
 * 复制当前全部已提交标记。
 * @returns {object[]} 与画布状态互不共享引用的副本。
 */
function cloneShapes() {
  return shapes.map(cloneShape)
}

/**
 * 记录一次可撤销快照并清空重做分支，深度与原生截图保持一致。
 * @param {object[]} snapshot 变更前的标记副本。
 * @returns {void} 无返回值。
 */
function pushSnapshot(snapshot) {
  history.push(snapshot)
  if (history.length > 50) history.shift()
  future = []
}

/**
 * 取得显示像素与原图像素的比例，用于把固定像素容差换算到原图坐标。
 * @returns {number} 每个显示像素对应的原图像素数。
 */
function imagePerPixel() {
  const rect = canvas.getBoundingClientRect()
  return rect.width > 0 ? canvas.width / rect.width : 1
}

/**
 * 点到线段的最短距离。
 * @param {number} px 点的横向坐标。
 * @param {number} py 点的纵向坐标。
 * @param {number} ax 线段起点横坐标。
 * @param {number} ay 线段起点纵坐标。
 * @param {number} bx 线段终点横坐标。
 * @param {number} by 线段终点纵坐标。
 * @returns {number} 原图坐标下的距离。
 */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay,
    length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * 点到折线各段的最短距离，供画笔、荧光笔和涂抹马赛克命中使用。
 * @param {number} px 点的横向坐标。
 * @param {number} py 点的纵向坐标。
 * @param {{x:number,y:number}[]} points 折线顶点。
 * @returns {number} 原图坐标下的最短距离。
 */
function polylineDistance(px, py, points) {
  if (!points.length) return Number.POSITIVE_INFINITY
  if (points.length === 1) return Math.hypot(px - points[0].x, py - points[0].y)
  let best = Number.POSITIVE_INFINITY
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1],
      current = points[index]
    best = Math.min(best, segmentDistance(px, py, previous.x, previous.y, current.x, current.y))
  }
  return best
}

/**
 * 计算单个标记的完整包围盒，选中框和手柄都以此为准。
 * @param {object} shape 待测量的标记。
 * @returns {{left:number,top:number,right:number,bottom:number}} 原图坐标包围盒。
 */
function shapeBounds(shape) {
  const first = shape.points[0],
    last = shape.points[shape.points.length - 1]
  if (shape.type === 'text') {
    ctx.save()
    ctx.font = `${shape.font}px ${annotationFont}`
    const width = Math.max(8, ctx.measureText(shape.text || '').width)
    ctx.restore()
    return {
      left: first.x,
      top: first.y,
      right: first.x + width,
      bottom: first.y + shape.font * 1.25
    }
  }
  if (shape.type === 'number') {
    const radius = numberRadius(shape)
    return {
      left: first.x - radius,
      top: first.y - radius,
      right: first.x + radius,
      bottom: first.y + radius
    }
  }
  if (
    shape.type === 'pen' ||
    shape.type === 'highlighter' ||
    shape.type === 'eraser' ||
    ((shape.type === 'mosaic' || shape.type === 'spotlight') && shape.mode !== 'rect')
  ) {
    let left = Number.POSITIVE_INFINITY,
      top = Number.POSITIVE_INFINITY,
      right = Number.NEGATIVE_INFINITY,
      bottom = Number.NEGATIVE_INFINITY
    for (const point of shape.points) {
      left = Math.min(left, point.x)
      top = Math.min(top, point.y)
      right = Math.max(right, point.x)
      bottom = Math.max(bottom, point.y)
    }
    if (!Number.isFinite(left)) return { left: 0, top: 0, right: 0, bottom: 0 }
    const padding =
      shape.type === 'mosaic' || shape.type === 'spotlight'
        ? shape.radius || 0
        : shape.type === 'highlighter'
          ? shape.size * 2
          : shape.size / 2
    return { left: left - padding, top: top - padding, right: right + padding, bottom: bottom + padding }
  }
  return {
    left: Math.min(first.x, last.x),
    top: Math.min(first.y, last.y),
    right: Math.max(first.x, last.x),
    bottom: Math.max(first.y, last.y)
  }
}

/**
 * 判断标记是否属于可选中、可拖动的非笔触标记。
 * @param {string} type 标记类型。
 * @returns {boolean} 矩形、椭圆、箭头、马赛克、文字、序号和聚光灯可选中。
 */
function selectableType(type) {
  return ['rect', 'ellipse', 'arrow', 'mosaic', 'text', 'number', 'spotlight'].includes(type)
}

/**
 * 判断标记是否有可拖动的缩放/端点手柄，与原生截图保持一致。
 * @param {object} shape 标记。
 * @returns {boolean} 矩形、椭圆、箭头、聚光灯、框选马赛克和序号可缩放。
 */
function resizableShape(shape) {
  if (shape.type === 'arrow') return true
  if (shape.type === 'mosaic' || shape.type === 'spotlight') return shape.mode === 'rect'
  return ['rect', 'ellipse', 'number'].includes(shape.type)
}

/**
 * 命中单个标记：轮廓类只认线条，区域类允许整块命中，避免不可见边框难以点选。
 * @param {object} shape 待检测标记。
 * @param {number} x 原图横坐标。
 * @param {number} y 原图纵坐标。
 * @param {number} tolerance 原图坐标容差。
 * @returns {boolean} 是否命中。
 */
function hitShapeAt(shape, x, y, tolerance) {
  const first = shape.points[0],
    last = shape.points[shape.points.length - 1]
  if (shape.type === 'rect') {
    return (
      Math.min(
        segmentDistance(x, y, first.x, first.y, last.x, first.y),
        segmentDistance(x, y, last.x, last.y, first.x, last.y),
        segmentDistance(x, y, first.x, last.y, first.x, first.y),
        segmentDistance(x, y, last.x, first.y, last.x, last.y)
      ) <= tolerance
    )
  }
  if (shape.type === 'ellipse') {
    const centerX = (first.x + last.x) / 2,
      centerY = (first.y + last.y) / 2
    const axisX = Math.abs(last.x - first.x) / 2,
      axisY = Math.abs(last.y - first.y) / 2
    if (axisX < 0.5 && axisY < 0.5) return Math.hypot(x - centerX, y - centerY) <= tolerance
    if (axisX < 0.5 || axisY < 0.5) {
      return (
        segmentDistance(x, y, first.x, centerY, last.x, centerY) <= tolerance ||
        segmentDistance(x, y, centerX, first.y, centerX, last.y) <= tolerance
      )
    }
    const radial = Math.hypot((x - centerX) / axisX, (y - centerY) / axisY)
    return Math.abs(radial - 1) * Math.min(axisX, axisY) <= tolerance
  }
  if (shape.type === 'arrow') {
    return segmentDistance(x, y, first.x, first.y, last.x, last.y) <= tolerance + shape.size
  }
  if (shape.type === 'spotlight') {
    // 笔触聚光灯按路径半径命中，框选聚光灯允许整块命中。
    if (shape.mode === 'brush')
      return polylineDistance(x, y, shape.points) <= (shape.radius || 0) + tolerance
    return (
      x >= Math.min(first.x, last.x) - tolerance &&
      x <= Math.max(first.x, last.x) + tolerance &&
      y >= Math.min(first.y, last.y) - tolerance &&
      y <= Math.max(first.y, last.y) + tolerance
    )
  }
  if (shape.type === 'mosaic' && shape.mode === 'rect') {
    return (
      x >= Math.min(first.x, last.x) - tolerance &&
      x <= Math.max(first.x, last.x) + tolerance &&
      y >= Math.min(first.y, last.y) - tolerance &&
      y <= Math.max(first.y, last.y) + tolerance
    )
  }
  if (shape.type === 'mosaic') {
    return polylineDistance(x, y, shape.points) <= (shape.radius || 0) + tolerance
  }
  if (shape.type === 'number') {
    return Math.hypot(x - first.x, y - first.y) <= numberRadius(shape) + tolerance / 2
  }
  if (shape.type === 'text') {
    const box = shapeBounds(shape)
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
  }
  return false
}

/**
 * 从顶层向下命中可拖动标记。
 * @param {number} x 原图横坐标。
 * @param {number} y 原图纵坐标。
 * @param {number} tolerance 原图坐标容差。
 * @returns {number} 标记索引，未命中返回 -1。
 */
function hitShape(x, y, tolerance) {
  for (let index = shapes.length - 1; index >= 0; index--) {
    if (selectableType(shapes[index].type) && hitShapeAt(shapes[index], x, y, tolerance))
      return index
  }
  return -1
}

/**
 * 按位移平移标记的全部坐标。
 * @param {object} shape 已被复制的标记。
 * @param {number} dx 横向位移。
 * @param {number} dy 纵向位移。
 * @returns {object} 平移后的标记。
 */
function translateShape(shape, dx, dy) {
  for (const point of shape.points) {
    point.x += dx
    point.y += dy
  }
  return shape
}

/**
 * 把手柄位移换算为包围盒变换；箭头只移动被拖动的端点，序号按外框调整半径。
 * @param {object} shape 已被复制的标记。
 * @param {string} handle 手柄标识（nw/n/ne/e/se/s/sw/w/start/end）。
 * @param {number} dx 横向位移。
 * @param {number} dy 纵向位移。
 * @param {{left:number,top:number,right:number,bottom:number}} box 拖动起始包围盒。
 * @returns {object} 变形后的标记。
 */
function resizeShape(shape, handle, dx, dy, box) {
  if (handle === 'start' || handle === 'end') {
    const index = handle === 'start' ? 0 : shape.points.length - 1
    shape.points[index] = { x: shape.points[index].x + dx, y: shape.points[index].y + dy }
    return shape
  }
  let left = box.left,
    top = box.top,
    right = box.right,
    bottom = box.bottom
  if (handle.includes('w')) left += dx
  if (handle.includes('e')) right += dx
  if (handle.includes('n')) top += dy
  if (handle.includes('s')) bottom += dy
  if (right - left < 2) right = left + 2
  if (bottom - top < 2) bottom = top + 2
  const oldWidth = Math.max(0.5, box.right - box.left),
    oldHeight = Math.max(0.5, box.bottom - box.top)
  const newWidth = right - left,
    newHeight = bottom - top
  const mapX = (value) => left + ((value - box.left) * newWidth) / oldWidth
  const mapY = (value) => top + ((value - box.top) * newHeight) / oldHeight
  if (shape.type === 'number') {
    shape.points[0] = { x: mapX(shape.points[0].x), y: mapY(shape.points[0].y) }
    shape.radius = Math.max(6, Math.max(newWidth, newHeight) / 2)
    return shape
  }
  if (
    (shape.type === 'mosaic' || shape.type === 'spotlight') &&
    shape.mode !== 'rect'
  ) {
    for (const point of shape.points) {
      point.x = mapX(point.x)
      point.y = mapY(point.y)
    }
    return shape
  }
  shape.points = shape.points
    .slice(0, 2)
    .map((point) => ({ x: mapX(point.x), y: mapY(point.y) }))
  return shape
}

/**
 * 把选中框和手柄贴合到当前缩放下的画布位置，缩放或滚动后保持同步。
 * @returns {void} 无选中项时隐藏浮层。
 */
function syncAnnotationSelection() {
  const overlay = $('annotation-selection')
  const shape = selectedShape >= 0 ? shapes[selectedShape] : null
  if (!shape || disposed || !content?.edit || !selectableType(shape.type)) {
    overlay.hidden = true
    return
  }
  const bounds = shapeBounds(shape),
    rect = canvas.getBoundingClientRect()
  const scaleX = rect.width / canvas.width,
    scaleY = rect.height / canvas.height
  const boxWidth = bounds.right - bounds.left,
    boxHeight = bounds.bottom - bounds.top
  overlay.hidden = false
  overlay.style.left = `${rect.left + bounds.left * scaleX}px`
  overlay.style.top = `${rect.top + bounds.top * scaleY}px`
  overlay.style.width = `${Math.max(1, boxWidth * scaleX)}px`
  overlay.style.height = `${Math.max(1, boxHeight * scaleY)}px`
  for (const handle of overlay.querySelectorAll('[data-annotation-handle]')) {
    const kind = handle.dataset.annotationHandle
    const endpoint = kind === 'start' || kind === 'end'
    // 箭头只有两个端点手柄；文字只显示选中框，不支持缩放。
    const visible =
      shape.type === 'arrow'
        ? endpoint
        : !endpoint && shape.type !== 'text' && resizableShape(shape)
    handle.hidden = !visible
    if (!visible || !endpoint) continue
    const point = shape.points[kind === 'start' ? 0 : shape.points.length - 1]
    handle.style.left = `${((point.x - bounds.left) / Math.max(1, boxWidth)) * 100}%`
    handle.style.top = `${((point.y - bounds.top) / Math.max(1, boxHeight)) * 100}%`
  }
}

/**
 * 退出选中态，丢弃进行中的拖动会话。
 * @returns {void} 无返回值。
 */
function clearSelection() {
  selectedShape = -1
  shapeEdit = null
  syncAnnotationSelection()
}

/**
 * 删除当前选中的标记，并写入可撤销历史。
 * @returns {void} 无选中项或索引失效时不修改画布。
 */
function deleteSelectedShape() {
  if (selectedShape < 0 || selectedShape >= shapes.length) return
  pushSnapshot(cloneShapes())
  shapes.splice(selectedShape, 1)
  clearSelection()
  render()
}

/**
 * 把拖动/缩放的首次位移写入撤销历史，之后每帧都从按下时快照重算。
 * @param {PointerEvent} event 当前指针事件。
 * @returns {void} 无返回值。
 */
function moveShapeEdit(event) {
  if (!shapeEdit || shapeEdit.pointerId !== event.pointerId) return
  const next = point(event)
  const dx = next.x - shapeEdit.start.x,
    dy = next.y - shapeEdit.start.y
  if (!shapeEdit.moved) {
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
    shapeEdit.moved = true
    pushSnapshot(shapeEdit.before)
  }
  const snapshot = shapeEdit.before[shapeEdit.index]
  shapes[shapeEdit.index] =
    shapeEdit.mode === 'move'
      ? translateShape(cloneShape(snapshot), dx, dy)
      : resizeShape(cloneShape(snapshot), shapeEdit.handle, dx, dy, shapeEdit.box)
  render()
}

/**
 * 结束拖动或缩放并保持选中态，便于继续微调。
 * @param {PointerEvent|Event} event 指针结束、取消或窗口失焦事件。
 * @returns {void} 无返回值。
 */
function endShapeEdit(event) {
  if (!shapeEdit) return
  if (event.type !== 'blur' && shapeEdit.pointerId !== event.pointerId) return
  shapeEdit = null
  render()
}

$('annotation-selection').innerHTML = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'start', 'end']
  .map((kind) => `<i data-annotation-handle="${kind}" hidden></i>`)
  .join('')
$('annotation-selection').addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('[data-annotation-handle]')
  if (!handle || event.button !== 0 || !content?.edit || selectedShape < 0) return
  event.preventDefault()
  const snapshot = cloneShapes()
  shapeEdit = {
    mode: 'resize',
    index: selectedShape,
    handle: handle.dataset.annotationHandle,
    start: point(event),
    before: snapshot,
    box: shapeBounds(snapshot[selectedShape]),
    moved: false,
    pointerId: event.pointerId
  }
  handle.setPointerCapture(event.pointerId)
})
document.addEventListener('pointermove', moveShapeEdit)
document.addEventListener('pointerup', endShapeEdit)
document.addEventListener('pointercancel', endShapeEdit)

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
  syncAnnotationSelection()
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
    pushSnapshot(cloneShapes())
    shapes.push(current)
    // 新放置的非笔触标记直接进入选中态，可立即拖动或缩放，无需再次切换工具。
    selectedShape = selectableType(current.type) ? shapes.length - 1 : -1
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
 * 同步马赛克笔/聚光灯笔的实际覆盖圆，离开图片或切换模式时撤下，不进入导出画布。
 * @param {PointerEvent|null} event 当前指针；省略时复用上次位置并重算缩放。
 * @returns {void} 更新独立DOM光标的显示和尺寸。
 */
function updateMosaicCursor(event = null) {
  if (event) mosaicPointer = { x: event.clientX, y: event.clientY }
  const cursor = $('mosaic-cursor'),
    rect = canvas.getBoundingClientRect()
  const brushMode =
    (tool === 'mosaic' && mosaicMode === 'brush') ||
    (tool === 'spotlight' && spotlightMode === 'brush')
  const radius = tool === 'spotlight' ? spotlightRadius : mosaicRadius
  const visible =
    content?.edit &&
    brushMode &&
    mosaicPointer &&
    mosaicPointer.x >= rect.left &&
    mosaicPointer.x < rect.right &&
    mosaicPointer.y >= rect.top &&
    mosaicPointer.y < rect.bottom
  cursor.hidden = !visible
  if (!visible) return
  cursor.style.left = `${mosaicPointer.x}px`
  cursor.style.top = `${mosaicPointer.y}px`
  cursor.style.width = `${(radius * 2 * rect.width) / canvas.width}px`
  cursor.style.height = `${(radius * 2 * rect.height) / canvas.height}px`
}

/**
 * 在框选期间显示边界参考线，导出和历史只保存区域蒙版。
 * @returns {void} 无有效框选时立即撤下边界。
 */
function syncMosaicSelection() {
  const selection = $('mosaic-selection')
  const visible =
    current &&
    (current.type === 'mosaic' || current.type === 'spotlight') &&
    current.mode === 'rect' &&
    validShape(current)
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
  // 聚光灯与马赛克共用笔触外观：框选时不显示无效的笔刷大小，笔触时隐藏十字光标。
  $('spotlight-controls').hidden = tool !== 'spotlight'
  $('spotlight-brush-sizes').hidden = spotlightMode !== 'brush'
  document.querySelectorAll('[data-spotlight-mode]').forEach((button) => {
    const active = button.dataset.spotlightMode === spotlightMode
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  })
  document.querySelectorAll('[data-spotlight-radius]').forEach((button) => {
    const active = Number(button.dataset.spotlightRadius) === spotlightRadius
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  })
  const brushMode =
    (tool === 'mosaic' && mosaicMode === 'brush') ||
    (tool === 'spotlight' && spotlightMode === 'brush')
  canvas.style.cursor = brushMode ? 'none' : tool === 'text' ? 'text' : 'crosshair'
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
    // 切换工具时退出选中态，避免旧标记的手柄留在画布上拦截新标记的拖动。
    clearSelection()
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
  finishText(true)
  const start = point(event)
  // 已有非笔触标记优先进入拖动/缩放；文字工具点中已有文本框时同样先选中，
  // 避免同一次点击既想移动文本框又弹出新的文字输入。
  const hit = hitShape(start.x, start.y, 6 * imagePerPixel())
  if (hit >= 0) {
    selectedShape = hit
    shapeEdit = {
      mode: 'move',
      index: hit,
      start,
      before: cloneShapes(),
      moved: false,
      pointerId: event.pointerId
    }
    canvas.setPointerCapture(event.pointerId)
    syncAnnotationSelection()
    render()
    return
  }
  clearSelection()
  if (tool === 'text') {
    // 空白处仍按文字工具落点新建输入框。
    textPosition = start
    $('text-entry').hidden = false
    syncTextEntry()
    $('text-entry').focus()
    return
  }
  if (shapes.length >= 200) {
    $('status').textContent = '已达 200 个标记，请复制或保存后继续编辑'
    return
  }
  canvas.setPointerCapture(event.pointerId)
  current = {
    type: tool,
    points: [start],
    color: $('color').value,
    size: Number($('size').value),
    font: Number($('font-size').value),
    number: tool === 'number' ? nextNumber() : undefined,
    mode:
      tool === 'mosaic' ? mosaicMode : tool === 'spotlight' ? spotlightMode : undefined,
    radius:
      tool === 'mosaic' ? mosaicRadius : tool === 'spotlight' ? spotlightRadius : undefined
  }
  render()
})
canvas.addEventListener('pointermove', (event) => {
  updateMosaicCursor(event)
  if (shapeEdit) return
  if (!current || current.type === 'number') return
  const next = point(event)
  if (
    ['pen', 'highlighter', 'eraser'].includes(current.type) ||
    ((current.type === 'mosaic' || current.type === 'spotlight') && current.mode === 'brush')
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
document.querySelectorAll('[data-spotlight-mode]').forEach((button) => {
  button.onclick = () => {
    spotlightMode = button.dataset.spotlightMode
    syncMosaicControls()
  }
})
document.querySelectorAll('[data-spotlight-radius]').forEach((button) => {
  button.onclick = () => {
    spotlightRadius = Number(button.dataset.spotlightRadius)
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
  if (!history.length) return
  future.push(cloneShapes())
  shapes = history.pop()
  clearSelection()
  render()
}
$('redo').onclick = () => {
  if (!future.length) return
  history.push(cloneShapes())
  shapes = future.pop()
  clearSelection()
  render()
}
// 保留编辑区焦点，原生撤销历史才能精确作用于当前便签。
for (const action of ['undo', 'redo']) {
  $(`note-${action}`).onmousedown = (event) => event.preventDefault()
  $(`note-${action}`).onclick = () => invoke(`note-${action}`)
}
$('clear').onclick = () => {
  finishText(false)
  if (shapes.length) pushSnapshot(cloneShapes())
  shapes = []
  clearSelection()
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
  endShapeEdit({ type: 'blur' })
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
  syncAnnotationSelection()
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
  // 输入文字时保留原生编辑快捷键；输入框已提交并隐藏后，快捷键仍作用于画布。
  const editingText = !$('text-entry').hidden
  if (content?.type !== 'image' || editingText) return
  const key = event.key.toLowerCase()
  // 单纯悬浮图片只保留复制/保存，不接受任何标注工具或历史快捷键。
  if (!content.edit && !((event.ctrlKey || event.metaKey) && ['c', 's'].includes(key))) return
  // 选中标记后按 Delete/Backspace 删除；拖动进行中不打断当前手势。
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedShape >= 0 && !shapeEdit) {
    event.preventDefault()
    deleteSelectedShape()
    return
  }
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
  releaseSpotlightLayer()
  if (annotationLayer) {
    annotationLayer.width = 0
    annotationLayer.height = 0
    annotationLayer = null
  }
  mosaicPointer = null
  $('mosaic-cursor').hidden = true
  $('mosaic-selection').hidden = true
  unsubscribeAppend()
  unsubscribeDock()
  unsubscribePointer()
  unsubscribeDockPreference()
  shapes = []
  history = []
  future = []
  selectedShape = -1
  shapeEdit = null
  $('annotation-selection').hidden = true
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
