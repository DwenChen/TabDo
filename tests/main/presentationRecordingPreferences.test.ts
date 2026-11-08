import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

vi.mock('../../internal-plugins/system/presentation/electron/ipc/utils', () => ({
  parseJsonWithByteOrderMark: (text: string) => JSON.parse(text.replace(/^\uFEFF/, ''))
}))
import { createRecordingPreferencesStore } from '../../internal-plugins/system/presentation/electron/ipc/settings/recordingPreferencesStore'

afterEach(() => vi.restoreAllMocks())

describe('presentation directory and device preferences', () => {
  it('merges queued project and recording directory changes without replacing existing device choices', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tabdo-recording-settings-'))
    try {
      const file = path.join(root, 'settings.json')
      await fs.writeFile(
        file,
        JSON.stringify({
          microphoneEnabled: true,
          microphoneDeviceId: 'explicit-device',
          recordingsDir: 'old-recordings',
          preserved: 'custom-value'
        })
      )
      const store = createRecordingPreferencesStore(file)
      await Promise.all([
        store.update({ projectsDir: 'new-projects' }),
        store.update({ recordingsDir: 'new-recordings' }),
        store.update({ webcamEnabled: false })
      ])
      expect(await store.read()).toEqual({
        microphoneEnabled: true,
        microphoneDeviceId: 'explicit-device',
        recordingsDir: 'new-recordings',
        projectsDir: 'new-projects',
        webcamEnabled: false,
        preserved: 'custom-value'
      })
      const write = vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('disk denied'))
      await expect(store.update({ projectsDir: 'invalid' })).rejects.toThrow('disk denied')
      await store.update({ systemAudioEnabled: true })
      expect(await store.read()).toMatchObject({
        projectsDir: 'new-projects',
        microphoneDeviceId: 'explicit-device',
        systemAudioEnabled: true
      })
      write.mockRestore()
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
