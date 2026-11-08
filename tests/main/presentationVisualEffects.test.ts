import { describe, it, expect } from 'vitest'
import {
  buildKeyboardAnnotations,
  getKeyLegends,
  resolveDisplayAnnotations
} from '../../internal-plugins/system/presentation/src/components/video-editor/keyboardDisplay'
import { getAnnotationMotion } from '../../internal-plugins/system/presentation/src/components/video-editor/annotationMotion'
import {
  getStickerArrowLayout,
  ARROW_DIRECTIONS
} from '../../internal-plugins/system/presentation/src/components/video-editor/arrowGeometry'
import { normalizeProjectEditor } from '../../internal-plugins/system/presentation/src/components/video-editor/projectPersistence'
import { buildArrowSvg } from '../../internal-plugins/system/presentation/src/components/video-editor/arrowAppearance'

/**
 * 构造含空格及短间隔输入的真实遥测派生片段。
 * @returns 原始内容未拼接的可编辑按键片段。
 */
function keys(): ReturnType<typeof buildKeyboardAnnotations> {
  return buildKeyboardAnnotations(
    ['a', ' ', 'Ctrl + S', 'Enter'].map((keyText, index) => ({
      timeMs: 100 + index * 200,
      cx: 0.5,
      cy: 0.5,
      keyText
    })),
    3000,
    2
  )
}

