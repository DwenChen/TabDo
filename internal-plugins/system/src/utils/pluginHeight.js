/**
 * 按正文实际内容高度调整宿主插件区域，避免固定窗口在内容较少时留下大量空白。
 * @param {HTMLElement|null|undefined} element 需要测量的正文容器，缺省使用 .utility-page。
 * @param {{minHeight?: number, maxHeight?: number}} [options] 高度上下限，默认 0 到 620 像素。
 * @returns {number} 实际提交给宿主的高度；容器不可用时返回 0。
 */
export function syncPluginHeightToContent(element, options = {}) {
  const minHeight = Number.isFinite(options.minHeight) ? options.minHeight : 0
  const maxHeight = Number.isFinite(options.maxHeight) ? options.maxHeight : 620
  const target = element || document.querySelector('.utility-page')
  if (!target) return 0
  // 容器自身使用视口高度时先临时置为 auto，只测量内容高度。
  const previousHeight = target.style.height
  const previousOverflow = target.style.overflow
  target.style.height = 'auto'
  target.style.overflow = 'hidden'
  let contentHeight = 0
  try {
    contentHeight = Math.ceil(target.getBoundingClientRect().height)
  } finally {
    target.style.height = previousHeight
    target.style.overflow = previousOverflow
  }
  const height = Math.max(minHeight, Math.min(maxHeight, contentHeight))
  void window.tabdo?.setExpendHeight?.(height)
  return height
}
