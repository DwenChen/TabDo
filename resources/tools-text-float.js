const list = document.getElementById('entries')
const rows = []
const manualOrder = []
const sort = document.getElementById('sort')
const selected = new Set()
let anchor = null
let pinnedTop = true
let reordering = null
let previewId = null
let changing = false
let hasManualOrder = false
let statusTimer = null
const reorderType = 'application/x-tabdo-relay-order'

/**
 * 读取当前顺序，手动排序独立于条目的原始追加顺序。
 * @returns {object[]} 当前可见顺序的条目。
 */
function ordered() {
  if (sort.value === 'manual')
    return manualOrder.map((id) => rows.find((row) => row.id === id)).filter(Boolean)
  return sort.value === 'newest' ? [...rows].reverse() : [...rows]
}
/**
 * 显示限时反馈，连续触发时从最后一次操作重新计时。
 * @param {string} message 操作结果。
 * @param {boolean} error 是否为禁止或错误。
 * @returns {void} 无返回值。
 */
function status(message, error = false) {
  clearTimeout(statusTimer)
  const element = document.getElementById('status')
  element.textContent = message
  element.classList.toggle('error', error)
  // 提示到期清除，保留底部高度以免列表随消息消失跳动。
  statusTimer = setTimeout(
    () => {
      element.textContent = ''
      element.classList.remove('error')
      statusTimer = null
    },
    error ? 4000 : 3000
  )
}
/**
 * 执行所属窗口的有限IPC，捕获失败供界面保留原内容。
 * @param {string} action 用户操作。
 * @param {unknown} value 条目标识或开关。
 * @returns {Promise<unknown>} 成功结果，失败为undefined。
 */
async function invoke(action, value) {
  try {
    return await window.textFloat.invoke(action, value)
  } catch (error) {
    status(
      String(error.message || error).replace(
        /^Error invoking remote method '[^']+': (?:Error: )?/,
        ''
      ),
      true
    )
  }
}
/**
 * 同步复选框、多选状态与操作按钮，不重建正文或破坏文字选区。
 * @returns {void} 无返回值。
 */
function updateState() {
  for (const row of rows) {
    row.element.setAttribute('aria-selected', String(selected.has(row.id)))
    row.element.querySelector('input').checked = selected.has(row.id)
  }
  const order = ordered()
  document.getElementById('copy').disabled = changing || !selected.size
  document.getElementById('clear').disabled = changing || !rows.length
  document.getElementById('up').disabled =
    changing ||
    !order.some((row, i) => selected.has(row.id) && i > 0 && !selected.has(order[i - 1].id))
  document.getElementById('down').disabled =
    changing ||
    !order.some(
      (row, i) => selected.has(row.id) && i < order.length - 1 && !selected.has(order[i + 1].id)
    )
  document.getElementById('count').textContent = `已选 ${selected.size} / ${rows.length}`
  document.getElementById('empty').hidden = !!rows.length
  for (const button of list.querySelectorAll('.delete-entry')) button.disabled = changing
}
/**
 * 支持复选框、Ctrl切换和Shift范围选择，普通点击只选中当前条目。
 * @param {string} id 目标条目标识。
 * @param {MouseEvent|KeyboardEvent|null} event 当前输入事件。
 * @param {boolean} toggle 是否来自复选框的切换操作。
 * @returns {void} 无返回值。
 */
function select(id, event = null, toggle = false) {
  // 勾选或修饰键选择代表条目操作，清除旧正文选区以便Ctrl+C复制当前选择集。
  if (toggle || event?.ctrlKey || event?.metaKey || event?.shiftKey)
    window.getSelection()?.removeAllRanges()
  const order = ordered().map((row) => row.id)
  if (event?.shiftKey && anchor && order.includes(anchor)) {
    if (!event.ctrlKey && !event.metaKey) selected.clear()
    const from = order.indexOf(anchor),
      to = order.indexOf(id)
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) selected.add(order[i])
  } else if (toggle || event?.ctrlKey || event?.metaKey) {
    if (selected.has(id)) selected.delete(id)
    else selected.add(id)
    anchor = id
  } else {
    selected.clear()
    selected.add(id)
    anchor = id
  }
  updateState()
}
/**
 * 按当前显示顺序读取选中条目，混合类型仍保留选择供用户调整。
 * @returns {object[]} 当前选中条目。
 */