describe('演示预览与视觉效果', () => {
  it('矢量材质隔离不可信项目颜色并兼容旧箭头和新增外观的保存重开', () => {
    expect(buildArrowSvg({ color: '"><script>alert(1)</script>' })).not.toContain('<script>')
    expect(buildArrowSvg({ color: '#22c55e', strokeWidth: NaN })).not.toContain('NaN')
    expect(buildArrowSvg({ color: '#000' })).toContain('fill="#000"')
    expect(buildArrowSvg({ color: '#0000' })).toContain('<g opacity="0">')
    expect(buildArrowSvg({ color: '#2563eb00' })).toContain('<g opacity="0">')
    for (const arrowStyle of [
      'line',
      'solid',
      'double',
      'dashed',
      'cartoon',
      'ribbon',
      'glass',
      'neon',
      'chevron'
    ] as const) {
      const annotation = {
        ...keys()[0],
        type: 'figure',
        figureData: { arrowStyle, arrowDirection: 'up-left', color: '#22c55e', strokeWidth: 5 }
      }
      const reopened = normalizeProjectEditor(
        JSON.parse(JSON.stringify({ annotationRegions: [annotation] }))
      )
      expect(reopened.annotationRegions[0].figureData).toMatchObject(annotation.figureData)
      expect(buildArrowSvg(reopened.annotationRegions[0].figureData)).toContain('#22c55e')
    }
  })
  it('物理输入原样保存，旧空格和功能键有键盘图例，精确边界不重叠', () => {
    const regions = keys()
    expect(regions.map((a) => a.content)).toEqual(['a', ' ', 'Ctrl + S', 'Enter'])
    expect(getKeyLegends(' \u001fSpace\u001fEnter\u001fCtrl + S\u001fArrowLeft')).toEqual([
      '␣',
      '␣',
      '↵',
      'Ctrl',
      'S',
      '←'
    ])
    const display = resolveDisplayAnnotations(regions, 300)
    expect(display).toHaveLength(1)
    expect(getKeyLegends(display[0].content)).toEqual(['A', '␣'])
    expect(resolveDisplayAnnotations(regions, regions.at(-1)!.endMs)).toEqual([])
  })

  it('用户控制输入连接与阈值，原始片段及跨轨图层不被覆盖', () => {
    const regions = keys()
    const original = structuredClone(regions)
    expect(getKeyLegends(resolveDisplayAnnotations(regions, 550)[0].content)).toEqual([
      'A',
      '␣',
      'Ctrl',
      'S'
    ])
    expect(
      getKeyLegends(
        resolveDisplayAnnotations(
          regions.map((a) => ({ ...a, style: { ...a.style, inputGapMs: 100 } })),
          550
        )[0].content
      )
    ).toEqual(['Ctrl', 'S'])
    expect(
      getKeyLegends(
        resolveDisplayAnnotations(
          regions.map((a) => ({ ...a, style: { ...a.style, connectInputs: false } })),
          550
        )[0].content
      )
    ).toEqual(['Ctrl', 'S'])
    expect(
      resolveDisplayAnnotations(
        [...regions, { ...regions[2], id: 'independent', trackIndex: 4 }],
        550
      )
    ).toHaveLength(2)
    expect(regions).toEqual(original)
  })

  it('所有注释动画可重复定位，短片段进出场不相互覆盖，旧项目默认无动画', () => {
    const base = { ...keys()[0], startMs: 100, endMs: 300, type: 'text' as const }
    expect(getAnnotationMotion(base, 100)).toEqual({ opacity: 1, scale: 1, y: 0, reveal: 1 })
    for (const effect of ['fade', 'pop', 'slide', 'wipe'] as const) {
      const region = {
        ...base,
        style: {
          ...base.style,
          enterAnimation: effect,
          exitAnimation: effect,
          animationDurationMs: 1000
        }
      }
      expect(getAnnotationMotion(region, 200)).toEqual({ opacity: 1, scale: 1, y: 0, reveal: 1 })
      const start = getAnnotationMotion(region, 100),
        end = getAnnotationMotion(region, 300)
      expect(effect === 'wipe' ? start.reveal : start.opacity).toBe(0)
      expect(effect === 'wipe' ? end.reveal : end.opacity).toBe(0)
      expect(getAnnotationMotion(region, 150)).toEqual(getAnnotationMotion(region, 150))
    }
  })

  it('旧项目的累积字符连接时不重复，关闭连接继续保留原来整段文本', () => {
    const legacy = keys()
      .slice(0, 3)
      .map((a, i) => ({ ...a, keystrokeVersion: undefined, content: ['h', 'hi', 'hi!'][i] }))
    expect(getKeyLegends(resolveDisplayAnnotations(legacy, 550)[0].content)).toEqual([
      'H',
      'I',
      '!'
    ])
    expect(legacy.map((a) => a.content)).toEqual(['h', 'hi', 'hi!'])
    expect(
      getKeyLegends(
        resolveDisplayAnnotations(
          legacy.map((a) => ({ ...a, style: { ...a.style, connectInputs: false } })),
          550
        )[0].content
      )
    ).toEqual(['H', 'I', '!'])
  })

  it('保存重开保留形状、笔画、动画、键帽尺寸、输入间隔及变焦阈值', () => {
    const regions = keys().map((a) => ({
      ...a,
      style: {
        ...a.style,
        maskShape: 'brush' as const,
        maskStrokes: [
          [
            { x: 10, y: 20 },
            { x: 90, y: 80 }
          ]
        ],
        maskBrushSize: 24,
        keycapScale: 1.3,
        inputGapMs: 450,
        enterAnimation: 'slide' as const,
        exitAnimation: 'wipe' as const,
        animationDurationMs: 320
      }
    }))
    const reopened = normalizeProjectEditor(
      JSON.parse(JSON.stringify({ annotationRegions: regions, connectedZoomGapMs: 1700 }))
    )
    expect(reopened.annotationRegions[0].style).toMatchObject(regions[0].style)
    expect(reopened.annotationRegions[0].keystrokeVersion).toBe(1)
    expect(reopened.connectedZoomGapMs).toBe(1700)
    for (const direction of Object.keys(ARROW_DIRECTIONS) as Array<keyof typeof ARROW_DIRECTIONS>) {
      const layout = getStickerArrowLayout(direction, 180, 60)
      expect(
        layout.width * Math.abs(Math.cos(layout.angle)) +
          layout.height * Math.abs(Math.sin(layout.angle))
      ).toBeLessThanOrEqual(180)
      expect(
        layout.width * Math.abs(Math.sin(layout.angle)) +
          layout.height * Math.abs(Math.cos(layout.angle))
      ).toBeLessThanOrEqual(60)
    }
  })
})
