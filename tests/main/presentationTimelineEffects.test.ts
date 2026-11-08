import { describe, expect, it } from 'vitest'
import { packClipSequence, reorderClipSequence, rippleRegions } from '../../internal-plugins/system/presentation/src/components/video-editor/clipSequence'
import { resolveDragEnd } from '../../internal-plugins/system/presentation/src/components/video-editor/timeline/dnd/engine'
import { createEditorHistoryStack, recordEditorHistorySnapshot, undoEditorHistoryStack, type EditorHistorySnapshot } from '../../internal-plugins/system/presentation/src/components/video-editor/editorHistory'

const clips = [
  { id: 'a', startMs: 0, endMs: 1000, sourceStartMs: 0, speed: 1 },
  { id: 'b', startMs: 1000, endMs: 2000, sourceStartMs: 1000, speed: 1 },
  { id: 'c', startMs: 2000, endMs: 3000, sourceStartMs: 2000, speed: 1 }
]
const effect = { id: 'zoom', startMs: 500, endMs: 1500, scale: 1.41, camera: { mode: '3d', yaw: 20 } }

describe('录屏重排关联效果', () => {
  it('删除录屏后的派生裁剪镜像不额外占用一步撤销', () => {
    const stack = createEditorHistoryStack()
    const original: EditorHistorySnapshot = {
      editor: { trimRegions: [] }, clipRegions: clips, zoomRegions: [], annotationRegions: [], audioRegions: [], autoCaptions: [], speedRegions: [],
      selectedZoomId: null, selectedClipId: 'b', selectedAnnotationId: null, selectedAudioId: null
    }
    recordEditorHistorySnapshot(stack, original)
    const deleted = { ...original, clipRegions: packClipSequence([clips[0], clips[2]]) }
    recordEditorHistorySnapshot(stack, deleted)
    const mirrored = { ...deleted, editor: { trimRegions: [{ id: 'derived', startMs: 1000, endMs: 2000 }] } }
    expect(recordEditorHistorySnapshot(stack, mirrored)).toBe('unchanged')
    expect(undoEditorHistoryStack(stack, mirrored)?.clipRegions).toEqual(clips)
  })
  it('拖动10ms变焦不拉长，拖动超过成片的独立音频不截短', () => {
    for (const [rowId, start, end, totalMs, proposed] of [
      ['row-zoom', 100, 110, 1000, 500],
      ['row-audio-0', 0, 8000, 6000, 1000]
    ] as const) {
      const result = resolveDragEnd('item', { start: proposed, end: proposed + end - start }, rowId, {
        totalMs, minItemDurationMs: 100, allRegionSpans: [{ id: 'item', rowId, start, end }], hasOverlap: () => false
      })!
      expect(result.span.end - result.span.start).toBe(end - start)
    }
  })
  it('跨切口的效果分离后独立显示，不填充中间无关画面', () => {
    const next = reorderClipSequence(clips, 'b', 2)
    const regions = rippleRegions([effect, { ...effect, id: 'other', startMs: 2000, endMs: 2500 }], clips, next)
    expect(regions.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([[500, 1000], [2000, 2500], [1000, 1500]])
    expect(regions[0].id).toBe(effect.id)
    expect(new Set(regions.map(({ id }) => id)).size).toBe(3)
    expect(regions.slice(0, 2).every((region) => region.scale === 1.41 && region.camera.yaw === 20)).toBe(true)
    expect(effect).toMatchObject({ startMs: 500, endMs: 1500 })
  })

  it('所有录屏排列都保留真实覆盖总时长，原本不重叠的效果不产生重叠', () => {
    const originals = [effect, { ...effect, id: 'second', startMs: 1500, endMs: 2800 }]
    for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
      const next = packClipSequence(order.map((index) => clips[index]))
      const regions = rippleRegions(originals, clips, next).sort((a, b) => a.startMs - b.startMs)
      expect(regions.reduce((total, region) => total + region.endMs - region.startMs, 0)).toBe(2300)
      for (let index = 1; index < regions.length; index++) expect(regions[index].startMs).toBeGreaterThanOrEqual(regions[index - 1].endMs)
    }
  })

  it('相邻部分保持一个身份，裁剪和变速只映射保留的源时间', () => {
    expect(rippleRegions([effect], clips, clips)).toEqual([effect])
    const edited = packClipSequence([
      { ...clips[0], sourceStartMs: 250, endMs: 375, speed: 2 },
      clips[1], clips[2]
    ])
    const retained = rippleRegions([effect], clips, edited)
    expect(retained).toEqual([{ ...effect, startMs: 125, endMs: 875 }])
    expect(rippleRegions([{ ...effect, startMs: 0, endMs: 200 }], clips, edited)).toEqual([])
    expect(rippleRegions([effect], clips, [])).toEqual([])
  })

  it('回到原排列后不会将已拆效果再次扩展，注释参数也完整保留', () => {
    const note = { ...effect, type: 'image', rotation: 45, trackIndex: 2, content: 'image.png' }
    const next = reorderClipSequence(clips, 'b', 2)
    const split = rippleRegions([note], clips, next)
    const restored = rippleRegions(split, next, clips)
    expect(restored.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([[500, 1000], [1000, 1500]])
    expect(restored.every((region) => region.type === 'image' && region.rotation === 45 && region.trackIndex === 2 && region.content === 'image.png')).toBe(true)
  })
})
