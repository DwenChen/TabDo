<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { TAB_DEFINITIONS } from '@/constants'
import { useFavorites } from '@/composables/useFavorites'
import { useClipboardData } from '@/composables/useClipboardData'
import { useSelection } from '@/composables/useSelection'
import { useContextMenu } from '@/composables/useContextMenu'
import { useFavoriteDialog } from '@/composables/useFavoriteDialog'
import { buildClipboardPayload, getClipboardTransferError } from '@/utils/clipboardPayload'
import TabBar from '@/components/TabBar.vue'
import ClipboardList from '@/components/ClipboardList.vue'
import SideBar from '@/components/SideBar.vue'
import ContextMenu from '@/components/ContextMenu.vue'
import FavoriteDialog from '@/components/FavoriteDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

// ---- 状态 ----
const activeTab = ref('all')
const searchText = ref('')
const floatingMessage = ref('')
const relaying = ref(false)
let reloadWhenVisible = false
let floatingMessageTimer = null
/**
 * 显示短暂反馈并重置计时，避免旧提示或旧计时器遮挡后续操作。
 * @param {string} message 当前反馈。
 * @param {number} duration 显示毫秒数，0表示等待操作完成后替换。
 * @returns {void} 更新提示并登记属于当前页面的清理计时器。
 */
function showFloatingMessage(message, duration = 4000) {
  clearTimeout(floatingMessageTimer)
  floatingMessageTimer = null
  floatingMessage.value = message
  // 操作中的反馈由完成或失败替换，其他反馈到期自动清除。
  if (message && duration > 0)
    floatingMessageTimer = setTimeout(() => {
      floatingMessage.value = ''
      floatingMessageTimer = null
    }, duration)
}
/**
 * 常驻窗口不可见时暂停界面查询，宿主剪贴板采集仍独立工作。
 * @returns {void} 可见时刷新，否则只登记下一次显示需要刷新。
 */
function handleClipboardChange() {
  if (document.hidden) reloadWhenVisible = true
  else doReload()
}
/**
 * 恢复可见时读取最新历史，避免隐藏期间持续拉取列表。
 * @returns {void} 没有待刷新内容时不执行查询。
 */
function handleVisibilityChange() {
  if (!document.hidden && reloadWhenVisible) {
    reloadWhenVisible = false
    doReload()
  }
}
/**
 * 把明确选中的文本、图片或文件转入中转，空入口只打开窗口。
 * @param {object|null} target 可见按钮指向的条目，省略时使用当前选择集。
 * @returns {Promise<void>} 转交结束后更新提示，失败显示宿主原因。
 */
async function relayItems(target = null) {
  if (relaying.value) return
  const items =
    target && !selectedItemSet.value.has(target)
      ? [target]
      : filteredData.value.filter((item) => selectedItemSet.value.has(item))
  hideContextMenu()
  relaying.value = true
  showFloatingMessage(items.length ? `正在转入 ${items.length} 项…` : '正在打开悬浮中转…', 0)
  try {
    await window.toolsLifecycle.runTask(() =>
      window.tabdo.internal.tools.openFloating({
        type: 'relay',
        entries: items.map((item) => ({
          type: item.type,
          text: item.content,
          image: item.imagePath || item.content,
          files: item.files?.map((file) => file.path)
        }))
      })
    )
    if (!window.toolsLifecycle.signal.aborted)
      showFloatingMessage(
        items.length ? `已转入悬浮中转 ${items.length} 项` : '已打开悬浮中转',
        3000
      )
  } catch (error) {
    if (!window.toolsLifecycle.signal.aborted) showFloatingMessage(error.message)
  } finally {
    if (!window.toolsLifecycle.signal.aborted) relaying.value = false
  }
}
/**
 * 悬浮全部选中图片或标记明确的一张图片，中转走独立入口。
 * @param edit 是否直接进入图片标注。
 * @param target 可见图片按钮指向的条目。
 * @param source 多图条目中明确选择的一张图片。
 * @returns 所有独立窗口打开后的 Promise。
 */
