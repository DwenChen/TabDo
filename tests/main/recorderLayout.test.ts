import { describe, it, expect } from 'vitest'
import { placeRecorderControl } from '../../src/shared/recorderLayout'
const size = { width: 300, height: 66 }
describe('recording control placement', () => {
  it('places the bar below a region with a clear gap', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 },
      capture = { x: 200, y: 200, width: 640, height: 400 }
    const result = placeRecorderControl(capture, [area], size)
    expect(result.y).toBeGreaterThanOrEqual(capture.y + capture.height + 8)
    expect(result.x).toBeGreaterThanOrEqual(area.x)
    expect(result.x + result.width).toBeLessThanOrEqual(area.width)
  })
  it('uses the upper edge when the region reaches the work area bottom', () => {
    const capture = { x: 200, y: 500, width: 640, height: 530 }
    const result = placeRecorderControl(capture, [{ x: 0, y: 0, width: 1920, height: 1040 }], size)
    expect(result.y + result.height).toBeLessThanOrEqual(capture.y - 8)
  })
  it('supports monitors to the left of the primary display and a second free display', () => {
    const capture = { x: -1920, y: 0, width: 1920, height: 1080 },
      areas = [
        { x: -1920, y: 0, width: 1920, height: 1040 },
        { x: 0, y: 0, width: 1920, height: 1040 }
      ]
    const result = placeRecorderControl(capture, areas, size)
    expect(result.x).toBeGreaterThanOrEqual(0)
    expect(result.x + result.width).toBeLessThanOrEqual(1920)
  })
  it('uses a stable work area corner when full screen leaves no free rectangle', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 }
    const result = placeRecorderControl({ ...area, height: 1080 }, [area], size)
    expect(result.x).toBeGreaterThan(1500)
    expect(result.y).toBeLessThan(30)
    expect(result.width).toBe(300)
  })
})
