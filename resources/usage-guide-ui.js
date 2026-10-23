/**
 * 获取本地引导页面中的固定元素。
 * @param {string} id 元素标识。
 * @returns {HTMLElement} 目标元素。
 */
const $ = (id) => document.getElementById(id)
let phase = 'welcome'
let pending = false
let mounted = false
let opening = false
let previousLayout = ''

/**
 * 根据宿主真实状态渲染覆盖层，界面不能自行声称完成。
 * @param {object} state 当前课程、窗口几何与检测结果。
 * @returns {void} 无返回值。
 */
function render(state) {
  document.body.dataset.windowBounds = JSON.stringify(state.windowBounds)
  document.body.dataset.displayBounds = JSON.stringify(state.displayBounds)
  document.body.dataset.step = state.step?.id || ''
  document.body.dataset.phase = state.phase
  document.body.dataset.targetId = String(state.targetId || '')
  document.body.dataset.targetContentBounds = JSON.stringify(state.targetContentBounds || null)
  document.body.dataset.targetWindowBounds = JSON.stringify(state.targetWindowBounds || null)
  document.body.dataset.targetWindowHandle = String(state.targetWindowHandle || '')
  document.body.dataset.overlayWindowHandle = String(state.overlayWindowHandle || '')
  document.body.dataset.spotlightWindowHandle = String(state.spotlightWindowHandle || '')
  document.body.dataset.targetProcessId = String(state.targetProcessId || '')
  document.body.dataset.targetWindowTitle = state.targetWindowTitle || ''
  document.body.dataset.nativeDialog = String(Boolean(state.nativeDialog))
  document.body.dataset.spotlightTargetId = String(state.spotlightTargetId || '')
  document.body.dataset.spotlightContentBounds = JSON.stringify(
    state.spotlightContentBounds || null
  )
  document.body.dataset.anchorFound = String(Boolean(state.anchorFound))
  document.body.dataset.opening = String(Boolean(state.opening))
  opening = Boolean(state.opening)
  phase = state.phase
  $('welcome').hidden = phase !== 'welcome'
  $('finished').hidden = phase !== 'finished'
  $('coach').hidden = !['active', 'success'].includes(phase)
  document.querySelectorAll('.workspace').forEach((element) => {
    element.textContent = state.workspace
  })
  const hole = state.spotlight,
    shades = $('scrim').children
  const rectangles = hole
    ? [
        { x: 0, y: 0, width: innerWidth, height: Math.max(0, hole.y) },
        { x: 0, y: hole.y, width: Math.max(0, hole.x), height: hole.height },
        {
          x: hole.x + hole.width,
          y: hole.y,
          width: Math.max(0, innerWidth - hole.x - hole.width),
          height: hole.height
        },
        {
          x: 0,
          y: hole.y + hole.height,
          width: innerWidth,
          height: Math.max(0, innerHeight - hole.y - hole.height)
        }
      ]
    : [{ x: 0, y: 0, width: innerWidth, height: innerHeight }]
  ;[...shades].forEach((element, index) => {
    const rect = rectangles[index]
    element.hidden = !rect
    if (rect) setRectangle(element, rect)
  })
  $('spotlight').hidden = !hole
  if (hole) setRectangle($('spotlight'), hole)
  for (const [key, property] of [
    ['x', 'left'],
    ['y', 'top'],
    ['width', 'width']
  ])
    $('coach').style[property] = `${state.card[key]}px`
  $('coach').style.maxHeight = `${innerHeight - 32}px`
  if (state.step) {
    $('progress').textContent =
      `第 ${state.index + 1} / ${state.total} 步 · 已完成 ${state.completed}`
    $('progress-fill').style.width = `${((state.index + 1) / state.total) * 100}%`
    $('title').textContent = state.step.title
    $('location').textContent = state.step.location
    $('instruction').textContent = state.step.instruction
    $('expected').textContent = state.step.expected
    $('chapter').textContent = state.step.chapter || '桌面操作入门'
    $('practice').hidden = !state.step.sample
    // 轮询只更新变化内容，不能重置用户正在选择的练习文字。
    if (state.step.sample && $('practice-text').value !== state.step.sample)
      $('practice-text').value = state.step.sample
    $('settings').hidden = !['ocr-result', 'formula-result', 'ocr', 'formula'].includes(
      state.step.check
    )
    $('retry').hidden = state.step.launch === 'panel' || (!state.step.tool && !state.step.route)
    $('retry').textContent = state.step.native
      ? state.step.id === 'color'
        ? '打开取色'
        : '打开截图'
      : state.step.route
        ? '重新定位设置项'
        : '恢复本步工具'
  }
  $('status').textContent =
    phase === 'success'
      ? '✓ 本项已完成，接着体验下一项…'
      : opening
        ? '正在准备操作窗口…'
        : '完成上方操作后会自动继续'
  $('error').hidden = !state.error
  $('error').textContent = state.error
  $('summary').textContent = `实际完成 ${state.completed} 步，主动跳过 ${state.skipped} 步。`
  updateButtons()
  reportLayout()
  if (!mounted && getComputedStyle($('welcome')).position === 'fixed') {
    mounted = true
    // 首帧包含实际内容和按钮后，宿主才允许显示拦截鼠标的覆盖窗口。
    requestAnimationFrame(() => {
      void window.guide.action('mounted')
    })
  }
}

/**
 * 将真实提示卡尺寸交回宿主，用于精确透传鼠标及避让教学控件。
 * @returns {void} 无返回值；布局没有变化时不发送重复消息。
 */
function reportLayout() {
  if ($('coach').hidden) return
  const rect = $('coach').getBoundingClientRect()
  const size = { width: Math.ceil(rect.width), height: Math.ceil(rect.height) }
  const signature = JSON.stringify(size)
  if (signature === previousLayout) return
  previousLayout = signature
  void window.guide.action({ type: 'layout', ...size }).catch(() => {})
}

/**
 * 用宿主提供的有限数值定位提示卡与镂空区域。
 * @param {HTMLElement} element 目标元素。
 * @param {object} rect 屏幕内矩形。
 * @returns {void} 无返回值。
 */
function setRectangle(element, rect) {
  for (const [key, property] of [
    ['x', 'left'],
    ['y', 'top'],
    ['width', 'width'],
    ['height', 'height']
  ])
    element.style[property] = `${rect[key]}px`
}

/**
 * 防止并发跳步，实际工具打开期间仍可看到等待状态。
 * @returns {void} 无返回值。
 */
function updateButtons() {
  document.querySelectorAll('button[data-action]').forEach((button) => {
    // 退出始终可用，工具加载超时或操作仍在进行时也能立即结束引导。
    button.disabled =
      button.dataset.action !== 'finish' && (pending || opening || phase === 'success')
  })
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]')
  if (!button || button.disabled || (pending && button.dataset.action !== 'finish')) return
  pending = true
  updateButtons()
  try {
    await window.guide.action(button.dataset.action)
  } catch (error) {
    $('error').hidden = false
    $('error').textContent = error.message
  } finally {
    pending = false
    updateButtons()
  }
})
const unsubscribe = window.guide.onState(render)
const resizeObserver = new ResizeObserver(reportLayout)
resizeObserver.observe($('coach'))
window.addEventListener('beforeunload', () => resizeObserver.disconnect(), { once: true })
window.addEventListener('beforeunload', unsubscribe, { once: true })