function chosen() {
  return ordered().filter((row) => selected.has(row.id))
}
/**
 * 按当前顺序移动已存在的DOM，保留条目身份和资源引用。
 * @returns {void} 无返回值。
 */
function renderOrder() {
  for (const row of ordered()) list.appendChild(row.element)
  updateState()
}
/**
 * 把一组条目插入目标之前或之后，并保持组内相对顺序。
 * @param {string[]} ids 移动条目标识。
 * @param {string} targetId 目标条目。
 * @param {boolean} after 是否放到目标之后。
 * @returns {void} 无返回值；无效或相同目标不改变顺序。
 */
function move(ids, targetId, after = false) {
  if (ids.includes(targetId) || !rows.some((row) => row.id === targetId)) return
  const moving = ordered()
    .filter((row) => ids.includes(row.id))
    .map((row) => row.id)
  if (!moving.length) return
  // 首次手动移动继承眼前的顺序，不能先按另一种时间顺序重排。
  if (sort.value !== 'manual')
    manualOrder.splice(0, manualOrder.length, ...ordered().map((row) => row.id))
  for (const id of moving) manualOrder.splice(manualOrder.indexOf(id), 1)
  manualOrder.splice(manualOrder.indexOf(targetId) + (after ? 1 : 0), 0, ...moving)
  sort.value = 'manual'
  hasManualOrder = true
  renderOrder()
  status('已调整顺序；后续复制追加到末尾')
}
/**
 * 使用按钮或键盘移动当前选择集，保留相对顺序和边界条目。
 * @param {number} direction -1上移，1下移。
 * @returns {void} 无返回值。
 */
function moveSelected(direction) {
  const ids = ordered().map((row) => row.id)
  const indices = [...ids.keys()]
  if (direction > 0) indices.reverse()
  for (const i of indices) {
    const target = i + direction
    if (selected.has(ids[i]) && target >= 0 && target < ids.length && !selected.has(ids[target])) {
      ;[ids[i], ids[target]] = [ids[target], ids[i]]
    }
  }
  manualOrder.splice(0, manualOrder.length, ...ids)
  sort.value = 'manual'
  hasManualOrder = true
  renderOrder()
  status('已调整顺序；后续复制追加到末尾')
}
/**
 * 删除确认由宿主返回的条目，清空期间新追加的内容不会误删。
 * @param {string[]} ids 本次实际删除的标识。
 * @returns {void} 无返回值。
 */
function removeRows(ids) {
  const removed = new Set(ids)
  for (let i = rows.length - 1; i >= 0; i--) {
    if (!removed.has(rows[i].id)) continue
    rows[i].element.remove()
    rows.splice(i, 1)
  }
  for (let i = manualOrder.length - 1; i >= 0; i--)
    if (removed.has(manualOrder[i])) manualOrder.splice(i, 1)
  for (const id of removed) selected.delete(id)
  if (removed.has(anchor)) anchor = null
  updateState()
}
/**
 * 请求删除条目或清空中转，不改写剪贴板历史或原文件。
 * @param {string|string[]|null} id 条目标识或标识集合，null表示清空。
 * @returns {Promise<void>} 宿主确认后移除界面引用，失败保留内容。
 */
async function discard(id = null) {
  if (changing) return
  changing = true
  if (!id || (Array.isArray(id) ? id.includes(previewId) : previewId === id))
    document.getElementById('preview').close()
  updateState()
  const result = await invoke(id ? 'remove' : 'clear', id)
  if (Array.isArray(result)) {
    removeRows(result)
    status(id ? '已删除条目' : '已清空中转，剪贴板历史保留')
  }
  changing = false
  updateState()
}
/**
 * 从手柄或Alt正文拖动开始内部排序，保留当前已选条目组。
 * @param {string} id 起始条目标识。
 * @param {DragEvent} event 当前拖动事件。
 * @returns {void} 登记内部排序载荷，不触发外部复制。
 */
