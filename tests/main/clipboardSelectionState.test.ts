import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useSelection } from '../../internal-plugins/system/src/composables/useSelection.js'

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
})
