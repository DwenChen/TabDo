import { SOURCE_AUDIO_NORMALIZE_GAIN } from "@presentation/components/video-editor/audio/audioTypes";
import type { ZoomPlaybackClock } from "@presentation/components/video-editor/zoomPlayback";
import type {
	AudioRegion,
	ClipRegion,
	SourceAudioTrackSettings,
	SpeedRegion,
} from "@presentation/components/video-editor/types";
import {
	getClipSourceEndMs,
	getClipSourceStartMs,
	getTimelineDurationMs,
} from "@presentation/components/video-editor/types";
import { buildResolvedAudioPlan } from "@presentation/lib/exporter/audioRoutingEngine";
import { estimateCompanionAudioStartDelaySeconds } from "@presentation/lib/mediaTiming";
import { AudioMediaProcessor } from "./audioMediaProcessor";
import {
	AUDIO_BITRATE,
	ENCODE_BACKPRESSURE_LIMIT,
	getSourceTrackIdFromPath,
	MP4_AUDIO_CODEC,
	OFFLINE_AUDIO_SAMPLE_RATE,
	OFFLINE_CHUNK_DURATION_SEC,
	OFFLINE_ENCODE_CHUNK_FRAMES,
	type PreparedOfflineRender,
	resolveSourceTrackGain,
	softLimitOfflineMixPeaksInPlace,
	type TimelineSlice,
	type TrimLikeRegion,
} from "./audioProcessorShared";
import type { VideoMuxer } from "./muxer";

export class OfflineAudioProcessor extends AudioMediaProcessor {
	/**
	 * Mix audio against the same output clock used for video.
	 * @param zoomPlayback Optional clock for zoom-region video speed.
	 * @returns Offline audio processor for the current export.
	 */
	constructor(protected readonly zoomPlayback?: ZoomPlaybackClock) {
		super();
	}

	protected async renderAndMuxOfflineAudio(
		videoUrl: string,
		trimRegions: TrimLikeRegion[],
		speedRegions: SpeedRegion[],
		audioRegions: AudioRegion[],
		sourceAudioFallbackPaths: string[],
		sourceAudioFallbackStartDelayMsByPath: Record<string, number> | undefined,
		sourceAudioTrackSettings: SourceAudioTrackSettings | undefined,
		clipRegions: ClipRegion[] | undefined,
		muxer: VideoMuxer,
	): Promise<void> {
		const prepared = await this.prepareOfflineRender(
			videoUrl,
			trimRegions,
			speedRegions,
			audioRegions,
			sourceAudioFallbackPaths,
			sourceAudioFallbackStartDelayMsByPath,
			sourceAudioTrackSettings,
			clipRegions,
		);
		if (this.cancelled) return;
		await this.renderAndEncodeChunked(prepared, muxer);
	}

