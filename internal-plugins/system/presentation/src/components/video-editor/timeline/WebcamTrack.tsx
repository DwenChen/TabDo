import type { MediaSegment } from '../types'
import type { ReactElement } from 'react'
import Item from './Item'
import Row from './Row'

export const WEBCAM_ROW_ID = 'webcam-row'

/**
 * 自动展示当前项目摄像头素材，使用统一片段选择、拖动和菜单。
 * @param props 摄像头路径、独立区间和选择回调。
 * @returns 带固定名称和素材缩略图的摄像头轨道。
 */
export function WebcamTrack({
  path,
  segments,
  selectedId,
  onSelect
}: {
  path: string
  segments: MediaSegment[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}): ReactElement {
  return (
    <div data-testid="webcam-track" style={{ display: 'contents' }}>
      <Row id={WEBCAM_ROW_ID} label="摄像头" filmstrip isEmpty={segments.length === 0}>
        {segments.map((segment) => (
          <Item
            key={segment.id}
            id={segment.id}
            rowId={WEBCAM_ROW_ID}
            span={{ start: segment.startMs, end: segment.endMs }}
            sourceSpan={{
              start: segment.sourceStartMs,
              end: segment.sourceStartMs + segment.endMs - segment.startMs
            }}
            variant="webcam"
            videoPath={path}
            isSelected={segment.id === selectedId}
            onSelectId={onSelect}
          >
            摄像头
          </Item>
        ))}
      </Row>
    </div>
  )
}
