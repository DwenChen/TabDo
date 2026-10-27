import { VideoSource } from "pixi.js";

/** Own the GPU source for the lifetime of React's persistent video element. */
export class PreviewVideoSource {
	private video: HTMLVideoElement | null = null;
	private source: VideoSource | null = null;

	setVideo(video: HTMLVideoElement | null): void {
		if (video === this.video) return;

		if (this.source) {
			this.source.autoUpdate = false;
			this.source.destroy();
			this.source = null;
		}
		this.video = video;
	}

	/**
	 * 取得由合成器统一更新的 GPU 视频源。
	 * @returns 与当前视频元素同寿命的纹理源。
	 * @throws {Error} 视频元素尚未附加时抛出错误。
	 */
	getSource(): VideoSource {
		if (!this.video) throw new Error("Preview video element is not attached");
		this.source ??= new VideoSource({ resource: this.video, autoPlay: false });
		// 帧合成器统一提交纹理和光标，不再注册独立的纹理更新循环。
		this.source.autoUpdate = false;
		// React can load another media URL into the same element.
		this.source.update();
		return this.source;
	}

	suspend(): void {
		if (!this.source) return;
		this.source.autoUpdate = false;
		this.source.unload();
	}
}
