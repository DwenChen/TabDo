import { Modal } from '@heroui/react'
import { Button } from '@presentation/components/ui/button'
import type { DashboardModel } from './useDashboardModel'

/**
 * 展示与具体项目关联的素材问题和删除影响，所有管理入口保持可用。
 * @param props 当前关联提示与库操作。
 * @returns 局部项目提示及原始素材删除确认。
 */
export function LibraryNotices({ pendingDeletion, setPendingDeletion, performDelete, problem, setProblem, deleteEntries, busy }: Pick<DashboardModel,
  'pendingDeletion' | 'setPendingDeletion' | 'performDelete' | 'problem' | 'setProblem' | 'deleteEntries' | 'busy'>) {
  return <>
    <Modal isOpen={Boolean(pendingDeletion)} onOpenChange={(open) => { if (!open) setPendingDeletion(null) }}>
      <Modal.Backdrop><Modal.Container size="md"><Modal.Dialog aria-label="删除录制的关联提示" className="space-y-4 p-5">
        <h3 className="text-base font-medium">这些录制仍被项目使用</h3>
        <p className="text-sm text-muted-foreground">删除后，下列项目的编辑记录仍会保留，但将无法播放或导出相关素材。需要恢复时，请从系统回收站还原录制文件包，再将素材放回项目引用的原路径。</p>
        <ul className="max-h-36 overflow-auto space-y-1 text-sm">{pendingDeletion?.projects.map((name, index) => <li key={index}>{name}</li>)}</ul>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPendingDeletion(null)}>保留素材</Button>
          <Button variant="destructive" disabled={busy} onClick={() => {
            const paths = pendingDeletion?.paths
            setPendingDeletion(null)
            if (paths) void performDelete(paths)
          }}>仍然删除素材</Button>
        </div>
      </Modal.Dialog></Modal.Container></Modal.Backdrop>
    </Modal>
    <Modal isOpen={Boolean(problem)} onOpenChange={(open) => { if (!open) setProblem(null) }}>
      <Modal.Backdrop><Modal.Container size="md"><Modal.Dialog aria-label="项目素材提示" className="space-y-4 p-5">
        <h3 className="text-base font-medium">{problem?.entry.name}：素材无法使用</h3>
        <p className="text-sm text-muted-foreground">{problem?.message}</p>
        {problem?.entry.missingMediaPaths?.length ? <details className="text-xs text-muted-foreground"><summary>查看缺失素材</summary><ul className="max-h-36 overflow-auto break-all">{problem.entry.missingMediaPaths.map((file) => <li key={file}>{file}</li>)}</ul></details> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => { if (problem) void window.electronAPI.revealInFolder(problem.entry.path) }}>打开项目所在文件夹</Button>
          <Button variant="destructive-soft" disabled={busy} onClick={() => { const entry = problem?.entry; setProblem(null); if (entry) deleteEntries([entry.path]) }}>删除项目</Button>
          <Button variant="secondary" onClick={() => setProblem(null)}>关闭</Button>
        </div>
      </Modal.Dialog></Modal.Container></Modal.Backdrop>
    </Modal>
  </>
}
