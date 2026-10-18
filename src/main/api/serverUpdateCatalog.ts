import { app } from 'electron'
import { httpRequest } from '../utils/httpRequest'
import type { PlatformUpdateInfo, UpdateDownloadSource } from './platformUpdater/types'
import databaseAPI from './shared/database'
import { resolveUpdateChannel, type UpdateChannel } from '../../shared/updateChannel'
import { GITHUB_REPOSITORY_URL, getGitHubReleaseUrl } from '../../shared/updateSource'
const RELEASE_API = 'https://api.github.com/repos/DwenChen/ZTools/releases'
export interface ServerUpdateInfo {
  available: boolean
  latestVersion: string
  releaseNotes: string
  publishedAt: number
}
interface Release {
  tag_name: string
  draft: boolean
  prerelease: boolean
  body: string
  published_at: string
}
/** 获取更新通道。
 * @returns 用户选择的稳定版或测试版通道。
 */
export function getUpdateChannel(): UpdateChannel {
  return resolveUpdateChannel(
    app.getVersion(),
    databaseAPI.dbGet('settings-general')?.receiveBetaUpdates === true
  )
}
/** 获取当前平台标识。
 * @returns 平台与架构。
 */
export function getUpdateSystemType(): string {
  return `${process.platform}-${process.arch}`
}
/** 比较语义版本，避免版本降级与同版本重复提醒。
 * @param candidate 候选版本。
 * @param current 当前版本。
 * @returns 候选版本是否更新。
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = candidate.replace(/^v/, '').split('+')[0].split('-'),
    b = current.replace(/^v/, '').split('+')[0].split('-')
  const ac = a[0].split('.').map(Number),
    bc = b[0].split('.').map(Number)
  if (ac.length !== 3 || ac.some(Number.isNaN)) return false
  for (let i = 0; i < 3; i++) if (ac[i] !== bc[i]) return ac[i] > bc[i]
  if (!a[1] || !b[1]) return !a[1] && !!b[1]
  const ap = a.slice(1).join('-').split('.'),
    bp = b.slice(1).join('-').split('.')
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    if (ap[i] === bp[i]) continue
    if (ap[i] === undefined) return false
    if (bp[i] === undefined) return true
    const an = /^\d+$/.test(ap[i]),
      bn = /^\d+$/.test(bp[i])
    if (an && bn) return Number(ap[i]) > Number(bp[i])
    if (an !== bn) return !an
    return ap[i] > bp[i]
  }
  return false
}
/** 从本仓库的 GitHub Releases 查询可用更新。
 * @returns 最新适用版本；尚未发布时为 null。
 * @throws GitHub 请求失败时抛错。
 */
export async function fetchLatestServerUpdate(): Promise<ServerUpdateInfo | null> {
  const response = await httpRequest(RELEASE_API + '?per_page=100', {
    headers: { Accept: 'application/vnd.github+json' }
  })
  const releases = (response.data as Release[]).filter(
    (r) => !r.draft && (getUpdateChannel() === 'beta' || !r.prerelease)
  )
  const release = releases.reduce<Release | null>(
    (best, item) => (!best || isNewerVersion(item.tag_name, best.tag_name) ? item : best),
    null
  )
  if (!release) return null
  const version = release.tag_name.replace(/^v/, '')
  return {
    available: isNewerVersion(version, app.getVersion()),
    latestVersion: version,
    releaseNotes: release.body || '',
    publishedAt: Date.parse(release.published_at)
  }
}
/** 返回本仓库的标准更新 Feed 与发布页。
 * @param version 版本号。
 * @returns 更新源列表。
 */
export async function fetchServerUpdateSources(version: string): Promise<UpdateDownloadSource[]> {
  const releaseUrl = getGitHubReleaseUrl(version)
  return [
    {
      id: 1,
      platformName: 'GitHub',
      downloadUrl: releaseUrl,
      feedUrl: `${GITHUB_REPOSITORY_URL}/releases/download/v${encodeURIComponent(version)}`,
      isDirect: process.platform === 'win32'
    },
    { id: 2, platformName: 'GitHub Release', downloadUrl: releaseUrl, isDirect: false }
  ]
}
/** 转换 GitHub 版本信息以复用现有更新窗口。
 * @param update GitHub 版本信息。
 * @returns 平台更新信息。
 */
export async function resolvePlatformUpdateInfo(
  update: ServerUpdateInfo
): Promise<PlatformUpdateInfo> {
  const sources = await fetchServerUpdateSources(update.latestVersion),
    direct = sources.find((source) => source.isDirect)
  return {
    version: update.latestVersion,
    changelog: update.releaseNotes,
    releaseNotes: update.releaseNotes,
    downloadUrl: direct?.downloadUrl,
    feedUrl: direct?.feedUrl,
    releaseUrl: getGitHubReleaseUrl(update.latestVersion),
    manualDownloadRequired: !direct,
    sources
  }
}
