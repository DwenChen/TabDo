import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readBuiltinShortcuts } from '../../src/shared/shortcutSettings'
const state = vi.hoisted(() => new Map<string, any>())
vi.mock('../../src/main/api/index', () => ({
  default: {
    dbGet: (key: string) => state.get(key),
    dbPut: (key: string, value: any) => state.set(key, value)
  }
}))
import { initializeLocalEditionDefaults } from '../../src/main/core/localEditionDefaults'

const plugins = ['setting', 'system'].map((name) => {
  const directory = path.resolve('internal-plugins', name, 'public')
  return {
    ...JSON.parse(fs.readFileSync(path.join(directory, 'plugin.json'), 'utf8')),
    path: directory
  }
})
beforeEach(() => state.clear())
describe('本地版初始选择', () => {
  it('全部内置快捷键默认关闭，只接受明确启用的布尔值', () => {
    expect(Object.values(readBuiltinShortcuts(null)).every((value) => value === false)).toBe(true)
    expect(
      readBuiltinShortcuts({
        builtinAppShortcutsEnabled: { detach: true, esc: 'true', killPlugin: false }
      })
    ).toMatchObject({ detach: true, esc: false, killPlugin: false, devTools: false })
  })
  it('默认禁用设置来源的功能及匹配指令，固定五个工具且图标有实体文件', () => {
    initializeLocalEditionDefaults(plugins)
    const disabled = state.get('disable-commands') as string[]
    expect(disabled).toHaveLength(
      plugins[0].features.flatMap((feature: any) => feature.cmds).length
    )
    expect(disabled).toContain('setting:function.plugin-market-search:插件市场搜索:over')
    expect(disabled).toContain(
      'setting:function.install-plugin?router=PluginInstaller:安装插件:files'
    )
    expect(disabled).toContain('setting:ui.router?router=GeneralSetting:通用设置:text')
    const pinned = state.get('super-panel-pinned')
    expect(pinned.map((item: any) => item.name)).toEqual([
      '截图',
      '剪贴板',
      '便签',
      '文件搜索',
      '录屏'
    ])
    expect(pinned.every((item: any) => item.type === 'plugin' && item.cmdType === 'text')).toBe(
      true
    )
    for (const item of pinned) expect(fs.existsSync(new URL(item.icon))).toBe(true)
  })
  it('初始化幂等，保留用户显式清空的面板与自行启用的设置指令', () => {
    initializeLocalEditionDefaults(plugins)
    state.set('super-panel-pinned', [])
    state.set('disable-commands', ['vendor:feature:自定义:text'])
    initializeLocalEditionDefaults(plugins)
    expect(state.get('super-panel-pinned')).toEqual([])
    expect(state.get('disable-commands')).toEqual(['vendor:feature:自定义:text'])
  })
})
