import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

interface PluginFeatureCommand {
  type?: string
  match?: string
}

interface PluginFeature {
  code: string
  cmds: Array<string | PluginFeatureCommand>
}

interface PluginConfig {
  features: PluginFeature[]
}

function getOpenFolderRegex(): RegExp {
  const pluginJsonPath = path.join(
    process.cwd(),
    'internal-plugins',
    'system',
    'public',
    'plugin.json'
  )
  const pluginConfig = JSON.parse(readFileSync(pluginJsonPath, 'utf-8')) as PluginConfig
  const feature = pluginConfig.features.find((item) => item.code === 'open-folder')
  const regexCmd = feature?.cmds?.find(
    (item): item is PluginFeatureCommand => typeof item !== 'string' && item.type === 'regex'
  )
  const regexString = regexCmd?.match
  const match = typeof regexString === 'string' ? regexString.match(/^\/(.+)\/([gimuy]*)$/) : null

  if (!match) {
    throw new Error('open-folder regex command is missing or invalid')
  }

  return new RegExp(match[1], match[2])
}

describe('system plugin open-folder regex', () => {
  const regex = getOpenFolderRegex()

  it('matches Windows drive paths that use backslashes', () => {
    expect(regex.test('C:\\Users\\Test\\Desktop')).toBe(true)
    expect(regex.test('D:\\Work Projects\\TabDo')).toBe(true)
  })

  it('matches Unix-style folder paths', () => {
    expect(regex.test('~/Downloads')).toBe(true)
    expect(regex.test('/Users/test/Documents')).toBe(true)
  })

  it('does not match unsupported folder path forms', () => {
    expect(regex.test('C:/Users/Test/Desktop')).toBe(false)
    expect(regex.test('\\\\server\\share\\folder')).toBe(false)
    expect(regex.test('%USERPROFILE%\\Desktop')).toBe(false)
  })

  it('does not match Windows paths that contain invalid path characters', () => {
    expect(regex.test('C:\\Users\\bad*name')).toBe(false)
    expect(regex.test('C:\\Users\\bad?name')).toBe(false)
    expect(regex.test('C:\\Users\\bad"name')).toBe(false)
    expect(regex.test('C:\\Users\\bad<name')).toBe(false)
    expect(regex.test('C:\\Users\\bad>name')).toBe(false)
    expect(regex.test('C:\\Users\\bad|name')).toBe(false)
    expect(regex.test('C:\\Users\\bad:name')).toBe(false)
  })

  it('does not match urls', () => {
    expect(regex.test('https://example.com')).toBe(false)
  })
})