async function floatItem(edit = false, target = null, source = null) {
  const item = target || contextMenu.value.item
  hideContextMenu()
  if (!item) return
  try {
    await window.toolsLifecycle.runTask(async () => {
      if (item.type === 'text') {
        // 右键与条目快捷按钮共用选择集；未选中的目标仍只处理自身，避免带入无关内容。
        const texts = selectedItemSet.value.has(item)
          ? filteredData.value.filter(
              (entry) => selectedItemSet.value.has(entry) && entry.type === 'text'
            )
          : [item]
        await window.tabdo.internal.tools.openFloating({
          type: 'text-list',
          texts: texts.map((entry) => entry.content)
        })
      } else {
        // 标记仍针对明确的一张；悬浮按钮以被点击条目是否属于选择集决定批量范围。
        const images =
          !edit && selectedItemSet.value.has(item)
            ? filteredData.value.filter(
                (entry) =>
                  selectedItemSet.value.has(entry) &&
                  (entry.type === 'image' || entry.category === 'image')
              )
            : [item]
        const paths = [
          ...new Set(
            images.flatMap((entry) =>
              edit && source
                ? [source]
                : entry.category === 'image' && entry.type === 'file'
                  ? entry.files.map((file) => file.path)
                  : [entry.imagePath || entry.content]
            )
          )
        ]
        for (const file of paths) {
          const image = file.startsWith('data:image/') ? file : window.toolsProvider.readImage(file)
          await window.tabdo.internal.tools.openFloating({ type: 'image', image, edit })
        }
      }
    })
    if (!window.toolsLifecycle.signal.aborted) showFloatingMessage('已打开独立悬浮窗口', 3000)
  } catch (error) {
    if (!window.toolsLifecycle.signal.aborted) showFloatingMessage(error.message)
  }
}
// ---- Composables ----
const { favorites, loadFavorites, addFavorite, deleteFavorite, deleteFavorites, moveFavorite } =
  useFavorites()

const {
  loading,
  loadingMore,
  hasMore,
  needsExpand,
  expandedItems,
  filteredData,
  toggleExpand,
  fetchClipboardHistory,
  loadMore,
  reload,
  checkTextOverflow
} = useClipboardData(activeTab, searchText, favorites)

// tabs 计算属性（带收藏数量）
const tabs = computed(() =>
  TAB_DEFINITIONS.map((tab) =>
    tab.key === 'favorite' ? { ...tab, count: favorites.value.length } : tab
  )
)

/**
 * 判断宿主写入 API 是否成功。
 * @param result result 参数。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const isSuccessfulWrite = (result) => result === true || result?.success === true

// 将当前选择写入剪贴板
/**
 * 合并所选条目并复制或粘贴。
 * @param items items 参数。
 * @param shouldPaste shouldPaste 参数。
 * @returns 操作完成后的 Promise。
 */
const writeClipboardItems = async (items, shouldPaste = true) => {
  if (!items.length) return
  // 在任何宿主写入、隐藏或粘贴前拒绝混合载荷，不静默丢弃其中一种内容。
  const error = getClipboardTransferError(items.map((item) => item.type))
  if (error) {
    showFloatingMessage(error)
    return
  }

  // 复制会先隐藏窗口；整条写入/粘贴链必须登记后再发起宿主调用。
  return window.toolsLifecycle.runTask(async () => {
    try {
      let result
      if (items.length === 1 && activeTab.value !== 'favorite') {
        result = await window.tabdo.clipboard.write(items[0].id, shouldPaste)
      } else {
        const payload = buildClipboardPayload(items)
        if (!payload) {
          showFloatingMessage('所选内容无法复制，请重新选择有效条目')
          return
        }
        result = await window.tabdo.clipboard.writeContent(payload, shouldPaste)
      }

      if (!isSuccessfulWrite(result)) {
        console.error('写入剪贴板失败:', result)
      }
    } catch (error) {
      console.error('复制失败:', error)
    }
  })
}

const showDeleteConfirm = ref(false)
const deleteTargetItems = ref([])
const deleteFromFavorites = ref(false)

/**
 * 准备选中条目的删除确认。
 * @param items items 参数。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const handleDeleteSelected = (items) => {
  deleteTargetItems.value = items.slice()
  deleteFromFavorites.value = activeTab.value === 'favorite'
  showDeleteConfirm.value = true
}

const {
  activeIndex,
  selectedItemSet,
  selectedCount,
  clipboardListRef,
  resetSelection,
  handleItemClick,
  handleContextSelection,
  handleDoubleClick,
  handleKeydown,
  handleToggleClick,
  copySelected,
  pasteSelected
} = useSelection(
  filteredData,
  tabs,
  activeTab,
  writeClipboardItems,
  handleDeleteSelected,
  showFloatingMessage
)

const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu()
const { favoriteDialog, openFavoriteDialog, confirmFavorite, cancelFavoriteDialog } =
  useFavoriteDialog()

// ---- 事件处理 ----
/**
 * 同步右键条目的选择状态并显示菜单。
 * @param event event 参数。
 * @param item item 参数。
 * @param index index 参数。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const handleContextMenu = (event, item, index) => {
  handleContextSelection(index)
  showContextMenu(event, item, activeTab.value)
}

/**
 * 确认并保存收藏备注。
 * @param remark remark 参数。
 * @returns 操作完成后的 Promise。
 */
const handleFavoriteConfirm = async (remark) => {
  await confirmFavorite(addFavorite, remark)
}

