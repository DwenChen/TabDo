import { ref, computed, nextTick, onScopeDispose } from 'vue'
import { formatTime } from '@/utils/format'
import { PAGE_SIZE } from '@/constants'

/**
 * 将宿主历史记录转换为视图条目。
 * @param item item 参数。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
const transformClipboardItem = (item) => {
  const baseItem = {
    id: item.id,
    type: item.type,
    category: item.category || item.type,
    time: formatTime(item.timestamp),
    timestamp: item.timestamp,
    appName: item.appName || null
  }

  if (item.type === 'text') {
    return {
      ...baseItem,
      content: item.content || item.preview || '',
      charCount: (item.content || item.preview || '').length
    }
  }

  if (item.type === 'image') {
    return {
      ...baseItem,
      content: item.imagePath ? window.toolsProvider.fileUrl(item.imagePath) : '',
      imagePath: item.imagePath,
      preview: item.preview,
      size: item.resolution
    }
  }

  if (item.type === 'file') {
    if (item.files && Array.isArray(item.files)) {
      return {
        ...baseItem,
        content: item.preview || '',
        imagePath: item.category === 'image' ? item.files[0]?.path : undefined,
        imageSources:
          item.category === 'image'
            ? item.files.map((file) => window.toolsProvider.fileUrl(file.path))
            : [],
        files: item.files.map((file) => ({
          name: file.name,
          path: file.path,
          isDirectory: file.isDirectory,
          exists: file.exists
        })),
        fileCount: item.files.length,
        preview: item.preview
      }
    }
    if (item.fileName) {
      return {
        ...baseItem,
        content: item.preview || '',
        files: [
          {
            name: item.fileName,
            path: item.filePath,
            exists: item.fileExists
          }
        ],
        fileCount: 1,
        filePath: item.filePath
      }
    }
    return baseItem
  }

  return baseItem
}

/**
 * 维护分类查询、分页和展开状态。
 * @param activeTab activeTab 参数。
 * @param searchText searchText 参数。
 * @param favorites favorites 参数。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
export function useClipboardData(activeTab, searchText, favorites) {
  const clipboardData = ref([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const total = ref(0)
  const currentPage = ref(1)
  const hasMore = ref(true)
  const needsExpand = ref({})
  const expandedItems = ref(new Set())
  let requestVersion = 0
  let disposed = false

  // 销毁界面时清空图片和历史引用，并使所有在途查询结果失效。
  onScopeDispose(() => {
    disposed = true
    requestVersion++
    clipboardData.value = []
    needsExpand.value = {}
    expandedItems.value.clear()
  })

  // 根据当前tab筛选数据
  const filteredData = computed(() => {
    if (activeTab.value === 'all' || activeTab.value === 'favorite') {
      return clipboardData.value
    }
    return clipboardData.value
  })

  // 检查文本是否溢出需要展开按钮
  /**
   * 检查可见文本是否需要展开控件。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const checkTextOverflow = () => {
    nextTick(() => {
      if (disposed) return
      filteredData.value.forEach((item) => {
        if (item.type === 'text') {
          const element = document.querySelector(`[data-text-id="${item.id}"]`)
          if (element) {
            needsExpand.value[item.id] = element.scrollHeight > element.clientHeight
          }
        }
      })
    })
  }

  // 切换展开/收起
  /**
   * 切换指定条目的展开状态。
   * @param id id 参数。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const toggleExpand = (id) => {
    if (expandedItems.value.has(id)) {
      expandedItems.value.delete(id)
    } else {
      expandedItems.value.add(id)
    }
  }

  /**
   * 读取指定条目的展开状态。
   * @param id id 参数。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const isExpanded = (id) => {
    return expandedItems.value.has(id)
  }

  // 获取剪贴板历史
  /**
   * 按分类和关键词查询历史并丢弃过时响应。
   * @param append append 参数。
   * @returns 操作完成后的 Promise。
   */
  const fetchClipboardHistory = async (append = false) => {
    // 后台作用域不再发起查询；已发出的请求只允许宿主结束自身工作。
    if (disposed) return
    const version = append ? requestVersion : ++requestVersion
    if (!append) loadingMore.value = false
    if (append) {
      if (loadingMore.value || !hasMore.value) return
      loadingMore.value = true
    } else {
      loading.value = true
    }

    try {
      if (activeTab.value === 'favorite') {
        clipboardData.value = favorites.value
        total.value = favorites.value.length
        hasMore.value = false
        checkTextOverflow()
        return
      }

      const result = await window.tabdo.clipboard.getHistory(
        currentPage.value,
        PAGE_SIZE,
        searchText.value || undefined,
        activeTab.value === 'all' ? undefined : activeTab.value
      )

      // 丢弃旧分类或旧搜索的延迟响应，避免快速切换时覆盖当前内容。
      if (version !== requestVersion) return
      const newItems = result.items.map(transformClipboardItem)

      if (append) {
        clipboardData.value = [...clipboardData.value, ...newItems]
      } else {
        clipboardData.value = newItems
      }

      total.value = result.total
      hasMore.value = clipboardData.value.length < result.total
      checkTextOverflow()
    } catch (error) {
      if (version !== requestVersion) return
      console.error('获取剪贴板历史失败:', error)
      if (!append) {
        clipboardData.value = []
      }
      hasMore.value = false
    } finally {
      if (version === requestVersion) {
        loading.value = false
        loadingMore.value = false
      }
    }
  }

  /**
   * 请求当前分类的下一页历史。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const loadMore = () => {
    if (disposed || !hasMore.value || loadingMore.value) return
    currentPage.value++
    fetchClipboardHistory(true)
  }

  /**
   * 回到首页并刷新当前分类。
   * @param clipboardListRef clipboardListRef 参数。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const reload = (clipboardListRef) => {
    if (disposed) return
    if (clipboardListRef?.value) {
      // 支持组件实例（通过 $el）和原生 DOM 元素
      const el = clipboardListRef.value.$el || clipboardListRef.value
      el.scrollTop = 0
    }
    currentPage.value = 1
    hasMore.value = true
    fetchClipboardHistory()
  }

  return {
    clipboardData,
    loading,
    loadingMore,
    total,
    hasMore,
    needsExpand,
    expandedItems,
    filteredData,
    toggleExpand,
    isExpanded,
    fetchClipboardHistory,
    loadMore,
    reload,
    checkTextOverflow
  }
}
