import path from "node:path";

const RECORDED_VIDEO_FILE_NAME = /^recording-[0-9]+(?:-webcam)?\.(?:webm|mp4)$/;
const RECORDED_AUDIO_FILE_NAME = /^recording-[0-9]+\.(?:system|mic)\.webm$/;

/**
 * Confine a recorded video or explicitly auxiliary audio to the recordings directory.
 * @param recordingsDir Current session recordings directory.
 * @param fileName Generated recording basename, never a user path.
 * @param allowAudio Whether this is an auxiliary save permitted to write a dedicated audio source.
 * @returns An absolute recording path inside the requested directory.
 * @throws When the basename or resolved destination is invalid.
 */
export function resolveRecordedVideoStoragePath(recordingsDir: string, fileName: unknown, allowAudio = false): string {
	if (typeof fileName !== "string" || !(RECORDED_VIDEO_FILE_NAME.exec(fileName)?.[0] === fileName || (allowAudio && RECORDED_AUDIO_FILE_NAME.exec(fileName)?.[0] === fileName))) {
		throw new Error("Invalid recording file name");
	}

	const resolvedRecordingsDir = path.resolve(recordingsDir);
	const candidatePath = path.resolve(resolvedRecordingsDir, fileName);
	const relativePath = path.relative(resolvedRecordingsDir, candidatePath);

	if (
		relativePath.length === 0 ||
		relativePath === ".." ||
		relativePath.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relativePath)
	) {
		throw new Error("Invalid recording file name");
	}

	return candidatePath;
}