function beginReorder(id, event) {
  if (!selected.has(id)) select(id)
  reordering = chosen().map((row) => row.id)
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData(reorderType, JSON.stringify(reordering))
  event.dataTransfer.setDragImage(rows.find((row) => row.id === id).element, 20, 20)
}
/**
 * 追加带整列勾选区域的条目，正文拖出、右侧手柄排序。
 * @param {object[]} entries 宿主校验后的新条目。
 * @returns {void} 无返回值。
 */
function append(entries) {
  for (const entry of entries) {
    const element = document.createElement('div')
    element.className = 'entry'
    element.dataset.id = entry.id
    element.setAttribute('role', 'option')
    element.tabIndex = 0
    element.title = '拖动正文可粘贴；拖动右侧手柄可排序'
    // 条目容器不作为拖动源，勾选整列与删除按钮不启动外部拖放。
    const selection = document.createElement('label')
    selection.className = 'selection-area'
    selection.title = '勾选条目'
    selection.onclick = (event) => event.stopPropagation()
    selection.ondblclick = (event) => event.stopPropagation()
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.setAttribute('aria-label', `选择第 ${rows.length + 1} 条`)
    checkbox.onclick = (event) => {
      event.stopPropagation()
      select(entry.id, event, true)
    }
    selection.appendChild(checkbox)
    const body = document.createElement('div')
    body.className = 'entry-content'
    body.draggable = true
    element.append(selection, body)
    if (entry.preview) {
      const button = document.createElement('button')
      button.className = 'thumbnail'
      button.draggable = true
      button.setAttribute('aria-label', '放大图片')
      const image = document.createElement('img')
      image.src = entry.preview
      image.alt = '图片缩略图'
      image.draggable = false
      button.appendChild(image)
      button.onclick = (event) => {
        event.stopPropagation()
        previewId = entry.id
        document.getElementById('preview-image').src = entry.image
        document.getElementById('preview').showModal()
      }
      body.appendChild(button)
    }
    if (entry.type !== 'image') {
      const pre = document.createElement('pre')
      pre.draggable = true
      pre.textContent =
        entry.type === 'text'
          ? entry.text
          : entry.files.map((file) => file.split(/[\\/]/).pop()).join('\n')
      if (entry.type === 'file') pre.title = entry.files.join('\n')
      body.appendChild(pre)
    }
    const reorder = document.createElement('button')
    reorder.className = 'reorder-handle'
    reorder.textContent = '⠿'
    reorder.draggable = true
    reorder.title = '拖动排序'
    reorder.setAttribute('aria-label', '拖动排序')
    reorder.onclick = (event) => event.stopPropagation()
    reorder.ondragstart = (event) => {
      event.stopPropagation()
      beginReorder(entry.id, event)
    }
    const remove = document.createElement('button')
    remove.className = 'delete-entry'
    remove.textContent = '×'
    remove.title = '删除条目'
    remove.setAttribute('aria-label', '删除条目')
    remove.onclick = (event) => {
      event.stopPropagation()
      void discard(entry.id)
    }
    element.append(reorder, remove)
    element.onclick = (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || !window.getSelection().toString())
        select(entry.id, event)
    }
    element.onkeydown = (event) => {
      if ((event.key === ' ' || event.key === 'Enter') && event.target === element) {
        event.preventDefault()
        select(entry.id, event, event.key === ' ')
      }
    }
    element.ondragstart = (event) => {
      if (event.target.closest('.selection-area')) {
        event.preventDefault()
        return
      }
      if (!selected.has(entry.id)) select(entry.id)
      const items = chosen(),
        ids = items.map((row) => row.id)
      // Alt明确选择内部排序，普通拖动始终保持外部粘贴语义。
      if (event.altKey) {
        beginReorder(entry.id, event)
        return
      }
      if (new Set(items.map((row) => row.type)).size > 1) {
        event.preventDefault()
        event.dataTransfer.effectAllowed = 'none'
        status('不能混合复制或拖出文本、图片和文件，请分别操作', true)
        return
      }
      if (items[0].type === 'text') {
        event.dataTransfer.effectAllowed = 'copy'
        event.dataTransfer.setData('text/plain', items.map((row) => row.text).join('\n\n'))
      } else {
        event.preventDefault()
        window.textFloat.startDrag(ids)
      }
    }
    element.ondragover = (event) => {
      if (
        !reordering ||
        reordering.includes(entry.id) ||
        !event.dataTransfer.types.includes(reorderType)
      )
        return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const after =
        event.clientY >
        element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2
      element.classList.toggle('drop-before', !after)
      element.classList.toggle('drop-after', after)
    }
    element.ondragleave = () => element.classList.remove('drop-before', 'drop-after')
    element.ondrop = (event) => {
      if (!reordering || event.dataTransfer.getData(reorderType) !== JSON.stringify(reordering))
        return
      event.preventDefault()
      event.stopPropagation()
      const after =
        event.clientY >
        element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2
      move(reordering, entry.id, after)
      reordering = null
      element.classList.remove('drop-before', 'drop-after')
    }
    element.ondragend = () => {
      reordering = null
      list
        .querySelectorAll('.drop-before,.drop-after')
        .forEach((row) => row.classList.remove('drop-before', 'drop-after'))
    }
    rows.push({ ...entry, element })
    manualOrder.push(entry.id)
    if (sort.value === 'newest') list.prepend(element)
    else list.appendChild(element)
  }
  updateState()
}
document.getElementById('copy').onclick = () => {
  if (selected.size)
    void invoke(
      'copy',
      chosen().map((row) => row.id)
    )
}
document.getElementById('clear').onclick = () => discard()
document.getElementById('up').onclick = () => moveSelected(-1)
document.getElementById('down').onclick = () => moveSelected(1)
sort.onchange = () => {
  if (sort.value === 'manual' && !hasManualOrder) {
    manualOrder.splice(
      0,
      manualOrder.length,
      ...[...list.children].map((element) => element.dataset.id)
    )
    hasManualOrder = true
  }
  renderOrder()
  status(
    sort.value === 'manual'
      ? '手动排序；后续复制追加到末尾'
      : sort.value === 'newest'
        ? '从新到旧；新复制追加到顶部'
        : '从旧到新；新复制追加到末尾'
  )
}
document.getElementById('close').onclick = () => invoke('close')
document.getElementById('top').onclick = async () => {
  const next = !pinnedTop,
    result = await invoke('top', next)
  if (result === undefined) return
  pinnedTop = next
  document.getElementById('top').setAttribute('aria-pressed', String(next))
  document.getElementById('top').title = next ? '取消置顶' : '保持置顶'
}
document.getElementById('preview-close').onclick = () => document.getElementById('preview').close()
document.getElementById('preview').addEventListener('close', () => {
  document.getElementById('preview-image').removeAttribute('src')
  previewId = null
})
document.onkeydown = (event) => {
  if (document.getElementById('preview').open) return
  if (event.key === 'Escape') void invoke('close')
  if (event.key === 'Delete' && selected.size) {
    event.preventDefault()
    void discard(chosen().map((row) => row.id))
  }
  if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault()
    moveSelected(event.key === 'ArrowUp' ? -1 : 1)
  }
  if (event.ctrlKey || event.metaKey) {
    if (event.key.toLowerCase() === 'a') {
      event.preventDefault()
      if (selected.size === rows.length) selected.clear()
      else rows.forEach((row) => selected.add(row.id))
      updateState()
    }
    if (event.key.toLowerCase() === 'c' && !window.getSelection().toString() && selected.size) {
      event.preventDefault()
      document.getElementById('copy').click()
    }
  }
}
let initialized = false
const pending = []
const unsubscribe = window.textFloat.onAppend((entries) => {
  if (initialized) append(entries)
  else pending.push(...entries)
})
const removeError = window.textFloat.onError((message) => status(message, true))
window.addEventListener(
  'beforeunload',
  () => {
    // 关闭窗口时释放属于当前会话的反馈计时器。
    clearTimeout(statusTimer)
    statusTimer = null
    unsubscribe()
    removeError()
    rows.length = 0
    manualOrder.length = 0
    pending.length = 0
    selected.clear()
    anchor = null
  },
  { once: true }
)
void invoke('ready').then((entries) => {
  append(entries || [])
  append(pending.splice(0))
  initialized = true
})