/**
 * 准备当前条目的删除确认。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const handleDeleteItem = () => {
  deleteTargetItems.value = [contextMenu.value.item]
  deleteFromFavorites.value = activeTab.value === 'favorite'
  hideContextMenu()
  showDeleteConfirm.value = true
}

/**
 * 执行已确认的批量删除并刷新列表。
 * @returns 操作完成后的 Promise。
 */
const handleDeleteConfirm = async () => {
  showDeleteConfirm.value = false
  if (deleteTargetItems.value.length === 0) return

  try {
    if (deleteFromFavorites.value) {
      await deleteFavorites(deleteTargetItems.value)
    } else {
      await Promise.all(
        deleteTargetItems.value.map((item) => window.tabdo.clipboard.delete(item.id))
      )
    }
    doReload()
  } catch (error) {
    console.error('删除失败:', error)
  }
  deleteTargetItems.value = []
  deleteFromFavorites.value = false
}

/**
 * 取消待处理的删除操作。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const handleDeleteCancel = () => {
  showDeleteConfirm.value = false
  deleteTargetItems.value = []
  deleteFromFavorites.value = false
}

/**
 * 为右键条目打开收藏对话框。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const handleOpenFavoriteDialog = () => {
  openFavoriteDialog(contextMenu.value.item)
  hideContextMenu()
}

/**
 * 删除指定收藏并刷新当前列表。
 * @param index index 参数。
 * @returns 操作完成后的 Promise。
 */
const handleDeleteFavorite = async (index) => {
  await deleteFavorite(index)
  if (activeTab.value === 'favorite') {
    fetchClipboardHistory()
  }
}

/**
 * 保存收藏排序并更新溢出状态。
 * @param { fromIndex, toIndex } { fromIndex, toIndex } 参数。
 * @returns 操作完成后的 Promise。
 */
const handleReorderFavorite = async ({ fromIndex, toIndex }) => {
  await moveFavorite(fromIndex, toIndex)
  checkTextOverflow()
}

const deleteConfirmTitle = computed(() => (deleteFromFavorites.value ? '删除收藏' : '删除记录'))

const deleteConfirmMessage = computed(() => {
  const count = deleteTargetItems.value.length
  if (deleteFromFavorites.value) {
    return count > 1 ? `确定要删除选中的 ${count} 条收藏吗？` : '确定要删除这条收藏吗？'
  }
  return count > 1 ? `确定要删除选中的 ${count} 条剪贴板记录吗？` : '确定要删除这条剪贴板记录吗？'
})

/**
 * 接近列表底部时加载下一页。
 * @param event event 参数。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const handleScroll = (event) => {
  const container = event.target
  if (container.scrollTop + container.clientHeight >= container.scrollHeight - 100) {
    loadMore()
  }
}

const showClearConfirm = ref(false)

/**
 * 清空历史后重新查询列表。
 * @returns 操作完成后的 Promise。
 */
const clearClipboard = async () => {
  try {
    await window.tabdo.clipboard.clear()
    doReload()
  } catch (error) {
    console.error('清空失败:', error)
  }
}

/**
 * 显示清空历史确认框。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const handleClearClick = () => {
  showClearConfirm.value = true
}

/**
 * 执行用户确认的历史清空操作。
 * @returns 操作完成后的 Promise。
 */
const handleClearConfirm = async () => {
  showClearConfirm.value = false
  await clearClipboard()
}

