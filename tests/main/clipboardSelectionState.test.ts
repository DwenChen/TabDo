import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useSelection } from '../../internal-plugins/system/src/composables/useSelection.js'
import { buildClipboardPayload } from '../../internal-plugins/system/src/utils/clipboardPayload.js'

describe('clipboard explicit selection', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })
  it('keeps initial and refreshed categories unselected, while navigation starts with the first item', async () => {
    const scope = effectScope()
    const items = ref([
      { id: 'a', type: 'text' },
      { id: 'b', type: 'text' }
    ])
    const state = scope.run(() =>
      useSelection(items, ref([{ key: 'all' }]), ref('all'), vi.fn(), vi.fn())
    )!
    expect(state.selectedCount.value).toBe(0)
    state.handleKeydown({ key: 'ArrowDown', preventDefault: vi.fn() })
    expect(state.selectedItems.value[0].id).toBe('a')
    items.value = [{ id: 'new', type: 'text' }]
    await nextTick()
    expect(state.selectedCount.value).toBe(0)
    scope.stop()
  })

  it('retains a multi-selection for context copy and sends both items to the writer', async () => {
    const scope = effectScope()
    const items = ref([
      { id: 'a', type: 'text', content: 'alpha' },
      { id: 'b', type: 'text', content: 'beta' }
    ])
    const write = vi.fn()
    const state = scope.run(() =>
      useSelection(items, ref([{ key: 'all' }]), ref('all'), write, vi.fn())
    )!
    state.handleToggleClick({}, 0)
    state.handleToggleClick({}, 1)
    state.handleContextSelection(0)
    await state.copySelected()
    expect(write.mock.calls[0][0].map((item: { id: string }) => item.id)).toEqual(['a', 'b'])
    expect(write.mock.calls[0][1]).toBe(false)
    scope.stop()
  })
  it('rejects mixed content selection visibly and keeps the original checkbox selection', () => {
    const scope = effectScope(),
      invalid = vi.fn(),
      preventDefault = vi.fn()
    const items = ref([
      { id: 't', type: 'text' },
      { id: 'f', type: 'file' }
    ])
    const state = scope.run(() =>
      useSelection(items, ref([{ key: 'all' }]), ref('all'), vi.fn(), vi.fn(), invalid)
    )!
    state.handleToggleClick({}, 0)
    state.handleToggleClick({ preventDefault }, 1)
    expect(state.selectedItems.value.map((item) => item.id)).toEqual(['t'])
    expect(invalid).toHaveBeenCalledWith(expect.stringContaining('不能混合'))
    expect(preventDefault).toHaveBeenCalledOnce()
    scope.stop()
  })

  it('selects screenshots and image files together and preserves both file paths', async () => {
    const scope = effectScope()
    const screenshot = { id: 's', type: 'image', imagePath: 'C:/history/screenshot.png' }
    const imageFile = { id: 'i', type: 'file', files: [{ path: 'C:/source/photo.jpg' }] }
    const folder = {
      id: 'f',
      type: 'file',
      files: [{ path: 'C:/source/folder.png', isDirectory: true }]
    }
    const items = ref([screenshot, folder, imageFile])
    const write = vi.fn()
    const state = scope.run(() =>
      useSelection(items, ref([{ key: 'all' }]), ref('all'), write, vi.fn())
    )!
    try {
      state.handleToggleClick({}, 0)
      state.handleToggleClick({ shiftKey: true }, 2)
      await state.copySelected()
      expect(write).toHaveBeenCalledWith([screenshot, imageFile], false)
      expect(buildClipboardPayload(write.mock.calls[0][0])).toEqual({
        type: 'file',
        content: [screenshot.imagePath, imageFile.files[0].path]
      })
      expect(buildClipboardPayload([imageFile])).toEqual({
        type: 'file',
        content: [imageFile.files[0].path]
      })
      expect(buildClipboardPayload([screenshot, folder])).toBeNull()
    } finally {
      scope.stop()
    }
  })
})
