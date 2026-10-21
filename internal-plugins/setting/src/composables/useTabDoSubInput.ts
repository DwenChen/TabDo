import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { ComputedRef } from 'vue'
import { createEventHook, useEventListener } from '@vueuse/core'
import type { EventHookOn } from '@vueuse/core'

export interface UseSubInputResult {
  /**
   * 当前子输入框的值，只读
   */
  value: ComputedRef<string>

  /**
   * 设置子输入框的值
   * @param value 子输入框的值
   */
  setSubInput(value: string): void

  /**
   * 注册子输入框
   */
  register(autoFocus?: boolean): void

  /**
   * 当数据变更
   */
  onChanged: EventHookOn<string>

  /**
   * 当搜索时，按下Enter触发
   */
  onSearch: EventHookOn<string>

  /**
   * 当数据清空时，按下Enter触发
   */
  onClear: EventHookOn<void>
}

/**
 * 子输入框 hook
 * @param initialValue 子输入框初始值
 * @param placeholder 占位符
 * @param isFocus 是否聚焦，默认true
 * @param bindFindShortcut 是否绑定搜索快捷键，默认true
 * 绑定后可通过 macOS 的 Command + F 或 Windows 的 Ctrl + F
 * 重新聚焦并选中当前子输入框内容
 * @returns 当前输入值和跟随组件生命周期的输入框操作。
 */
export function useTabDoSubInput(
  initialValue: string = '',
  placeholder?: string,
  isFocus?: boolean,
  bindFindShortcut: boolean = true
): UseSubInputResult {
  const tabdoWithSubInput = tabdo as typeof tabdo & {
    subInputFocus?: () => boolean
    subInputSelect?: () => boolean
  }

  // 是否在注册中
  let registering = false
  let disposed = false
  let registrationTimer: ReturnType<typeof setInterval> | null = null
  let focusTimer: ReturnType<typeof setInterval> | null = null

  // 子输入框的值
  const subInput = ref(initialValue)
  // 子输入的包装值
  const subInputWrap = computed(() => subInput.value)

  // 当数据变化的hook
  const onChangedHook = createEventHook<string>()
  // 当搜索时的hook
  const onSearchHook = createEventHook<string>()
  // 当搜索时的hook
  const onClearHook = createEventHook<void>()

  /**
   * 只处理当前页面的查找和搜索按键。
   * @param e 当前键盘事件。
   * @returns 无返回值。
   */
  function handleKeyDown(e: KeyboardEvent): void {
    if (disposed) return
    const isFindShortcut =
      e.key.toLowerCase() === 'f' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey

    if (bindFindShortcut && isFindShortcut) {
      e.preventDefault()
      e.stopPropagation()
      focusSubInput(true)
      return
    }

    if (e.key === 'Enter' && subInput.value) {
      void onSearchHook.trigger(subInput.value)
      e.preventDefault()
      e.stopPropagation()
    }
  }

  /**
   * 重新注册并立即尝试聚焦，有限重试不跨越组件卸载。
   * @param select 是否选中现有输入。
   * @returns 无返回值。
   */
  function focusSubInput(select = false): void {
    if (disposed) return
    register(true)
    if (focusTimer) clearInterval(focusTimer)
    let retryCount = 0
    /**
     * 尝试把焦点交给宿主输入框，失败最多等待十次。
     * @returns 无返回值。
     */
    const attemptFocus = (): void => {
      const handled = select
        ? tabdoWithSubInput.subInputSelect?.()
        : tabdoWithSubInput.subInputFocus?.()

      retryCount++
      if (handled || retryCount >= 10) {
        if (focusTimer) clearInterval(focusTimer)
        focusTimer = null
      }
    }
    focusTimer = setInterval(attemptFocus, 50)
    attemptFocus()
  }

  /**
   * 注册当前页面的子输入框；先立即尝试，宿主尚未就绪时最多重试一秒。
   * @param autoFocus 是否在注册后自动聚焦。
   * @returns 无返回值。
   */
  function register(autoFocus = isFocus): void {
    if (disposed || registering) {
      return
    }
    registering = true
    // 先移除之前的
    tabdo.removeSubInput()
    let attempts = 0
    /**
     * 尝试注册当前输入框，成功或达到时限后释放重试器。
     * @returns 无返回值。
     */
    const attemptRegistration = (): void => {
      attempts++
      const res = tabdo.setSubInput(
        ({ text }) => {
          if (disposed) return
          if (subInput.value !== text) {
            subInput.value = text
            onChangedHook.trigger(text)
            if (!text) {
              onClearHook.trigger()
            }
          }
        },
        placeholder,
        autoFocus
      )
      // 如果注册成功
      if (res) {
        // 设置初始值
        if (subInput.value) {
          tabdo.setSubInputValue(subInput.value)
          onChangedHook.trigger(subInput.value)
        } else if (initialValue) {
          tabdo.setSubInputValue(initialValue)
        }
      }
      if (res || attempts >= 10) {
        if (registrationTimer) clearInterval(registrationTimer)
        registrationTimer = null
        registering = false
      }
    }
    // 同步成功时无需创建轮询，避免每次页面切换固定等待 100ms。
    attemptRegistration()
    if (registering) registrationTimer = setInterval(attemptRegistration, 100)
  }

  onMounted(() => {
    // 注册子输入框
    register()
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    disposed = true
    if (registrationTimer) clearInterval(registrationTimer)
    if (focusTimer) clearInterval(focusTimer)
    registrationTimer = null
    focusTimer = null
    registering = false
    tabdo.removeSubInput()
    window.removeEventListener('keydown', handleKeyDown)
  })

  /**
   * 仅向仍存活的页面发布输入值。
   * @param val 新输入值。
   * @returns 无返回值。
   */
  function setSubInput(val: string): void {
    if (disposed) return
    subInput.value = val
    tabdo.setSubInputValue(subInput.value)
  }

  useEventListener(window, 'all', () => {
    if (disposed) return
    register()
    window.addEventListener('keydown', handleKeyDown)
  })

  return {
    value: subInputWrap,
    setSubInput,
    register,
    onChanged: onChangedHook.on,
    onSearch: onSearchHook.on,
    onClear: onClearHook.on
  }
}
