import { app } from 'electron'
import path from 'path'

export function getAppBundlePath(...segments: string[]): string {
  return path.join(app.getAppPath(), ...segments)
}

export function getPreloadPath(fileName = 'index.js'): string {
  if (process.env.ZTOOLS_SOURCE_PREVIEW === '1' && fileName === 'index.js') {
    return getAppBundlePath('scripts', 'preview-preload.cjs')
  }
  return getAppBundlePath('out', 'preload', fileName)
}

export function getRendererPath(fileName: string): string {
  return getAppBundlePath('out', 'renderer', fileName)
}
