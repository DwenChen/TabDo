import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { UsageGuideFiles } from '../../src/main/core/usageGuideFiles'
import { GUIDE_PRACTICE_CODES, isGuideLaunchAllowed } from '../../src/shared/usageGuide'
import { GUIDE_STEPS } from '../../src/shared/usageGuideSteps'

describe('usage guide ownership and lifecycle files', () => {
  it('cleans only retired practice files, preserves reusable samples and formal data, and rebuilds after removal', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tabdo-guide-files-'))
    try {
      const source = path.join(root, 'bundled'),
        formal = path.join(root, 'formal')
      fs.mkdirSync(source)
      fs.mkdirSync(formal)
      fs.writeFileSync(path.join(source, 'sample.txt'), 'original')
      fs.writeFileSync(path.join(formal, 'existing-plugin.json'), 'user data')
      const files = new UsageGuideFiles(formal)
      files.prepare(source)
      const first = files.createRun()
      fs.writeFileSync(path.join(first.directory, 'samples/sample.txt'), 'edited')
      fs.writeFileSync(path.join(first.directory, 'output/result.txt'), 'practice')
      expect(() => files.removeRun(first.directory, 'wrong')).toThrow()
      expect(() => files.removeRun(formal, first.token)).toThrow()
      files.removeRun(first.directory, first.token)
      expect(fs.existsSync(first.directory)).toBe(false)
      expect(fs.readFileSync(path.join(files.environment, 'sample.txt'), 'utf8')).toBe('original')
      const second = files.createRun()
      expect(fs.readFileSync(path.join(second.directory, 'samples/sample.txt'), 'utf8')).toBe(
        'original'
      )
      files.recordProcess(second.directory, second.token, process.pid)
      expect(files.recover()).toBe(1)
      expect(fs.existsSync(second.directory)).toBe(true)
      files.recordProcess(second.directory, second.token, 2147483647)
      expect(files.recover()).toBe(0)
      files.removeEnvironment()
      expect(fs.existsSync(files.environment)).toBe(false)
      expect(fs.readFileSync(path.join(formal, 'existing-plugin.json'), 'utf8')).toBe('user data')
      files.prepare(source)
      expect(fs.existsSync(path.join(files.environment, 'sample.txt'))).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('refuses linked runtime directories without deleting their targets', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tabdo-guide-links-'))
    try {
      const files = new UsageGuideFiles(path.join(root, 'formal'))
      const outside = path.join(root, 'outside')
      fs.mkdirSync(files.root, { recursive: true })
      fs.mkdirSync(outside)
      fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep')
      fs.symlinkSync(outside, files.runs, process.platform === 'win32' ? 'junction' : 'dir')
      expect(() => files.recover()).toThrow('链接')
      expect(() => files.createRun()).toThrow('链接')
      expect(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8')).toBe('keep')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('owns only its generated desktop folder and keeps unrelated desktop files during cleanup and recovery', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tabdo-guide-desktop-'))
    try {
      const desktop = path.join(root, 'Desktop'),
        bundled = path.join(root, 'bundled')
      fs.mkdirSync(desktop)
      fs.mkdirSync(bundled)
      fs.writeFileSync(path.join(desktop, '用户文件.txt'), 'keep')
      fs.writeFileSync(path.join(bundled, 'sample.txt'), 'original')
      const files = new UsageGuideFiles(path.join(root, 'formal'))
      files.prepare(bundled)
      const run = files.createRun(),
        workspace = files.createDesktopWorkspace(run.directory, run.token, desktop)
      expect(path.dirname(workspace)).toBe(desktop)
      fs.writeFileSync(path.join(workspace, '练习输出/result.txt'), 'output')
      fs.writeFileSync(
        path.join(workspace, '.tabdo-guide-owner.json'),
        JSON.stringify({ token: 'other' })
      )
      expect(() => files.removeRun(run.directory, run.token)).toThrow('身份')
      expect(fs.existsSync(workspace)).toBe(true)
      fs.writeFileSync(
        path.join(workspace, '.tabdo-guide-owner.json'),
        JSON.stringify({ token: run.token })
      )
      expect(files.recover()).toBe(0)
      expect(fs.existsSync(workspace)).toBe(false)
      expect(fs.readFileSync(path.join(desktop, '用户文件.txt'), 'utf8')).toBe('keep')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('teaches actual tools and necessary settings without system command lessons', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve('internal-plugins/system/public/plugin.json'), 'utf8')
    )
    const codes = GUIDE_STEPS.flatMap((step) => (step.tool ? [step.tool] : []))
    expect(new Set(GUIDE_STEPS.map((step) => step.id)).size).toBe(GUIDE_STEPS.length)
    for (const code of codes) {
      expect(manifest.features.some((feature: any) => feature.code === code)).toBe(true)
      expect(GUIDE_PRACTICE_CODES).toContain(code)
    }
    for (const code of [
      'shutdown',
      'reboot',
      'logoff',
      'sleep',
      'lock-screen',
      'open-terminal',
      'open-url'
    ])
      expect(isGuideLaunchAllowed('system', code)).toBe(false)
    expect(isGuideLaunchAllowed('vendor', 'clipboard')).toBe(false)
    expect(isGuideLaunchAllowed('setting', 'main')).toBe(false)
    expect(isGuideLaunchAllowed('setting', 'ui.router?router=About&guide=1')).toBe(true)
    expect(isGuideLaunchAllowed('setting', 'ui.router?router=GeneralSetting')).toBe(true)
    expect(isGuideLaunchAllowed('setting', 'ui.router?router=Providers&tab=ocr')).toBe(true)
    expect(isGuideLaunchAllowed('setting', 'ui.router?router=Data')).toBe(false)
  })
})
