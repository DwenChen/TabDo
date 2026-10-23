import { expect, it } from 'vitest'
import { layoutDockTabs } from '../../src/shared/noteDockLayout'

it.each([true, false])(
  'orders adjacent tabs, preserves distant positions and keeps labels readable (vertical=%s)',
  (vertical) => {
    const layout = layoutDockTabs(
      [
        { id: 10, label: '便签 10', offset: 160 },
        { id: 2, label: '便签 2', offset: 130 },
        { id: 1, label: '便签 1', offset: 100 },
        { id: 99, label: '便签 99', offset: 700 }
      ],
      10,
      0,
      900,
      vertical
    )
    expect(layout.map((tab) => tab.id)).toEqual([1, 2, 10])
    expect(layout.map((tab) => tab.inset)).toEqual([0, 3, 6])
    expect(layout[1].offset - layout[0].offset).toBeGreaterThanOrEqual(64)
    expect(layout[2].offset + (vertical ? 80 : 88)).toBeLessThanOrEqual(900)
    expect(layoutDockTabs([{ id: 1, label: '便签 1', offset: 120 }], 1, 0, 900, vertical)).toEqual(
      []
    )
  }
)

it('clamps stacks at negative-coordinate monitor edges and adds inward columns when the edge is full', () => {
  const tabs = Array.from({ length: 10 }, (_, index) => ({
    id: index,
    label: `便签 ${index + 1}`,
    offset: -50 + index
  }))
  const layout = layoutDockTabs(tabs, 0, -300, 320, true)
  expect(layout).toHaveLength(10)
  for (const tab of layout) {
    expect(tab.offset).toBeGreaterThanOrEqual(-300)
    expect(tab.offset + 80).toBeLessThanOrEqual(20)
  }
  expect(layout.some((tab) => tab.inset >= 24)).toBe(true)
})
