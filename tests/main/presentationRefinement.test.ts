import { describe, expect, it } from 'vitest'
import {
  getKeycapScale,
  resizeKeycaps
} from '../../internal-plugins/system/presentation/src/components/video-editor/keyboardSizing'
import { DEFAULT_KEYBOARD_STYLE } from '../../internal-plugins/system/presentation/src/components/video-editor/keyboardDisplay'
import {
  DEFAULT_FIGURE_DATA,
  DEFAULT_FIGURE_SIZE,
  normalizeCursorStyle,
  type AnnotationRegion
} from '../../internal-plugins/system/presentation/src/components/video-editor/types'
import {
  ARROW_STYLES,
  normalizeArrowStyle
} from '../../internal-plugins/system/presentation/src/components/video-editor/arrowGeometry'
import { buildArrowSvg } from '../../internal-plugins/system/presentation/src/components/video-editor/arrowAppearance'
import { getAnnotationMotion } from '../../internal-plugins/system/presentation/src/components/video-editor/annotationMotion'
import {
  canConnectZoomRegions,
  getZoomConnectionGap
} from '../../internal-plugins/system/presentation/src/components/video-editor/zoomConnection'
import { findDominantRegion } from '../../internal-plugins/system/presentation/src/components/video-editor/videoPlayback/zoomRegionUtils'
import {
  resolveZoomCamera,
  normalizeZoomCamera
} from '../../internal-plugins/system/presentation/src/components/video-editor/zoomCamera'
import { type ZoomRegion } from '../../internal-plugins/system/presentation/src/components/video-editor/types'

/**
 * 构造具有旧字号与倍率的按键片段，验证大小迁移不损坏时间和内容。
 * @returns 可独立编辑的旧格式片段。
 */
function key(): AnnotationRegion {
  return {
    id: 'old',
    type: 'keystroke',
    content: 'Ctrl + S',
    startMs: 100,
    endMs: 1600,
    position: { x: 25, y: 82 },
    size: { width: 50, height: 10 },
    style: { ...DEFAULT_KEYBOARD_STYLE, fontSize: 65, keycapScale: 0.8 },
    zIndex: 1
  }
}

describe('演示预览与按键设置整理', () => {
  it('变焦连接遵守用户阈值和等号边界，二维与三维共用规则', () => {
    const first: ZoomRegion = {
      id: 'first',
      startMs: 0,
      endMs: 3000,
      depth: 2,
      scale: 2,
      focus: { cx: 0.4, cy: 0.5 },
      camera: normalizeZoomCamera({ mode: '3d', yaw: 30 })
    }
    const next: ZoomRegion = {
      ...first,
      id: 'next',
      startMs: 4600,
      endMs: 7600,
      camera: normalizeZoomCamera({ mode: '3d', yaw: -30 })
    }
    expect(getZoomConnectionGap()).toBe(1500)
    expect(canConnectZoomRegions(first, next, 1599)).toBe(false)
    expect(canConnectZoomRegions(first, next, 1600)).toBe(true)
    expect(canConnectZoomRegions(first, { ...next, startMs: 3000 }, 0)).toBe(true)
    expect(canConnectZoomRegions(first, { ...next, startMs: 3001 }, 0)).toBe(false)
    const independent = {
      connectZooms: true,
      connectedZoomGapMs: 1599,
      zoomInDurationMs: 100,
      zoomOutDurationMs: 100
    }
    const connected = { ...independent, connectedZoomGapMs: 1600 }
    expect(findDominantRegion([first, next], 4100, independent).strength).toBe(0)
    expect(findDominantRegion([first, next], 4100, connected).strength).toBe(1)
    expect(resolveZoomCamera([first, next], 4100, independent).strength).toBe(0)
    expect(resolveZoomCamera([first, next], 4100, connected).strength).toBe(1)
  })
  it('大小统一后字体和框同步缩放，旧字号与倍率折算保留，中心与原始片段不变', () => {
    const original = key()
    expect(getKeycapScale(original.style)).toBe(1)
    const larger = resizeKeycaps(original, 1.5)
    expect(larger.size).toEqual({ width: 75, height: 15 })
    expect(larger.position.x + larger.size.width / 2).toBe(50)
    expect(larger.position.y + larger.size.height / 2).toBe(87)
    expect(larger.style.fontSize).toBe(52)
    expect(getKeycapScale(larger.style)).toBe(1.5)
    expect(resizeKeycaps(larger, 1).size).toEqual(original.size)
    expect(original.style.fontSize).toBe(65)
    expect(larger).toMatchObject({
      id: original.id,
      content: original.content,
      startMs: 100,
      endMs: 1600
    })
  })
  it('大号键帽不把显示框推到画面外，默认动画及缺省动画都为无', () => {
    const enlarged = resizeKeycaps(key(), 3)
    expect(enlarged.size.width + enlarged.position.x).toBeLessThanOrEqual(100)
    expect(enlarged.size.height + enlarged.position.y).toBeLessThanOrEqual(100)
    const region = key()
    expect(region.style.enterAnimation).toBe('none')
    expect(region.style.exitAnimation).toBe('none')
    for (const time of [100, 110, 1500, 1599])
      expect(
        getAnnotationMotion(
          {
            ...region,
            style: { ...region.style, enterAnimation: undefined, exitAnimation: undefined }
          },
          time
        )
      ).toEqual({ opacity: 1, scale: 1, y: 0, reveal: 1 })
  })
  it('箭头默认小号白底黑边弧形，六种外观兼容被归并的旧标识', () => {
    expect(DEFAULT_FIGURE_DATA).toMatchObject({ color: '#ffffff', arrowStyle: 'cartoon' })
    expect(DEFAULT_FIGURE_SIZE.width).toBeLessThan(20)
    expect(Object.keys(ARROW_STYLES)).toHaveLength(6)
    expect(normalizeArrowStyle('glass')).toBe('solid')
    expect(normalizeArrowStyle('neon')).toBe('line')
    expect(normalizeArrowStyle('chevron')).toBe('double')
    for (const style of Object.keys(ARROW_STYLES)) {
      const svg = buildArrowSvg({
        ...DEFAULT_FIGURE_DATA,
        arrowStyle: style as typeof DEFAULT_FIGURE_DATA.arrowStyle
      })
      expect(svg).toContain('#17202c')
      expect(svg).toContain('#ffffff')
    }
  })
  it('只退役新增四种指针，其他系统与自定义指针选择保留', () => {
    for (const style of ['sapphire', 'jelly', 'pearl', 'origami'])
      expect(normalizeCursorStyle(style)).toBe('tahoe')
    for (const style of ['windows11', 'macos', 'tahoe-inverted', 'dot', 'figma', 'my-cursor'])
      expect(normalizeCursorStyle(style)).toBe(style)
  })
})
