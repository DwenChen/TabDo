import { useHistoryState } from '@/composables/useHistoryState'
import { nextTick, onMounted, watch } from 'vue'
import { onBeforeRouteUpdate, useRoute } from 'vue-router'

/**
 * 处理路由跳转功能的 hooks
 * @param handler 处理函数
 */
export function useJumpFunction<T = any>(handler: (data: Partial<T>) => void): void {
  const route = useRoute()
  // 处理对应 tabdo code 进来的功能
  const handleJumpTabDoCode = (): void => {
    const state = useHistoryState<T>()
    handler(state)
  }
  onMounted(() => {
    handleJumpTabDoCode()
  })

  watch(
    () => route.fullPath,
    async (fullPath, oldFullPath) => {
      if (fullPath === oldFullPath) {
        return
      }
      await nextTick()
      handleJumpTabDoCode()
    }
  )
  onBeforeRouteUpdate(() => {
    handleJumpTabDoCode()
  })
}
