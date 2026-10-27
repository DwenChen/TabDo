import { RecordNewButton } from './RecordNewButton'
import { FolderRow } from './FolderRow'
import { Cloud, File, GearSix, House, Plus, UserCircle } from '@presentation/components/ui/icons'

import { Button } from '@presentation/components/ui/button'

import type { DashboardProps } from './types'

import type { DashboardModel } from './useDashboardModel'
import { FOLDER_COLORS } from './useProjectFolders'

/**
 * 显示项目、原始录制、文件夹与主页设置导航。
 * @param props 项目分类状态及操作。
 * @returns 项目主页侧栏。
 */
export function DashboardSidebar({
  busy,
  run,
  folders,
  save,
  section,
  setSection,
  metadata,
  update,
  navClass,
  onSignIn,
  accountLabel
}: Pick<
  DashboardProps & DashboardModel,
  | 'busy'
  | 'run'
  | 'folders'
  | 'save'
  | 'section'
  | 'setSection'
  | 'metadata'
  | 'update'
  | 'navClass'
  | 'onSignIn'
  | 'accountLabel'
>) {
  return (
    <>
      <aside
        aria-label="项目导航"
        className="flex w-48 shrink-0 flex-col bg-transparent px-4 pb-5 pt-12 lg:w-56"
      >
        <div className="mb-4 flex h-10 items-center gap-2.5 px-3">
          <img
            src={`${import.meta.env.BASE_URL}icons/presentation-editor.png`}
            alt=""
            className="size-7 rounded-lg"
          />
          <span className="text-[15px] font-semibold tracking-tight">演示编辑器</span>
        </div>
        <RecordNewButton busy={busy} run={run} className="mb-5 w-full" />
        <nav className="space-y-1">
          <Button
            variant="ghost"
            className={navClass(section === 'projects')}
            aria-current={section === 'projects' ? 'page' : undefined}
            onClick={() => setSection('projects')}
          >
            <House weight="fill" className="size-[18px]" />
            项目
          </Button>

          <Button
            variant="ghost"
            className={navClass(section === 'raw')}
            aria-current={section === 'raw' ? 'page' : undefined}
            onClick={() => setSection('raw')}
          >
            <File weight={section === 'raw' ? 'fill' : 'regular'} className="size-[18px]" />
            原始录制
          </Button>
        </nav>
        <div className="mb-2 mt-9 flex items-center justify-between pl-3">
          <h2 className="text-[13px] font-semibold tracking-tight text-foreground/80">文件夹</h2>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 min-w-7"
            aria-label="新建文件夹"
            onClick={() => {
              let name = '未命名文件夹',
                index = 1
              while (folders.some((folder) => folder.name === name))
                name = `未命名文件夹 ${index++}`
              save([
                ...folders,
                {
                  id: crypto.randomUUID(),
                  name,
                  color: FOLDER_COLORS[0],
                  paths: []
                }
              ])
            }}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto space-y-1">
          {folders.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              active={section === folder.id}
              onSelect={() => setSection(folder.id)}
              onChange={(next) => save(folders.map((item) => (item.id === next.id ? next : item)))}
              onRemove={() => {
                save(folders.filter((item) => item.id !== folder.id))
                if (section === folder.id) setSection('projects')
              }}
              colors={metadata.colors}
              onColors={(colors) => update({ ...metadata, colors })}
            />
          ))}
        </div>
        <div className="space-y-1 pt-6">
          <Button
            variant="ghost"
            className={navClass(section === 'settings')}
            aria-current={section === 'settings' ? 'page' : undefined}
            onClick={() => setSection('settings')}
          >
            <GearSix weight={section === 'settings' ? 'fill' : 'regular'} className="size-[18px]" />
            设置
          </Button>
        </div>
      </aside>
    </>
  )
}