/**
 * 关闭清空历史确认框。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const handleClearCancel = () => {
  showClearConfirm.value = false
}

/**
 * 重置选择并刷新当前分类。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const doReload = () => {
  if (window.toolsLifecycle.signal.aborted) return
  resetSelection()
  reload(clipboardListRef)
}

/**
 * 在下一帧聚焦宿主搜索框。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const focusSearchInput = () => {
  nextTick(() => {
    if (window.toolsLifecycle.signal.aborted) return
    try {
      window.tabdo.subInputFocus()
    } catch (error) {
      console.error('聚焦搜索框失败:', error)
    }
  })
}

// ---- 监听 & 生命周期 ----
watch(activeTab, doReload)

// 当对话框打开时，阻止全局键盘快捷键（如 Enter 粘贴）
const isAnyModalOpen = computed(
  () => showDeleteConfirm.value || showClearConfirm.value || favoriteDialog.value.show
)

/**
 * 按模态框状态分发全局快捷键。
 * @param event event 参数。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const handleGlobalKeydown = (event) => {
  if (isAnyModalOpen.value) return

  if (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'f'
  ) {
    event.preventDefault()
    focusSearchInput()
    return
  }

  handleKeydown(event)
}

onMounted(async () => {
  // 组件只声明能力，开关由宿主固定在标题栏右上角。
  void window.tabdo.enableTemporaryResident(true)
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('click', hideContextMenu)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  await loadFavorites()
  // 挂载过程可能已经退出，迟到的初始化不得重新登记监听或改变宿主输入框。
  if (window.toolsLifecycle.signal.aborted) return
  fetchClipboardHistory()

  await window.tabdo.setSubInput(
    (text) => {
      searchText.value = text.text
      doReload()
    },
    '搜索剪贴板内容...',
    true
  )

  if (window.toolsLifecycle.signal.aborted) return
  window.tabdo.clipboard.onChange(handleClipboardChange)
  focusSearchInput()
})

onUnmounted(() => {
  // 页面退出后不保留提示计时器或迟到的界面更新。
  clearTimeout(floatingMessageTimer)
  floatingMessageTimer = null
  if (!window.toolsLifecycle.signal.aborted)
    void window.tabdo.enableTemporaryResident(false).catch(() => {})
  // 全局采集器由宿主持有，这里只解除当前界面订阅。
  window.tabdo.clipboard.onChange(null)
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('click', hideContextMenu)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div
    class="clipboard-app"
    :data-active-tab="activeTab"
    :data-search-text="searchText"
    :data-context-menu="contextMenu.show"
    :data-favorite-dialog="favoriteDialog.show"
  >
    <div class="main-content">
      <div class="clipboard-topbar">
        <TabBar
          :active-tab="activeTab"
          :favorite-count="favorites.length"
          @update:active-tab="activeTab = $event"
        />
      </div>
      <ClipboardList
        ref="clipboardListRef"
        :items="filteredData"
        :loading="loading"
        :loading-more="loadingMore"
        :has-more="hasMore"
        :active-index="activeIndex"
        :selected-items="selectedItemSet"
        :active-tab="activeTab"
        :expanded-items="expandedItems"
        :needs-expand="needsExpand"
        @select="handleItemClick"
        @toggle-selection="handleToggleClick"
        @dblclick="handleDoubleClick"
        @contextmenu="handleContextMenu"
        @toggle-expand="toggleExpand"
        @delete-favorite="handleDeleteFavorite"
        @reorder-favorite="handleReorderFavorite"
        @scroll="handleScroll"
        @float-image="(item, source) => floatItem(false, item, source)"
        @float-text="relayItems($event)"
        @relay="relayItems($event)"
        @transfer-error="showFloatingMessage($event)"
        @annotate-image="(item, source) => floatItem(true, item, source)"
      />
      <span v-if="floatingMessage" class="floating-status" role="status">{{
        floatingMessage
      }}</span>
    </div>

    <SideBar
      :selected-count="selectedCount"
      :relaying="relaying"
      @copy="copySelected"
      @paste="pasteSelected"
      @relay="relayItems()"
      @clear="handleClearClick"
    />

    <ContextMenu
      :show="contextMenu.show"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :can-favorite="
        activeTab !== 'favorite' && ['text', 'image', 'file'].includes(contextMenu.item?.type)
      "
      :can-float="contextMenu.item?.type === 'image' || contextMenu.item?.category === 'image'"
      :can-relay="['text', 'image', 'file'].includes(contextMenu.item?.type)"
      :can-annotate="contextMenu.item?.type === 'image' || contextMenu.item?.category === 'image'"
      @float="floatItem(false)"
      @relay="relayItems(contextMenu.item)"
      @annotate="floatItem(true)"
      @favorite="handleOpenFavoriteDialog"
      @delete="handleDeleteItem"
    />

    <FavoriteDialog
      :show="favoriteDialog.show"
      :item="favoriteDialog.item"
      @confirm="handleFavoriteConfirm"
      @cancel="cancelFavoriteDialog"
    />

    <ConfirmDialog
      :show="showClearConfirm"
      title="清空剪贴板"
      message="确定要清空所有剪贴板记录吗？此操作不可撤销。"
      @confirm="handleClearConfirm"
      @cancel="handleClearCancel"
    />

    <ConfirmDialog
      :show="showDeleteConfirm"
      :title="deleteConfirmTitle"
      :message="deleteConfirmMessage"
      @confirm="handleDeleteConfirm"
      @cancel="handleDeleteCancel"
    />
  </div>
</template>

<style scoped>
.clipboard-topbar {
  display: flex;
  align-items: center;
  gap: 6px;
}
.clipboard-topbar :deep(.tab-bar) {
  flex: 1;
  min-width: 0;
}
.floating-status {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 10px;
  pointer-events: none;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border-radius: 6px;
  font-size: 12px;
}
.clipboard-app {
  display: flex;
  width: 100%;
  min-height: 100vh;
  background: var(--bg-app);
  font-family: var(--font-family-ui);
  color: var(--text-primary);
}

.main-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
</style>
