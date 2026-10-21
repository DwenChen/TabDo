import fs from 'fs'
import path from 'path'
import { getTabDoRoot, type AppDataPathOptions } from './appDataPaths'

export const TABDO_DATA_VERSION = '3.0.0'

export interface TabDoDataVersion {
  version: string
  initializedAt: string
  importedFromLegacy: boolean
}

export function getVersionFilePath(options: AppDataPathOptions = {}): string {
  return path.join(getTabDoRoot(options), 'version.json')
}

export function readDataVersion(options: AppDataPathOptions = {}): TabDoDataVersion | null {
  try {
    const filePath = getVersionFilePath(options)
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as TabDoDataVersion
  } catch {
    return null
  }
}

export function writeDataVersion(
  input: Partial<TabDoDataVersion> = {},
  options: AppDataPathOptions = {}
): TabDoDataVersion {
  const version: TabDoDataVersion = {
    version: input.version || TABDO_DATA_VERSION,
    initializedAt: input.initializedAt || new Date().toISOString(),
    importedFromLegacy: Boolean(input.importedFromLegacy)
  }
  const filePath = getVersionFilePath(options)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(version, null, 2))
  return version
}
