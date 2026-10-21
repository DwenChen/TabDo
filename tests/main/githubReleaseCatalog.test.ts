import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: { getVersion: () => '1.0.0' } }))
vi.mock('../../src/main/api/shared/database', () => ({ default: { dbGet: () => ({}) } }))
vi.mock('../../src/main/utils/httpRequest', () => ({ httpRequest: vi.fn() }))
import { httpRequest } from '../../src/main/utils/httpRequest'
import {
  fetchLatestServerUpdate,
  fetchServerUpdateSources,
  isNewerVersion
} from '../../src/main/api/serverUpdateCatalog'
beforeEach(() => vi.clearAllMocks())
describe('repository release catalog', () => {
  it('checks this repository and ignores drafts and prereleases on the stable channel', async () => {
    vi.mocked(httpRequest).mockResolvedValue({
      status: 200,
      data: [
        {
          tag_name: 'v1.0.1',
          draft: false,
          prerelease: false,
          body: 'fix',
          published_at: '2026-10-18T00:00:00Z'
        },
        { tag_name: 'v2.0.0-beta.1', draft: false, prerelease: true },
        { tag_name: 'v9.0.0', draft: true }
      ]
    } as any)
    expect(await fetchLatestServerUpdate()).toMatchObject({
      available: true,
      latestVersion: '1.0.1',
      releaseNotes: 'fix'
    })
    expect(vi.mocked(httpRequest).mock.calls[0][0]).toBe(
      'https://api.github.com/repos/DwenChen/TabDo/releases?per_page=100'
    )
  })
  it('returns null for a repository without releases', async () => {
    vi.mocked(httpRequest).mockResolvedValue({ data: [] } as any)
    expect(await fetchLatestServerUpdate()).toBeNull()
  })
  it.each([
    ['1.0.1', '1.0.0', true],
    ['1.0.0', '1.0.0', false],
    ['0.9.9', '1.0.0', false],
    ['1.0.0', '1.0.0-beta.9', true],
    ['1.0.0-beta.10', '1.0.0-beta.9', true],
    ['1.0.0-beta.1', '1.0.0', false]
  ])('compares %s with %s', (a, b, expected) => expect(isNewerVersion(a, b)).toBe(expected))
  it('offers only this repository as an update/download source', async () => {
    const sources = await fetchServerUpdateSources('1.0.1')
    expect(
      sources.every((source) => source.downloadUrl.startsWith('https://github.com/DwenChen/TabDo/'))
    ).toBe(true)
  })
})
