<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { TAB_DEFINITIONS } from '@/constants'
import { useFavorites } from '@/composables/useFavorites'
import { useClipboardData } from '@/composables/useClipboardData'
import { useSelection } from '@/composables/useSelection'
import { useContextMenu } from '@/composables/useContextMenu'
import { useFavoriteDialog } from '@/composables/useFavoriteDialog'
import { buildClipboardPayload } from '@/utils/clipboardPayload'
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
/**
 * 将选中的文本按列表顺序整体追加到便签，或打开明确选择的图片窗口。
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
          type: 'text',
          // 纸色由宿主统一按新窗口顺序分配，追加不改变已有纸色。
          text: texts.map((entry) => entry.content).join('\n\n')
        })
      } else {
        const paths = source
          ? [source]
          : item.category === 'image' && item.type === 'file'
            ? item.files.map((file) => file.path)
            : [item.imagePath || item.content]
        if (paths.length > 1) {
          floatingMessage.value = '请使用各图片下方的按钮选择要悬浮或标记的图片'
          return
        }
        for (const file of paths) {
          const image = file.startsWith('data:image/') ? file : window.toolsProvider.readImage(file)
          await window.tabdo.internal.tools.openFloating({ type: 'image', image, edit })
        }
      }
    })
    if (!window.toolsLifecycle.signal.aborted) floatingMessage.value = '已打开独立悬浮窗口'
  } catch (error) {
    if (!window.toolsLifecycle.signal.aborted) floatingMessage.value = error.message
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

  // 复制会先隐藏窗口；整条写入/粘贴链必须登记后再发起宿主调用。
  return window.toolsLifecycle.runTask(async () => {
    try {
      let result
      if (items.length === 1 && activeTab.value !== 'favorite') {
        result = await window.tabdo.clipboard.write(items[0].id, shouldPaste)
      } else {
        const payload = buildClipboardPayload(items)
        if (!payload) {
          console.error('无法合并选中的剪贴板内容')
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
} = useSelection(filteredData, tabs, activeTab, writeClipboardItems, handleDeleteSelected)

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
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('click', hideContextMenu)

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
  window.tabdo.clipboard.onChange(() => doReload())
  focusSearchInput()
})

onUnmounted(() => {
  // 全局采集器由宿主持有，这里只解除当前界面订阅。
  window.tabdo.clipboard.onChange(null)
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('click', hideContextMenu)
})
</script>

<template>
  <div class="clipboard-app">
    <div class="main-content">
      <TabBar
        :active-tab="activeTab"
        :favorite-count="favorites.length"
        @update:active-tab="activeTab = $event"
      />
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
        @float-text="floatItem(false, $event)"
        @annotate-image="(item, source) => floatItem(true, item, source)"
      />
      <span v-if="floatingMessage" class="floating-status" role="status">{{
        floatingMessage
      }}</span>
    </div>

    <SideBar
      :selected-count="selectedCount"
      @copy="copySelected"
      @paste="pasteSelected"
      @clear="handleClearClick"
    />

    <ContextMenu
      :show="contextMenu.show"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :can-favorite="
        activeTab !== 'favorite' && ['text', 'image', 'file'].includes(contextMenu.item?.type)
      "
      :can-float="
        contextMenu.item?.type === 'text' ||
        contextMenu.item?.type === 'image' ||
        contextMenu.item?.category === 'image'
      "
      :can-annotate="contextMenu.item?.type === 'image' || contextMenu.item?.category === 'image'"
      @float="floatItem(false)"
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
