import { pathToFileURL } from 'node:url'
import path from 'node:path'
import databaseAPI from '../api'
import { getCommandId } from '../../shared/commandShared'

/**
 * 为新资料空间登记禁用设置指令与五个默认面板固定项，已有用户选择保持原样。
 * @param plugins 当前内置插件清单及物理路径。
 * @returns 无返回值。
 */
export function initializeLocalEditionDefaults(plugins: any[]): void {
  // 仅在对应存储键缺失时初始化，空列表代表用户已经主动清空。
  if (databaseAPI.dbGet('disable-commands') == null) {
    const setting = plugins.find((plugin) => plugin.name === 'setting')
    const disabled = (setting?.features || []).flatMap((feature: any) =>
      (feature.cmds || []).map((command: any) =>
        getCommandId({
          type: 'plugin',
          pluginName: 'setting',
          featureCode: feature.code,
          name: typeof command === 'string' ? command : command.label,
          cmdType: typeof command === 'string' ? 'text' : command.type
        })
      )
    )
    databaseAPI.dbPut('disable-commands', disabled)
  }
  if (databaseAPI.dbGet('super-panel-pinned') == null) {
    const tools = plugins.find((plugin) => plugin.name === 'system')
    if (!tools) return
    const codes = ['screenshot', 'clipboard', 'sticky-note', 'local-search', 'screen-recorder']
    databaseAPI.dbPut(
      'super-panel-pinned',
      codes.flatMap((code) => {
        const feature = tools.features.find((item: any) => item.code === code)
        const name = feature?.cmds.find((command: any) => typeof command === 'string')
        return name
          ? [
              {
                name,
                path: tools.path,
                type: 'plugin',
                featureCode: code,
                pluginName: 'system',
                pluginTitle: '工具',
                icon: pathToFileURL(path.join(tools.path, feature.icon)).href,
                cmdType: 'text'
              }
            ]
          : []
      })
    )
  }
}
