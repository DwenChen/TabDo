import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import {
  getProcessedVersion,
  isDevBuild,
  getDownloadUrl,
  generateDownloadLinksMarkdown
} from './version-utils.mjs'
import {
  readUpdateMetadata,
  validateReferencedAsset,
  withReleaseNotes,
  writeUpdateMetadata
} from './update-metadata.mjs'

// 读取 changelog.md
let changelog = readFileSync('changelog.md', 'utf-8')

// 获取处理后的版本号
const version = getProcessedVersion()
const isDev = isDevBuild()
const downloadUrl = getDownloadUrl(isDev, version)

console.log(`📦 生成更新信息...`)
console.log(`版本号: ${version}`)
console.log(`构建类型: ${isDev ? 'dev' : 'release'}`)
console.log(`下载地址: ${downloadUrl}`)

// 生成下载链接并追加到 changelog
const downloadLinks = generateDownloadLinksMarkdown(downloadUrl, version)
const updatedChangelog = changelog + downloadLinks

// 发布仅包含 Windows 产物，保留 electron-builder 生成的标准更新清单。
const windowsMetadataPath = process.env.WINDOWS_UPDATE_METADATA || 'dist/latest.yml'
const metadataOutputDir =
  process.env.UPDATE_METADATA_OUTPUT_DIR || path.dirname(windowsMetadataPath)
const requireUpdateMetadata = process.env.REQUIRE_UPDATE_METADATA === 'true'

if (existsSync(windowsMetadataPath)) {
  const windowsMetadata = withReleaseNotes(readUpdateMetadata(windowsMetadataPath), changelog)
  if (windowsMetadata.version !== version) throw new Error('Windows 更新元数据版本与发布版本不一致')
  for (const file of windowsMetadata.files || []) validateReferencedAsset(windowsMetadataPath, file)
  const windowsOutputPath = path.join(metadataOutputDir, 'latest.yml')
  writeUpdateMetadata(windowsOutputPath, windowsMetadata)
  console.log(`✅ 已生成 ${windowsOutputPath}`)
} else {
  const message = `未找到 Windows 更新元数据: ${windowsMetadataPath}`
  if (requireUpdateMetadata) throw new Error(message)
  console.warn(`⚠️ ${message}`)
}

writeFileSync('changelog.md', updatedChangelog)

console.log(`✅ 标准更新元数据已保留 files 中 electron-builder 生成的 SHA-512`)
console.log(`✅ 已更新 changelog.md（添加下载链接）`)
