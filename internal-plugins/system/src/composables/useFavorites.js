import { ref, onScopeDispose } from 'vue'
import { FAVORITE_STORAGE_KEY } from '@/constants'

/**
 * 维护收藏列表及串行持久化队列。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
export function useFavorites() {
  const favorites = ref([])
  let saveQueue = Promise.resolve()
  let mutationVersion = 0
  let disposed = false

  // 保存任务持有自己的快照，界面退出后不再保留整份收藏列表。
  onScopeDispose(() => {
    disposed = true
    favorites.value = []
  })

  /**
   * 读取已保存的收藏条目。
   * @returns 操作完成后的 Promise。
   */
  const loadFavorites = async () => {
    try {
      const data = await window.ztools.db.promises.get(FAVORITE_STORAGE_KEY)
      if (!disposed && data && Array.isArray(data.favorites)) {
        favorites.value = data.favorites
      }
    } catch (error) {
      console.error('加载收藏列表失败:', error)
    }
  }

  /**
   * 串行保存收藏快照避免写入覆盖。
   * @returns 操作完成后的 Promise。
   */
  const saveFavorites = async () => {
    const snapshot = JSON.parse(JSON.stringify(favorites.value))
    const previousSave = saveQueue
    // 在排入串行队列时登记整个读改写链，退出不能截断尚未提交的收藏。
    const saveOperation = window.toolsLifecycle.runTask(() =>
      previousSave.then(async () => {
        const record = await window.ztools.db.promises.get(FAVORITE_STORAGE_KEY)
        await window.ztools.db.promises.put({
          _id: FAVORITE_STORAGE_KEY,
          _rev: record?._rev,
          favorites: snapshot
        })
      })
    )

    // Keep later writes running even if one database operation fails.
    saveQueue = saveOperation.catch(() => {})

    try {
      await saveOperation
      return true
    } catch (error) {
      console.error('保存收藏列表失败:', error)
      return false
    }
  }

  /**
   * 加入收藏并保存条目和备注。
   * @param item item 参数。
   * @param remark remark 参数。
   * @returns 操作完成后的 Promise。
   */
  const addFavorite = async (item, remark) => {
    const favoriteItem = {
      ...item,
      remark,
      favoriteTime: Date.now()
    }
    favorites.value.unshift(favoriteItem)
    mutationVersion++
    await saveFavorites()
  }

  /**
   * 批量删除收藏并在写入失败时回滚。
   * @param items items 参数。
   * @returns 操作完成后的 Promise。
   */
  const deleteFavorites = async (items) => {
    const targets = new Set(items)
    const previousItems = favorites.value.slice()
    const remainingItems = favorites.value.filter((item) => !targets.has(item))
    if (remainingItems.length === favorites.value.length) return false

    favorites.value.splice(0, favorites.value.length, ...remainingItems)
    const currentVersion = ++mutationVersion
    const saved = await saveFavorites()

    if (!disposed && !saved && mutationVersion === currentVersion) {
      favorites.value.splice(0, favorites.value.length, ...previousItems)
    }

    return saved
  }

  /**
   * 删除指定位置的收藏。
   * @param index index 参数。
   * @returns 操作完成后的 Promise。
   */
  const deleteFavorite = async (index) => {
    const item = favorites.value[index]
    if (!item) return false
    return deleteFavorites([item])
  }

  /**
   * 保存收藏新顺序并在失败时恢复。
   * @param fromIndex fromIndex 参数。
   * @param toIndex toIndex 参数。
   * @returns 操作完成后的 Promise。
   */
  const moveFavorite = async (fromIndex, toIndex) => {
    const lastIndex = favorites.value.length - 1
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      fromIndex > lastIndex ||
      toIndex < 0 ||
      toIndex > lastIndex ||
      fromIndex === toIndex
    ) {
      return false
    }

    const previousOrder = favorites.value.slice()
    const [movedItem] = favorites.value.splice(fromIndex, 1)
    favorites.value.splice(toIndex, 0, movedItem)
    const currentVersion = ++mutationVersion
    const saved = await saveFavorites()

    if (!disposed && !saved && mutationVersion === currentVersion) {
      // Mutate in place so consumers holding the array reference also roll back.
      favorites.value.splice(0, favorites.value.length, ...previousOrder)
    }

    return saved
  }

  return {
    favorites,
    loadFavorites,
    saveFavorites,
    addFavorite,
    deleteFavorite,
    deleteFavorites,
    moveFavorite
  }
}
