const htmlNamespace = 'http://www.w3.org/1999/xhtml'
const htmlTags = new Set(
  'article section div span h1 h2 h3 h4 h5 h6 p strong b em i small sub sup pre code ul ol li dl dt dd blockquote table caption thead tbody tfoot tr th td br hr'.split(
    ' '
  )
)

/**
 * 重建静态 HTML 块，保留排版和表格，隔离模型生成的标记。
 * @param {string} input 模型提供的 HTML 片段。
 * @returns {HTMLElement|null} 有内容的静态块。
 */
export function buildReplyHtml(input) {
  const template = document.createElement('template')
  template.innerHTML = input
  const panel = document.createElement('div')
  panel.className = 'reply-html'
  appendHtmlNodes(template.content, panel, 0, { remaining: 450 })
  return panel.textContent.trim() || panel.querySelector('hr') ? panel : null
}

/**
 * 从惰性模板复制允许的文本和结构，限定节点数和嵌套深度。
 * @param {Node} source 惰性来源节点。
 * @param {Node} target 当前输出容器。
 * @param {number} depth 当前深度。
 * @param {{remaining:number}} budget 剩余节点数。
 * @returns {void} 无返回值。
 */
function appendHtmlNodes(source, target, depth, budget) {
  if (depth > 16) return
  for (const node of source.childNodes) {
    if (budget.remaining-- <= 0) break
    if (node.nodeType === Node.TEXT_NODE) {
      target.append(document.createTextNode(node.textContent))
      continue
    }
    if (node.namespaceURI !== htmlNamespace || !htmlTags.has(node.localName)) continue
    const element = document.createElement(node.localName)
    if (node.matches('th, td')) {
      for (const attr of ['colspan', 'rowspan']) {
        const value = node.getAttribute(attr)
        if (/^[1-9]\d?$/.test(value || '')) element.setAttribute(attr, value)
      }
    }
    appendHtmlNodes(node, element, depth + 1, budget)
    target.append(element)
  }
}

const svgNamespace = 'http://www.w3.org/2000/svg'
const diagramTags = new Set(
  'g defs marker path line polyline polygon rect circle ellipse text tspan title desc'.split(' ')
)
let diagramSequence = 0
const geometry = new Set(
  'x y x1 y1 x2 y2 cx cy r rx ry width height dx dy refX refY markerWidth markerHeight stroke-width opacity fill-opacity stroke-opacity font-size'.split(
    ' '
  )
)
const diagramAttrs = {
  viewBox: /^[\d+\-.,\sEe]+$/,
  orient: /^(?:auto|auto-start-reverse|[+-]?\d+(?:\.\d+)?)$/,
  markerUnits: /^(?:strokeWidth|userSpaceOnUse)$/,
  'text-anchor': /^(?:start|middle|end)$/,
  'dominant-baseline': /^(?:auto|middle|central|hanging|alphabetic)$/,
  'font-weight': /^(?:normal|bold|[1-9]00)$/,
  'stroke-linejoin': /^(?:miter|round|bevel)$/,
  'stroke-linecap': /^(?:butt|round|square)$/,
  'fill-rule': /^(?:nonzero|evenodd)$/,
  transform: /^(?:(?:matrix|translate|rotate|scale|skewX|skewY)\([\d+\-.,\sEe]+\)\s*)+$/
}

/**
 * 重建模型绘制的 SVG。只允许形状、标注和本地图形属性。
 * @param {string} input 模型返回的完整 SVG。
 * @returns {SVGSVGElement|null} 受限图形，或无有效内容时返回 null。
 */
