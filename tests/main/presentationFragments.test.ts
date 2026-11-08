import { describe, expect, it } from 'vitest'
import {
  normalizeAnnotationRotation,
  resizeAnnotationBox
} from '../../internal-plugins/system/presentation/src/components/video-editor/annotationGeometry'
import {
  findPasteTime,
  findPasteTrack,
  insertCopiedClip,
  insertTimelineGap
} from '../../internal-plugins/system/presentation/src/components/video-editor/timeline/timelineClipboard'
import { normalizeProjectEditor } from '../../internal-plugins/system/presentation/src/components/video-editor/projectPersistence'
import {
  createEditorHistoryStack,
  recordEditorHistorySnapshot,
  undoEditorHistoryStack,
  redoEditorHistoryStack
} from '../../internal-plugins/system/presentation/src/components/video-editor/editorHistory'
import { DEFAULT_ANNOTATION_STYLE } from '../../internal-plugins/system/presentation/src/components/video-editor/types'

describe('演示片段旋转与剪贴板', () => {
  it('视频内部粘贴保留后半段注释，跨插入点的效果拆段且不覆盖新视频', () => {
    const regions = [
      { id: 'before', startMs: 0, endMs: 500, rotation: 45 },
      { id: 'cross', startMs: 500, endMs: 1500, rotation: 90 },
      { id: 'after', startMs: 2000, endMs: 2500, rotation: 180 }
    ]
    expect(insertTimelineGap(regions, 1000, 6000, () => 'right')).toEqual([
      regions[0],
      { ...regions[1], endMs: 1000 },
      { ...regions[1], id: 'right', startMs: 7000, endMs: 7500 },
      { ...regions[2], startMs: 8000, endMs: 8500 }
    ])
    expect(regions[2].startMs).toBe(2000)
  })
  it('旋转后缩放保持对角点，沿局部坐标改变宽高', () => {
    const box = { x: 10, y: 20, width: 100, height: 50, rotation: 90 }
    const next = resizeAnnotationBox(box, -20, 40, [1, 1])
    expect(next).toEqual({ ...box, x: -20, y: 30, width: 140, height: 70 })
    expect(resizeAnnotationBox(box, 1000, -1000, [1, 1]).width).toBe(8)
    expect(normalizeAnnotationRotation(-45)).toBe(315)
    expect(normalizeAnnotationRotation(765)).toBe(45)
    expect(normalizeAnnotationRotation(NaN)).toBe(0)
  })

  it('单轨完整空隙与多轨重叠分配均不覆盖已有片段', () => {
    const regions = [
      { startMs: 0, endMs: 1000 },
      { startMs: 1600, endMs: 2200 }
    ]
    expect(findPasteTime(regions, 200, 500, 3000)).toBe(1000)
    expect(findPasteTime(regions, 200, 800, 3000)).toBe(2200)
    expect(findPasteTime(regions, 200, 801, 3000)).toBeNull()
    expect(findPasteTrack([...regions, { startMs: 0, endMs: 500, trackIndex: 1 }], 200, 500)).toBe(
      2
    )
    expect(findPasteTrack(regions, 1000, 1600)).toBe(0)
  })

  it('游标处粘贴视频保持加速素材的偏移，序列连续且原件不变', () => {
    const original = [{ id: 'video', startMs: 0, endMs: 2000, speed: 2, sourceStartMs: 500 }]
    const copied = { ...original[0], id: 'copy', startMs: 1000, endMs: 1500, sourceStartMs: 100 }
    const next = insertCopiedClip(original, copied, 600, () => 'right')
    expect(next.split).toEqual({ originalId: 'video', rightId: 'right' })
    expect(
      next.clips.map((clip) => [clip.id, clip.startMs, clip.endMs, clip.sourceStartMs])
    ).toEqual([
      ['video', 0, 600, 500],
      ['copy', 600, 1100, 100],
      ['right', 1100, 2500, 1700]
    ])
    expect(original[0].endMs).toBe(2000)
    expect(insertCopiedClip(original, copied, 0, () => 'unused').clips[0].id).toBe('copy')
    expect(insertCopiedClip(original, copied, 5000, () => 'unused').clips.at(-1)?.id).toBe('copy')
  })

  it('旋转、移动、副本与删除完整进入保存及连续撤销重做，复制和选区不消费历史', () => {
    const annotation = {
      id: 'annotation-1',
      startMs: 0,
      endMs: 500,
      type: 'figure' as const,
      content: '',
      position: { x: 10, y: 20 },
      size: { width: 30, height: 10 },
      style: DEFAULT_ANNOTATION_STYLE,
      zIndex: 1,
      figureData: { arrowDirection: 'up-left' as const, color: '#ff0000', strokeWidth: 4 }
    }
    const base = normalizeProjectEditor({ annotationRegions: [annotation] })
    expect(base.annotationRegions[0].rotation).toBe(0)
    const rotate = normalizeProjectEditor({
      ...base,
      annotationRegions: [{ ...annotation, rotation: 405 }]
    })
    expect(rotate.annotationRegions[0].rotation).toBe(45)
    expect(rotate.annotationRegions[0].figureData?.arrowDirection).toBe('up-left')
    const moved = {
      ...rotate,
      annotationRegions: [{ ...rotate.annotationRegions[0], startMs: 1000, endMs: 1500 }]
    }
    const copy = {
      ...moved,
      annotationRegions: [
        ...moved.annotationRegions,
        { ...moved.annotationRegions[0], id: 'copy', trackIndex: 1 }
      ]
    }
    const removed = { ...copy, annotationRegions: [copy.annotationRegions[1]] }
    const models = [base, rotate, moved, copy, removed]
    const snapshots = models.map((editor) => ({
      editor,
      zoomRegions: [],
      clipRegions: [],
      speedRegions: [],
      annotationRegions: editor.annotationRegions,
      audioRegions: [],
      autoCaptions: [],
      selectedZoomId: null,
      selectedClipId: null,
      selectedAnnotationId: null,
      selectedAudioId: null
    }))
    const stack = createEditorHistoryStack()
    for (const snapshot of snapshots) recordEditorHistorySnapshot(stack, snapshot)
    expect(stack.past).toHaveLength(4)
    for (let index = 3; index >= 0; index--)
      expect(undoEditorHistoryStack(stack, snapshots[4])?.editor).toEqual(models[index])
    recordEditorHistorySnapshot(stack, { ...snapshots[0], selectedAnnotationId: 'annotation-1' })
    expect(stack.future).toHaveLength(4)
    for (let index = 1; index <= 4; index++)
      expect(redoEditorHistoryStack(stack, snapshots[0])?.editor).toEqual(models[index])
  })
})