	protected async prepareOfflineRender(
		videoUrl: string,
		trimRegions: TrimLikeRegion[],
		speedRegions: SpeedRegion[],
		audioRegions: AudioRegion[],
		sourceAudioFallbackPaths: string[],
		sourceAudioFallbackStartDelayMsByPath?: Record<string, number>,
		sourceAudioTrackSettings?: SourceAudioTrackSettings,
		clipRegions?: ClipRegion[],
	): Promise<PreparedOfflineRender> {
		if (this.cancelled) throw new Error("Export cancelled");
		this.onProgress?.(0);

		const resolvedPlan = buildResolvedAudioPlan({
			videoResource: videoUrl,
			sourceAudioFallbackPaths,
			audioRegions,
			sourceTrackGainById: {
				mic: resolveSourceTrackGain(sourceAudioTrackSettings, "mic"),
				system: resolveSourceTrackGain(sourceAudioTrackSettings, "system"),
				mixed: resolveSourceTrackGain(sourceAudioTrackSettings, "mixed"),
			},
			embeddedGain: Math.max(
				0,
				Math.min(
					2,
					sourceAudioTrackSettings?.mixed
						? resolveSourceTrackGain(sourceAudioTrackSettings, "mixed")
						: sourceAudioTrackSettings?.system
							? resolveSourceTrackGain(sourceAudioTrackSettings, "system")
							: 1,
				),
			),
		});

		// Decode embedded source audio separately from companion sidecars.
		const mainBuffer = resolvedPlan.includeEmbeddedInExport
			? await this.decodeAudioFromUrl(videoUrl)
			: null;
		const mainBufferGain = resolveSourceTrackGain(sourceAudioTrackSettings, "mixed");
		const mainBufferEntry = mainBuffer ? { buffer: mainBuffer, gain: mainBufferGain } : null;
		if (this.cancelled) throw new Error("Export cancelled");

		// Decode companion / sidecar audio files
		const companionEntries: Array<{
			buffer: AudioBuffer;
			startDelaySec: number;
			gain: number;
		}> = [];
		const refDuration =
			mainBuffer?.duration ??
			(resolvedPlan.playbackPaths.length > 0 ? await this.getMediaDurationSec(videoUrl) : 0);
		for (const audioPath of resolvedPlan.playbackPaths) {
			if (this.cancelled) throw new Error("Export cancelled");
			const buffer = await this.decodeAudioFromUrl(audioPath);
			if (!buffer) continue;

			companionEntries.push({
				buffer,
				gain: resolveSourceTrackGain(
					sourceAudioTrackSettings,
					getSourceTrackIdFromPath(audioPath),
				),
				startDelaySec: estimateCompanionAudioStartDelaySeconds(
					refDuration,
					buffer.duration,
					sourceAudioFallbackStartDelayMsByPath?.[audioPath],
				),
			});
		}
		if (this.cancelled) throw new Error("Export cancelled");

		// Decode audio region overlay files
		const regionEntries: Array<{ buffer: AudioBuffer; region: AudioRegion }> = [];
		for (const region of audioRegions) {
			if (this.cancelled) throw new Error("Export cancelled");
			const buffer = await this.decodeAudioFromUrl(region.audioPath);
			if (buffer) regionEntries.push({ buffer, region });
		}

		this.onProgress?.(0.2);

		// Determine source duration for timeline calculation
		const primaryBuffer = mainBufferEntry?.buffer ?? companionEntries[0]?.buffer ?? null;
		if (!primaryBuffer && regionEntries.length === 0) {
			throw new Error("No decodable audio sources found");
		}

		let sourceDurationSec: number;
		if (mainBufferEntry?.buffer) {
			sourceDurationSec = mainBufferEntry.buffer.duration;
		} else if (resolvedPlan.playbackPaths.length > 0 || regionEntries.length > 0) {
			sourceDurationSec = await this.getMediaDurationSec(videoUrl);
		} else {
			sourceDurationSec = primaryBuffer?.duration ?? 0;
		}
		const sourceDurationMs = sourceDurationSec * 1000;

		// Build timeline slices (non-trimmed segments with speed info)
		const slices = clipRegions
			? clipRegions.map((clip) => ({
					sourceStartMs: getClipSourceStartMs(clip),
					sourceEndMs: getClipSourceEndMs(clip),
					speed: clip.speed,
					outputStartMs: clip.startMs,
				}))
			: this.buildTimelineSlices(sourceDurationMs, trimRegions, speedRegions);

		let outputDurationMs = 0;
		for (const slice of slices) {
			outputDurationMs += (slice.sourceEndMs - slice.sourceStartMs) / slice.speed;
		}
		if (clipRegions) outputDurationMs = getTimelineDurationMs(clipRegions, sourceDurationMs);

		// Extend for audio regions that might exceed the video timeline
		for (const { region } of regionEntries) {
			const regionEndOutput = clipRegions
				? region.endMs
				: this.sourceTimeToOutputTime(region.endMs, slices);
			outputDurationMs = Math.max(outputDurationMs, regionEndOutput);
		}

		const numChannels = Math.min(primaryBuffer?.numberOfChannels ?? 2, 2);
		const mutedSourceOutputRangesSec = (clipRegions ?? [])
			.filter(
				(clip) =>
					Boolean(clip.muted) &&
					Number.isFinite(clip.startMs) &&
					Number.isFinite(clip.endMs) &&
					clip.endMs > clip.startMs,
			)
			.map((clip) => ({
				startSec: Math.max(0, clip.startMs / 1000),
				endSec: Math.max(0, clip.endMs / 1000),
			}));

		return {
			usesClipTimeline: clipRegions !== undefined,
			mainBufferEntry,
			companionEntries,
			regionEntries,
			mutedSourceOutputRangesSec,
			slices,
			outputDurationMs,
			numChannels,
		};
	}

