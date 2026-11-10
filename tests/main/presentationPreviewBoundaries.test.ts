import { describe, expect, it } from 'vitest'
import { resolvePreviewFrameSample } from '../../internal-plugins/system/presentation/src/components/video-editor/videoPlayback/previewSample'
import {
  resolveDisplayAnnotations,
  DEFAULT_KEYBOARD_STYLE
} from '../../internal-plugins/system/presentation/src/components/video-editor/keyboardDisplay'
import {
  DEFAULT_ANNOTATION_STYLE,
  type AnnotationRegion
} from '../../internal-plugins/system/presentation/src/components/video-editor/types'

const clips = [
  { id: 'first', startMs: 0, endMs: 2000, sourceStartMs: 1000, speed: 1 },
  { id: 'last', startMs: 2000, endMs: 4000, sourceStartMs: 6000, speed: 2 }
]

/**
 * 创建具有真实样式及时间边界的注释，验证共享预览与导出解析。
 * @param id 片段身份。
 * @param startMs 起点，单位毫秒。
 * @param endMs 终点，单位毫秒。
 * @param type 注释或按键类型。
 * @returns 独立可显示的注释片段。
 */
function note(
  id: string,
  startMs: number,
  endMs: number,
  type: AnnotationRegion['type'] = 'text'
): AnnotationRegion {
  return {
    id,
    startMs,
    endMs,
    type,
    content: 'Space',
    position: { x: 0, y: 0 },
    size: { width: 50, height: 20 },
    zIndex: 1,
    style: type === 'keystroke' ? DEFAULT_KEYBOARD_STYLE : DEFAULT_ANNOTATION_STYLE
  }
}

describe('presentation preview and export boundaries', () => {
  it('全片终点共用末片内部时间，注释和按键与最后导出帧一致，短片段不复活', () => {
    const annotations = [
      note('tail', 3000, 4000),
      note('short', 3000, 3900),
      note('keys', 3000, 4000, 'keystroke')
    ]
    const sample = resolvePreviewFrameSample(10, 4, clips)
    expect(sample.timelineTime).toBeCloseTo(3.999999, 8)
    expect(sample.sourceTime).toBeCloseTo(9.999998, 8)
    /**
     * 取得指定时间真正参与合成的片段身份。
     * @param timeMs 时间轴取样，单位毫秒。
     * @returns 稳定排序的片段身份。
     */
    const visible = (timeMs: number): string[] =>
      resolveDisplayAnnotations(annotations, timeMs)
        .map((a) => a.id)
        .sort()
    expect(visible(sample.timelineTime * 1000)).toEqual(['keys', 'tail'])
    expect(visible(sample.timelineTime * 1000)).toEqual(visible(4000 - 1000 / 60))
    expect(visible(4000)).toEqual([])
  })

  it('保留亚毫秒时间，避免在结束前半毫秒被预览取整隐藏', () => {
    const annotation = note('tail', 0, 4000)
    const sample = resolvePreviewFrameSample(9.9992, 3.9996, clips)
    expect(sample).toEqual({ sourceTime: 9.9992, timelineTime: 3.9996 })
    expect(resolveDisplayAnnotations([annotation], sample.timelineTime * 1000)).toEqual([
      annotation
    ])
  })

  it('内部切口左闭右开、间隙和越界时间不移入旧片段', () => {
    const annotations = [note('before', 0, 2000), note('after', 2000, 4000)]
    const sample = resolvePreviewFrameSample(6, 2, clips)
    expect(sample).toEqual({ sourceTime: 6, timelineTime: 2 })
    expect(
      resolveDisplayAnnotations(annotations, sample.timelineTime * 1000).map((a) => a.id)
    ).toEqual(['after'])
    expect(resolvePreviewFrameSample(0, 1, [{ ...clips[1], startMs: 2000 }])).toEqual({
      sourceTime: 0,
      timelineTime: 1
    })
    expect(resolvePreviewFrameSample(11, 4.1, clips)).toEqual({ sourceTime: 11, timelineTime: 4.1 })
    expect(resolvePreviewFrameSample(0, 0, [])).toEqual({ sourceTime: 0, timelineTime: 0 })
  })

  it('无序片段按真正最晚端点取样，极短片段仍留在自身范围且不改写项目', () => {
    const short = [{ id: 'tiny', startMs: 1, endMs: 1.001, speed: 1 }]
    const snapshot = JSON.stringify(short)
    const sample = resolvePreviewFrameSample(0.001001, 0.001001, short)
    expect(sample.timelineTime * 1000).toBeGreaterThan(1)
    expect(sample.timelineTime * 1000).toBeLessThan(1.001)
    expect(JSON.stringify(short)).toBe(snapshot)
    expect(resolvePreviewFrameSample(10, 4, [...clips].reverse())).toEqual(
      resolvePreviewFrameSample(10, 4, clips)
    )
  })
})
