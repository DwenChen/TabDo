import { execSync } from 'child_process'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { readFileSync } from 'fs'

// 获取Git commit hash
export function getGitCommitHash(short = true) {
  try {
    const command = short ? 'git rev-parse --short HEAD' : 'git rev-parse HEAD'
    return execSync(command, { encoding: 'utf-8' }).trim()
  } catch (error) {
    console.warn('Failed to get git commit hash:', error.message)
    return 'unknown'
  }
}

// 获取当前月份日期
export function getCurrentMonthDate() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${month}${day}`
}

// 从package.json读取基础版本号
export function getBaseVersion() {
  try {
    const pkg = readFileSync('package.json', 'utf-8')
    const { version } = JSON.parse(pkg)
    // 移除dev版本格式后缀
    return version.replace(/-d\d{2,4}\.[a-f0-9]{7}$/, '')
  } catch (error) {
    console.error('Failed to read package.json:', error.message)
    return '1.0.0'
  }
}

export function normalizeVersion(version) {
  return String(version || '')
    .trim()
    .replace(/^v/, '')
}

// CI 发布时由 workflow 注入，优先级高于 package.json。
export function getReleaseVersion() {
  return normalizeVersion(process.env.RELEASE_VERSION)
}

// 生成dev版本号
export function getDevVersion() {
  const baseVersion = getBaseVersion()
  const monthDate = getCurrentMonthDate()
  const commitHash = getGitCommitHash(true)

  return `${baseVersion}-d${monthDate}.${commitHash}`
}

// 检查当前环境是否为dev构建
export function isDevBuild() {
  return (
    process.env.NODE_ENV === 'development' ||
    process.argv.includes('--dev') ||
    process.env.BUILD_CHANNEL === 'dev'
  )
}

// 获取处理后的版本号
export function getProcessedVersion() {
  const releaseVersion = getReleaseVersion()
  if (releaseVersion) {
    return releaseVersion
  }

  if (isDevBuild()) {
    return getDevVersion()
  } else {
    return getBaseVersion()
  }
}

// 生成下载URL
export function getDownloadUrl(isDev, version) {
  if (isDev) {
    return 'https://github.com/DwenChen/TabDo/releases/download/dev'
  } else {
    return `https://github.com/DwenChen/TabDo/releases/download/v${version}`
  }
}

/**
 * 生成本版 Windows 安装包与免安装 ZIP 的下载链接。
 * @param {string} downloadUrl GitHub Release 下载地址。
 * @param {string} version 发布版本号。
 * @returns {string} Windows 下载链接 Markdown。
 */
export function generateDownloadLinksMarkdown(downloadUrl, version) {
  let links = '\n\n---\n\n### 下载地址：\n\n'

  links += '#### Windows 10/11 (x64)：\n\n'
  links += `- 安装版：[TabDo-${version}-win-x64-setup.exe](${downloadUrl}/TabDo-${version}-win-x64-setup.exe)\n`
  links += `- 便携版：[TabDo-${version}-win-x64.zip](${downloadUrl}/TabDo-${version}-win-x64.zip)\n\n`

  return links
}