	// Render timeline in chunks and encode each chunk to the muxer immediately.
	// Memory is bounded to ~OFFLINE_CHUNK_DURATION_SEC of PCM per chunk
	// instead of holding the entire output buffer in memory.
	protected async renderAndEncodeChunked(
		prepared: PreparedOfflineRender,
		muxer: VideoMuxer,
	): Promise<void> {
		const { numChannels } = prepared;
		const outputMs = this.zoomPlayback?.toOutputMs(prepared.outputDurationMs) ?? prepared.outputDurationMs;
		const totalOutputSec = Math.max(outputMs / 1000, 0.01);

		let encodeError: Error | null = null;
		let muxError: Error | null = null;
		let pendingMuxing = Promise.resolve();
		let wroteFirstChunk = false;

		const encodeConfig: AudioEncoderConfig = {
			codec: MP4_AUDIO_CODEC,
			sampleRate: OFFLINE_AUDIO_SAMPLE_RATE,
			numberOfChannels: numChannels,
			bitrate: AUDIO_BITRATE,
		};

		const supported = await AudioEncoder.isConfigSupported(encodeConfig);
		if (!supported.supported) {
			console.warn("[AudioProcessor] AAC encoding not supported for offline audio");
			return;
		}

		const encoder = new AudioEncoder({
			output: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => {
				pendingMuxing = pendingMuxing
					.then(async () => {
						if (this.cancelled) return;
						await muxer.addAudioChunk(chunk, !wroteFirstChunk ? meta : undefined);
						wroteFirstChunk = true;
					})
					.catch((error) => {
						muxError = error instanceof Error ? error : new Error(String(error));
					});
			},
			error: (error: DOMException) => {
				encodeError = new Error(`Audio encode error: ${error.message}`);
			},
		});
		encoder.configure(encodeConfig);

		try {
			await this.renderChunked(
				prepared,
				totalOutputSec,
				async (rendered, outputOffsetSec) => {
					if (encodeError) throw encodeError;
					if (muxError) throw muxError;
					await this.feedBufferToEncoder(encoder, rendered, outputOffsetSec);
				},
			);

			if (encodeError) throw encodeError;
			if (muxError) throw muxError;

			if (encoder.state === "configured") {
				await encoder.flush();
			}

			await pendingMuxing;

			if (encodeError) throw encodeError;
			if (muxError) throw muxError;
		} finally {
			if (encoder.state === "configured") {
				encoder.close();
			}
		}
	}

	// Render timeline to a WAV blob for the native/FFmpeg export path.
	// Processes in chunks to avoid holding the entire output in memory.
	protected async renderToWavBlobChunked(prepared: PreparedOfflineRender): Promise<Blob> {
		const outputMs = this.zoomPlayback?.toOutputMs(prepared.outputDurationMs) ?? prepared.outputDurationMs;
		const totalOutputSec = Math.max(outputMs / 1000, 0.01);
		const totalFrames = Math.ceil(totalOutputSec * OFFLINE_AUDIO_SAMPLE_RATE);
		const numChannels = prepared.numChannels;

		const header = this.createWavHeader(OFFLINE_AUDIO_SAMPLE_RATE, numChannels, totalFrames);
		const pcmParts: ArrayBuffer[] = [header];

		await this.renderChunked(prepared, totalOutputSec, async (rendered) => {
			pcmParts.push(...this.audioBufferToPcmParts(rendered));
		});
		if (this.cancelled) throw new Error("Export cancelled");

		return new Blob(pcmParts, { type: "audio/wav" });
	}

