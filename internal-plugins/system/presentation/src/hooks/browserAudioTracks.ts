import { fixWebmDuration } from '@fix-webm-duration/fix'

/** Audio encoders owned exclusively by one recording; no device is acquired here. */
export class BrowserAudioTracks {
  private tracks: Array<{ recorder: MediaRecorder; done: Promise<{ data: Blob; kind: string }> }> =
    []

  /**
   * Prepare separate encoders without mixing system sound and microphone samples.
   * @param sources Available audio sources, in display order.
   * @returns A session ready to start at the same boundary as both video encoders.
   */
  constructor(sources: Array<{ kind: 'system' | 'mic'; stream: MediaStream | null }>) {
    for (const { kind, stream } of sources) {
      if (!stream?.getAudioTracks().length) continue
      const recorder = new MediaRecorder(new MediaStream(stream.getAudioTracks()), {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 192000
      })
      const chunks: Blob[] = []
      const done = new Promise<{ data: Blob; kind: string }>((resolve, reject) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data)
        }
        recorder.onerror = () =>
          reject(new Error(`无法录制${kind === 'mic' ? '麦克风' : '系统音频'}`))
        recorder.onstop = () =>
          resolve({ data: new Blob(chunks, { type: recorder.mimeType }), kind })
      })
      // Attach an immediate rejection observer; persistence still receives the failure.
      void done.catch(() => undefined)
      this.tracks.push({ recorder, done })
    }
  }

  /**
   * Change all audio encoders synchronously within the screen recording's boundary task.
   * @param action Capture boundary to apply.
   * @returns Nothing; chunk encoding and flushing finish asynchronously.
   */
  apply(action: 'start' | 'pause' | 'resume' | 'stop'): void {
    for (const { recorder } of this.tracks) {
      if (action === 'start' && recorder.state === 'inactive') recorder.start(250)
      if (action === 'pause' && recorder.state === 'recording') recorder.pause()
      if (action === 'resume' && recorder.state === 'paused') recorder.resume()
      if (action === 'stop' && recorder.state !== 'inactive') recorder.stop()
    }
  }

  /**
   * Persist completed companions before the initial editor session is published.
   * @param stem Common recording filename without extension.
   * @param durationMs Frozen duration excluding pauses.
   * @returns A promise resolving after every recorded source is stored.
   * @throws When an encoder or companion write fails.
   */
  async save(stem: string, durationMs: number): Promise<void> {
    await Promise.all(
      this.tracks.map(async ({ done }) => {
        const { data, kind } = await done
        if (!data.size) return
        const blob = await fixWebmDuration(data, durationMs)
        const result = await window.electronAPI.storeRecordedVideo(
          await blob.arrayBuffer(),
          `${stem}.${kind}.webm`,
          { auxiliary: true }
        )
        if (!result.success) throw new Error(`保存音轨失败：${kind}`)
      })
    )
    this.tracks = []
  }
}
