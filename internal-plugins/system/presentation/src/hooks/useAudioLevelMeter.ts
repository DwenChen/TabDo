import { useEffect, useState } from 'react'

export interface AudioLevelMeterOptions {
  enabled: boolean
  deviceId?: string
  smoothingFactor?: number
}

/**
 * Monitor a microphone only while its menu row owns the current effect.
 * @param options Device selection, visibility and analyser smoothing.
 * @returns The current level from zero to one hundred.
 */
export function useAudioLevelMeter(options: AudioLevelMeterOptions) {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    let mounted = true
    let stream: MediaStream | null = null
    let audioContext: AudioContext | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let animationFrame: number | null = null
    /**
     * Release only resources acquired by this effect, including failed preparation.
     * @returns Nothing; repeated cleanup is harmless.
     */
    const cleanup = () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame)
        animationFrame = null
      }
      source?.disconnect()
      source = null
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
        stream = null
      }
      if (audioContext) {
        void audioContext.close().catch(() => undefined)
        audioContext = null
      }
    }

    setLevel(0)
    if (!options.enabled) {
      return cleanup
    }

    /**
     * Acquire the device and start bounded UI updates for this menu lifetime.
     * @returns Completion after setup or release of a failed or superseded setup.
     */
    const startMonitoring = async () => {
      try {
        const constraints: MediaStreamConstraints = {
          audio: options.deviceId ? { deviceId: { exact: options.deviceId } } : true,
          video: false
        }

        const acquiredStream = await navigator.mediaDevices.getUserMedia(constraints)
        if (!mounted) {
          acquiredStream.getTracks().forEach((track) => track.stop())
          return
        }

        stream = acquiredStream
        // Publish ownership before resume can yield to menu closure or a device change.
        const context = new AudioContext()
        audioContext = context
        if (context.state === 'suspended') {
          await context.resume()
        }
        if (!mounted) return

        const analyser = context.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = options.smoothingFactor ?? 0.8
        source = context.createMediaStreamSource(acquiredStream)
        source.connect(analyser)

        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        let lastUpdate = -Infinity

        /**
         * Sample at most twenty times per second instead of every display refresh.
         * @param timestamp Animation-frame time in milliseconds.
         * @returns Nothing; queues another frame only while this effect is active.
         */
        const updateLevel = (timestamp: number) => {
          if (!mounted) return
          animationFrame = requestAnimationFrame(updateLevel)
          if (timestamp - lastUpdate < 50) return
          lastUpdate = timestamp

          analyser.getByteFrequencyData(dataArray)

          let sum = 0
          for (let index = 0; index < dataArray.length; index++) {
            sum += dataArray[index] * dataArray[index]
          }

          const rms = Math.sqrt(sum / dataArray.length)
          const normalizedLevel = Math.min(100, (rms / 255) * 100 * 2)
          setLevel(Math.round(normalizedLevel))
        }

        updateLevel(performance.now())
      } catch (error) {
        // A failed resume or analyser must release the already-acquired microphone.
        cleanup()
        if (mounted) {
          console.error('Error starting audio level monitoring:', error)
          setLevel(0)
        }
      }
    }

    void startMonitoring()

    return () => {
      mounted = false
      cleanup()
    }
  }, [options.deviceId, options.enabled, options.smoothingFactor])

  return { level }
}