	/**
	 * Mix bounded timeline spans and stretch them with the existing pitch-preserving processor.
	 * @param prepared Resolved edit-time sources and placements.
	 * @param totalOutputSec Duration on the output clock.
	 * @param onChunk Receives each output buffer at its sample-aligned time.
	 * @returns Resolves on completion or cancellation.
	 */
	protected async renderChunked(
		prepared: PreparedOfflineRender,
		totalOutputSec: number,
		onChunk: (
			rendered: AudioBuffer,
			outputOffsetSec: number,
			chunkIndex: number,
		) => Promise<void>,
	): Promise<void> {
		const { slices, numChannels } = prepared;
		const sampleRate = OFFLINE_AUDIO_SAMPLE_RATE;
		const clock = this.zoomPlayback;
		const totalFrames = Math.ceil(totalOutputSec * sampleRate);
		const boundaries = clock?.spans.map((span) => ({
			frame: Math.ceil(span.outputMs * sampleRate / 1000),
			rate: span.rate,
		})) ?? [];
		let outputFrame = 0;
		let spanIndex = 0;
		let chunkIndex = 0;
		while (outputFrame < totalFrames && !this.cancelled) {
			// Cut on a sample boundary and bound the edit-time PCM per chunk.
			while (spanIndex + 1 < boundaries.length && boundaries[spanIndex + 1].frame <= outputFrame) {
				spanIndex++;
			}
			const rate = boundaries[spanIndex]?.rate ?? 1;
			const nextFrame = Math.min(
				totalFrames,
				boundaries[spanIndex + 1]?.frame ?? totalFrames,
				outputFrame + Math.floor(OFFLINE_CHUNK_DURATION_SEC * sampleRate / Math.max(1, rate)),
			);
			const chunkFrames = nextFrame - outputFrame;
			const outputOffsetSec = outputFrame / sampleRate;
			const chunkSec = chunkFrames / sampleRate;
			const editSec = clock ? clock.toEditMs(outputOffsetSec * 1000) / 1000 : outputOffsetSec;
			const padSec = rate === 1 ? 0 : 0.1 * rate;
			const editStartSec = Math.max(0, editSec - padSec);
			const sourceOffsetSec = editSec - editStartSec;
			const editChunkSec = sourceOffsetSec + chunkSec * rate + padSec;
			const offlineCtx = new OfflineAudioContext(
				numChannels,
				rate === 1 ? chunkFrames : Math.ceil(editChunkSec * sampleRate),
				sampleRate,
			);

			// Schedule main audio
			if (prepared.mainBufferEntry) {
				this.scheduleBufferThroughTimeline(
					offlineCtx,
					prepared.mainBufferEntry.buffer,
					slices,
					0,
					prepared.mainBufferEntry.gain,
					editStartSec,
					editChunkSec,
					prepared.mutedSourceOutputRangesSec,
				);
			}

			// Schedule companion/sidecar audio
			for (const entry of prepared.companionEntries) {
				this.scheduleBufferThroughTimeline(
					offlineCtx,
					entry.buffer,
					slices,
					entry.startDelaySec,
					entry.gain,
					editStartSec,
					editChunkSec,
					prepared.mutedSourceOutputRangesSec,
				);
			}

			// Schedule audio region overlays
			for (const { buffer, region } of prepared.regionEntries) {
				this.scheduleRegionForChunk(
					offlineCtx,
					buffer,
					region,
					slices,
					editStartSec,
					editChunkSec,
					prepared.usesClipTimeline,
				);
			}

			const rendered = await offlineCtx.startRendering();
			if (this.cancelled) break;
			// Padding gives overlap-add the surrounding waveform at a speed boundary.
			const output = rate === 1 ? rendered : this.stretchAudioBuffer(
				rendered,
				rate,
				sourceOffsetSec,
				chunkSec * rate,
				(chunkFrames + 1e-6) / sampleRate,
				offlineCtx,
			);
			softLimitOfflineMixPeaksInPlace(output);
			await onChunk(output, outputOffsetSec, chunkIndex++);
			outputFrame = nextFrame;
			this.onProgress?.(0.3 + (outputFrame / totalFrames) * 0.7);
		}
	}

