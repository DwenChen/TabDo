import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
vi.mock('@tabdo/presentation-electron', () => ({ shell: { trashItem: vi.fn() } }))
import { createEditorHistoryStack, recordEditorHistorySnapshot, undoEditorHistoryStack, redoEditorHistoryStack, type EditorHistorySnapshot } from '../../internal-plugins/system/presentation/src/components/video-editor/editorHistory'
import { normalizeProjectEditor } from '../../internal-plugins/system/presentation/src/components/video-editor/projectPersistence'
import { readProjectMediaReferences } from '../../internal-plugins/system/presentation/electron/ipc/project/mediaReferences'
import { recycleProjectFiles } from '../../internal-plugins/system/presentation/electron/ipc/project/recycleProjectFiles'
import { getArrowGeometry, ARROW_DIRECTIONS } from '../../internal-plugins/system/presentation/src/components/video-editor/arrowGeometry'
import { localizePresentationMessage } from '../../internal-plugins/system/presentation/src/lib/presentationMessages'

const temporary: string[] = []
afterEach(async () => { for (const dir of temporary.splice(0)) await fs.rm(dir, { recursive: true, force: true }) })

/**
 * 构造连续编辑测试的完整快照，选区与持久状态分开。
 * @param revision 测试编辑序号。
 * @returns 一份包含摄像头、排列、声音和外观的快照。
 */
function snapshot(revision: number): EditorHistorySnapshot {
  return { editor: { trackOrder: [`track-${revision}`], cursorSize: revision + 1,
    webcam: { ...normalizeProjectEditor({}).webcam, segments: [{ id: 'cam', startMs: revision, endMs: 1000, sourceStartMs: 20 }] },
    sourceAudioTrackSettingsByClip: { clip: { system: { volume: revision / 10, normalize: false } } } },
    zoomRegions: [], clipRegions: [], speedRegions: [], annotationRegions: [],
    audioRegions: [{ id: 'audio', audioPath: 'test.wav', startMs: revision * 10, endMs: 2000, sourceStartMs: revision * 20, volume: revision / 100, fadeInMs: revision, trackIndex: revision % 2 }], autoCaptions: [],
    selectedZoomId: null, selectedClipId: null, selectedAnnotationId: null, selectedAudioId: null }
}

describe('演示编辑器审修回归', () => {
  it('连续跟踪完整编辑状态，切换选区不占历史也不破坏重做，分支编辑清空旧重做', () => {
    const stack = createEditorHistoryStack()
    for (let i = 0; i <= 30; i++) recordEditorHistorySnapshot(stack, snapshot(i))
    expect(stack.past).toHaveLength(30)
    for (let i = 29; i >= 0; i--) expect(undoEditorHistoryStack(stack, snapshot(30))?.editor).toEqual(snapshot(i).editor)
    expect(undoEditorHistoryStack(stack, snapshot(0))).toBeNull()
    recordEditorHistorySnapshot(stack, { ...snapshot(0), selectedClipId: 'some-clip' })
    expect(stack.future).toHaveLength(30)
    for (let i = 1; i <= 30; i++) expect(redoEditorHistoryStack(stack, snapshot(0))?.editor).toEqual(snapshot(i).editor)
    undoEditorHistoryStack(stack, snapshot(30))
    recordEditorHistorySnapshot(stack, snapshot(40))
    expect(redoEditorHistoryStack(stack, snapshot(40))).toBeNull()
  })

  it('历史快照独立于之后的数据修改，按最大步数保留最新编辑', () => {
    const stack = createEditorHistoryStack()
    const initial = snapshot(0)
    recordEditorHistorySnapshot(stack, initial)
    initial.editor!.trackOrder!.push('mutated')
    expect(stack.current?.editor?.trackOrder).toEqual(['track-0'])
    for (let i = 1; i <= 110; i++) recordEditorHistorySnapshot(stack, snapshot(i))
    expect(stack.past).toHaveLength(100)
    expect(stack.past[0].editor).toEqual(snapshot(10).editor)
  })

  it('缺失素材的项目仍可读取关联关系并独立回收；回收失败完整恢复项目及附属文件', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-review-')); temporary.push(dir)
    const project = path.join(dir, 'orphan.recordly'), thumb = project + '.png'
    const video = path.join(dir, 'missing.mp4'), audio = path.join(dir, 'kept.wav')
    await fs.writeFile(audio, 'audio')
    const bytes = JSON.stringify({ videoPath: video, editor: { audioRegions: [{ audioPath: audio }] } })
    await fs.writeFile(project, bytes); await fs.writeFile(thumb, 'thumbnail')
    expect(await readProjectMediaReferences(project)).toEqual({ mediaPaths: [video, audio], missingMediaPaths: [video] })
    await expect(recycleProjectFiles([project, thumb], async () => { throw Error('系统回收失败') })).rejects.toThrow('系统回收失败')
    expect(await fs.readFile(project, 'utf8')).toBe(bytes)
    expect(await fs.readFile(thumb, 'utf8')).toBe('thumbnail')
    expect(await fs.readdir(dir)).not.toContainEqual(expect.stringContaining('.tabdo-project-trash-'))
    await recycleProjectFiles([project, thumb], async (stage) => { await fs.rm(stage, { recursive: true }) })
    await expect(fs.access(project)).rejects.toThrow()
    expect(await fs.readFile(audio, 'utf8')).toBe('audio')
  })

  it('八向箭头的四种外观共享可绘制几何，旧项目保持线形并保存新外观', () => {
    for (const direction of Object.keys(ARROW_DIRECTIONS) as Array<keyof typeof ARROW_DIRECTIONS>) {
      expect(getArrowGeometry(direction).paths).toHaveLength(2)
      expect(getArrowGeometry(direction, 'double').paths).toHaveLength(3)
      expect(getArrowGeometry(direction, 'solid').filled).toBe(true)
      expect(getArrowGeometry(direction, 'dashed').dashed).toBe(true)
      expect(getArrowGeometry(direction, 'solid').paths[0]).not.toMatch(/NaN|undefined/)
    }
    const normalized = normalizeProjectEditor({ annotationRegions: [{ id: 'arrow', type: 'figure', startMs: 0, endMs: 1000, content: '', position: {x: 10,y: 10}, size: {width: 20,height: 20}, style: {} as any, zIndex: 1, figureData: { arrowDirection: 'right', color: '#ff0000', strokeWidth: 4, arrowStyle: 'solid' } }] })
    expect(normalized.annotationRegions[0].figureData?.arrowStyle).toBe('solid')
  })

  it('外部英文故障提供中文解释，保留中文、格式缩写及快捷键', () => {
    expect(localizePresentationMessage('Project video file not found: C:/recording.mp4')).toContain('素材已删除或移动')
    expect(localizePresentationMessage('ENOENT: no such file')).toContain('找不到')
    expect(localizePresentationMessage('GPU adapter initialization failed')).toMatch(/[\u3400-\u9fff]/)
    expect(localizePresentationMessage('素材正在使用，请重试')).toBe('素材正在使用，请重试')
    expect(localizePresentationMessage('MP4')).toBe('MP4')
    expect(localizePresentationMessage('Unsupported')).not.toBe('Unsupported')
    expect(localizePresentationMessage('保存失败: GPU initialization failed')).not.toMatch(/[A-Za-z]/)
    expect(localizePresentationMessage('编码器 failed')).not.toMatch(/[A-Za-z]/)
  })
})
