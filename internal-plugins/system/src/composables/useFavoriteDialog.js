import { ref } from 'vue'

/**
 * 维护收藏备注对话框状态。
 * @returns 处理结果；仅更新状态的操作无返回值。
 */
export function useFavoriteDialog() {
  const favoriteDialog = ref({
    show: false,
    remark: '',
    item: null
  })

  /**
   * 准备目标条目的收藏备注。
   * @param item item 参数。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const openFavoriteDialog = (item) => {
    favoriteDialog.value = {
      show: true,
      remark: '',
      item: item
    }
  }

  /**
   * 保存收藏并关闭备注对话框。
   * @param addFn addFn 参数。
   * @param remark remark 参数。
   * @returns 操作完成后的 Promise。
   */
  const confirmFavorite = async (addFn, remark = '') => {
    if (!favoriteDialog.value.item) return
    await addFn(favoriteDialog.value.item, remark.trim())
    favoriteDialog.value.show = false
    favoriteDialog.value.remark = ''
    favoriteDialog.value.item = null
  }

  /**
   * 放弃当前收藏备注输入。
   * @returns 处理结果；仅更新状态的操作无返回值。
   */
  const cancelFavoriteDialog = () => {
    favoriteDialog.value.show = false
    favoriteDialog.value.remark = ''
    favoriteDialog.value.item = null
  }

  return {
    favoriteDialog,
    openFavoriteDialog,
    confirmFavorite,
    cancelFavoriteDialog
  }
}