	/**
   * Schedule a sound clip with its source offset, playback speed and gain envelope.
   * @param ctx - Offline destination context.
   * @param buffer - Decoded sound source.
   * @param region - Independent clip settings.
   * @param slices - Legacy source-to-output mapping.
   * @param chunkOutputStartSec - Timeline start of the current output chunk.
   * @param chunkDurationSec - Current output chunk duration.
   * @param usesClipTimeline - Whether region positions already use output time.
   * @returns Nothing; schedules source and gain nodes in the offline context.
   */
	protected scheduleRegionForChunk(
		ctx: OfflineAudioContext,
		buffer: AudioBuffer,
		region: AudioRegion,
		slices: TimelineSlice[],
		chunkOutputStartSec: number,
		chunkDurationSec: number,
		usesClipTimeline = false,
	): void {
		const outputStartMs = usesClipTimeline
			? region.startMs
			: this.sourceTimeToOutputTime(region.startMs, slices);
		const outputEndMs = usesClipTimeline
			? region.endMs
			: this.sourceTimeToOutputTime(region.endMs, slices);

		let localStartSec = outputStartMs / 1000 - chunkOutputStartSec;
		let localEndSec = outputEndMs / 1000 - chunkOutputStartSec;

		// Skip if region doesn't overlap with this chunk
		if (localEndSec <= 0 || localStartSec >= chunkDurationSec) return;

		// Clip to chunk bounds
		const rate = region.playbackRate ?? 1;
		let bufferOffsetSec = (region.sourceStartMs ?? 0) / 1000;
		if (localStartSec < 0) {
			bufferOffsetSec += -localStartSec * rate;
			localStartSec = 0;
		}
		if (localEndSec > chunkDurationSec) {
			localEndSec = chunkDurationSec;
		}

		const duration = Math.min((localEndSec - localStartSec) * rate, buffer.duration - bufferOffsetSec);
		if (duration <= 0.001) return;

		const gainNode = ctx.createGain();
		const normalizeGain = region.normalize ? SOURCE_AUDIO_NORMALIZE_GAIN : 1;
		gainNode.gain.value = Math.max(0, Math.min(1, region.volume * normalizeGain));
		gainNode.connect(ctx.destination);

		const source = ctx.createBufferSource();
		const stretch = Math.abs(rate - 1) > 0.001;
		source.buffer = stretch ? this.stretchAudioBuffer(buffer, rate, bufferOffsetSec, duration, duration / rate, ctx) : buffer;
		source.playbackRate.value = 1;
		// Evaluate fades in timeline time so chunk boundaries preserve the same envelope.
		const gain = gainNode.gain.value;
		const fadeIn = (region.fadeInMs ?? 0) / 1000;
		const fadeOut = (region.fadeOutMs ?? 0) / 1000;
		const outputStart = outputStartMs / 1000 - chunkOutputStartSec;
		const outputEnd = outputEndMs / 1000 - chunkOutputStartSec;
		const envelope = (time: number): number => gain * Math.max(0, Math.min(1, fadeIn > 0 ? (time - outputStart) / fadeIn : 1, fadeOut > 0 ? (outputEnd - time) / fadeOut : 1));
		const times = [localStartSec, outputStart + fadeIn, outputEnd - fadeOut, localEndSec].filter((time) => time >= localStartSec && time <= localEndSec).sort((a, b) => a - b);
		gainNode.gain.setValueAtTime(envelope(localStartSec), localStartSec);
		for (const time of times) gainNode.gain.linearRampToValueAtTime(envelope(time), time);
		source.connect(gainNode);
		source.start(localStartSec, stretch ? 0 : bufferOffsetSec, stretch ? duration / rate : duration);
	}

	// Feed a rendered AudioBuffer chunk to an AudioEncoder with a timestamp offset.
	protected async feedBufferToEncoder(
		encoder: AudioEncoder,
		buffer: AudioBuffer,
		timestampOffsetSec: number,
	): Promise<void> {
		const sampleRate = buffer.sampleRate;
		const numChannels = buffer.numberOfChannels;
		const totalFrames = buffer.length;

		for (
			let offset = 0;
			offset < totalFrames && !this.cancelled;
			offset += OFFLINE_ENCODE_CHUNK_FRAMES
		) {
			const frameCount = Math.min(OFFLINE_ENCODE_CHUNK_FRAMES, totalFrames - offset);

			const planarData = new Float32Array(frameCount * numChannels);
			for (let ch = 0; ch < numChannels; ch++) {
				const channelData = buffer.getChannelData(ch);
				planarData.set(channelData.subarray(offset, offset + frameCount), ch * frameCount);
			}

			const audioData = new AudioData({
				format: "f32-planar",
				sampleRate,
				numberOfFrames: frameCount,
				numberOfChannels: numChannels,
				timestamp: Math.round((offset / sampleRate + timestampOffsetSec) * 1_000_000),
				data: planarData,
			});

			encoder.encode(audioData);
			audioData.close();

			while (encoder.encodeQueueSize >= ENCODE_BACKPRESSURE_LIMIT && !this.cancelled) {
				await new Promise((r) => setTimeout(r, 1));
			}
		}
	}

	// Decode audio from a URL using streaming WebCodecs decode with bulk fallback.
	// Streaming decode avoids holding the full compressed file in memory alongside
	// the decoded AudioBuffer, reducing peak memory for large recordings.
}