export function buildReplyDiagram(input) {
  const template = document.createElement('template')
  template.innerHTML = input
  const source = template.content.firstElementChild
  if (source?.namespaceURI !== svgNamespace || source.localName !== 'svg') return null
  const view = (source.getAttribute('viewBox') || '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (
    view.length !== 4 ||
    !view.every((n) => Number.isFinite(n) && Math.abs(n) <= 100000) ||
    view[2] <= 0 ||
    view[3] <= 0 ||
    view[3] / view[2] > 8
  )
    return null
  const svg = document.createElementNS(svgNamespace, 'svg')
  svg.setAttribute('viewBox', view.join(' '))
  svg.setAttribute('role', 'img')
  svg.setAttribute(
    'aria-label',
    source.querySelector(':scope > title')?.textContent?.trim().slice(0, 100) || 'SVG 图示'
  )
  svg.setAttribute('font-family', 'sans-serif')
  svg.setAttribute('fill', 'currentColor')
  // 标记仅引用本图中的 marker，多个图复用同一个 ID 时互不影响。
  const markers = new Map()
  const prefix = 'reply-svg-' + ++diagramSequence + '-'
  for (const marker of source.querySelectorAll('defs > marker[id]')) {
    if (/^[\w-]{1,50}$/.test(marker.id) && markers.size < 24)
      markers.set(marker.id, prefix + marker.id)
  }
  copyDiagramAttributes(source, svg, markers)
  appendDiagramNodes(source, svg, 0, { remaining: 450 }, markers)
  const drawable = [
    ...svg.querySelectorAll('path,line,polyline,polygon,rect,circle,ellipse,text')
  ].some((node) => !node.closest('defs') && (node.localName !== 'text' || node.textContent.trim()))
  return drawable ? svg : null
}

/**
 * 按白名单创建 SVG 形状，拒绝脚本、动画、外链及嵌入 HTML。
 * @param {Node} source SVG 来源节点。
 * @param {Node} target 重建的 SVG 目标容器。
 * @param {number} depth 当前嵌套深度。
 * @param {object} budget 图形共享的剩余节点上限。
 * @param {Map<string,string>} markers 本图的本地箭头标识。
 * @returns {void} 无返回值。
 */
function appendDiagramNodes(source, target, depth, budget, markers) {
  if (depth > 16) return
  for (const node of source.childNodes) {
    if (budget.remaining-- <= 0) break
    if (node.nodeType === Node.TEXT_NODE) {
      if (['text', 'tspan', 'title', 'desc'].includes(target.localName))
        target.append(document.createTextNode(node.textContent))
      continue
    }
    if (node.namespaceURI !== svgNamespace || !diagramTags.has(node.localName)) continue
    const shape = document.createElementNS(svgNamespace, node.localName)
    copyDiagramAttributes(node, shape, markers)
    appendDiagramNodes(node, shape, depth + 1, budget, markers)
    target.append(shape)
  }
}

/**
 * 写入图形字面属性及经过重命名的本地箭头引用。
 * @param {Element} node SVG 来源节点。
 * @param {Element} shape 安全 SVG 目标节点。
 * @param {Map<string,string>} markers 本图的本地箭头标识。
 * @returns {void} 无返回值。
 */
function copyDiagramAttributes(node, shape, markers) {
  for (const { name, value } of node.attributes) {
    if (value.length > (name === 'd' || name === 'points' ? 8000 : 200)) continue
    const marker = /^url\(#([\w-]{1,50})\)$/.exec(value)?.[1]
    if (name === 'id' && node.localName === 'marker' && markers.has(value)) {
      shape.setAttribute('id', markers.get(value))
    } else if (
      ['marker-start', 'marker-mid', 'marker-end'].includes(name) &&
      markers.has(marker) &&
      !node.closest('defs')
    ) {
      shape.setAttribute(name, 'url(#' + markers.get(marker) + ')')
    } else if (
      node.localName === 'svg' &&
      !['fill', 'stroke', 'stroke-width', 'font-size'].includes(name)
    ) {
      continue
    } else if (
      (geometry.has(name) &&
        value.trim() &&
        Number.isFinite(Number(value)) &&
        Math.abs(Number(value)) <= 100000) ||
      (['fill', 'stroke'].includes(name) && /^(?:#[0-9a-f]{3,8}|[a-z]{1,24})$/i.test(value)) ||
      (name === 'd' && /^[MmZzLlHhVvCcSsQqTtAa0-9+.,\sEe-]+$/.test(value)) ||
      (['points', 'stroke-dasharray'].includes(name) && /^[\d+\-.,\sEe]+$/.test(value)) ||
      (Object.hasOwn(diagramAttrs, name) && diagramAttrs[name].test(value))
    ) {
      shape.setAttribute(name, value)
    }
  }
}
