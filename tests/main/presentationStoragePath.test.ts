import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { resolveRecordedVideoStoragePath } from '../../internal-plugins/system/presentation/electron/ipc/recording/storagePath'

describe('presentation companion storage', () => {
  it('allows only explicit generated auxiliary audio names without weakening the video entry point', () => {
    const root = path.resolve('.artifacts/test-recordings')
    for (const kind of ['system', 'mic']) {
      const name = `recording-123.${kind}.webm`
      expect(resolveRecordedVideoStoragePath(root, name, true)).toBe(path.join(root, name))
      expect(() => resolveRecordedVideoStoragePath(root, name)).toThrow(
        'Invalid recording file name'
      )
    }
    for (const name of [
      '../recording-123.mic.webm',
      'recording-123.mic.webm\n',
      'elsewhere.webm',
      'recording-123.mic.mp4'
    ]) {
      expect(() => resolveRecordedVideoStoragePath(root, name, true)).toThrow(
        'Invalid recording file name'
      )
    }
  })
})
