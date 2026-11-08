import { getStickerArrowLayout } from '@presentation/components/video-editor/arrowGeometry';
import { getArrowImageSource } from '@presentation/components/video-editor/arrowAppearance';
import { getAnnotationMotion } from '@presentation/components/video-editor/annotationMotion';
import { getAnnotationMaskPath } from '@presentation/components/video-editor/annotationMask';
import {
	type AnnotationRegion,
	BLUR_ANNOTATION_STRENGTH
} from "@presentation/components/video-editor/types";
import { getKeycapDecoration, drawKeycaps, resolveDisplayAnnotations } from "@presentation/components/video-editor/keyboardDisplay";

export interface AnnotationRenderAssets {
	imageCache: Map<string, HTMLImageElement>;
}

interface AnnotationSceneTransform {
	scale: number;
	x: number;
	y: number;
}

interface AnnotationCoordinateRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

function transformAnnotationRect(
	rect: { x: number; y: number; width: number; height: number },
	sceneTransform?: AnnotationSceneTransform
) {
	if (!sceneTransform) {
		return rect;
	}

	return {
		x: rect.x * sceneTransform.scale + sceneTransform.x,
		y: rect.y * sceneTransform.scale + sceneTransform.y,
		width: rect.width * sceneTransform.scale,
		height: rect.height * sceneTransform.scale
	};
}

const annotationImagePromiseCache = new Map<string, Promise<HTMLImageElement | null>>();

let blurBufferCanvas: HTMLCanvasElement | null = null;
/**
 * 复用场景效果画布身份，调用者在当前帧完成后清空像素缓冲。
 * @returns 浏览器中的临时画布；非浏览器环境返回 null。
 */
function getBlurBufferCanvas(): HTMLCanvasElement | null {
	if (typeof document === "undefined") return null;
	if (!blurBufferCanvas) {
		blurBufferCanvas = document.createElement("canvas");
	}
	return blurBufferCanvas;
}

function getAnnotationImageContent(annotation: AnnotationRegion): string | null {
	const source = annotation.imageContent || annotation.content;
	if (!source || !source.startsWith("data:image")) {
		return null;
	}

	return source;
}

function loadAnnotationImage(source: string): Promise<HTMLImageElement | null> {
	const cachedPromise = annotationImagePromiseCache.get(source);
	if (cachedPromise) {
		return cachedPromise;
	}

	const loadPromise = new Promise<HTMLImageElement | null>((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => {
			console.error("[AnnotationRenderer] Failed to load image annotation");
			resolve(null);
		};
		img.src = source;
	});

	// 矢量箭头仅由本次导出的预载集合持有，换色后不在全局累积图片。
	if (!source.startsWith('data:image/svg+xml')) annotationImagePromiseCache.set(source, loadPromise);
	return loadPromise;
}

/**
 * 预载本次导出的图片和矢量箭头，避免逐帧重新生成材质图片。
 * @param annotations 待导出的注释集合。
 * @returns 本次导出独立的已加载图片集合。
 */
export async function preloadAnnotationAssets(
	annotations: AnnotationRegion[] = []
): Promise<AnnotationRenderAssets> {
	const uniqueSources = [
		...new Set(annotations.filter(a => a.type === 'figure').map(a => getArrowImageSource(a.figureData))),
		...new Set(
			annotations
				.filter((annotation) => annotation.type === "image")
				.map((annotation) => getAnnotationImageContent(annotation))
				.filter((source): source is string => !!source)
		)
	];

	if (uniqueSources.length === 0) {
		return { imageCache: new Map() };
	}

	const loadedSources = await Promise.all(
		uniqueSources.map(async (source) => {
			const image = await loadAnnotationImage(source);
			return image ? ([source, image] as const) : null;
		})
	);

	return {
		imageCache: new Map(
			loadedSources.filter((entry): entry is readonly [string, HTMLImageElement] => !!entry)
		)
	};
}

/**
 * 绘制当前矢量箭头，与侧栏和预览共用材质、颜色与方向几何。
 * @param ctx 输出画布。
 * @param annotation 当前箭头片段。
 * @param x 对象左边界。
 * @param y 对象上边界。
 * @param width 对象宽度。
 * @param height 对象高度。
 * @param assets 本次导出预载的图片。
 * @returns 绘制结束的 Promise。
 */
async function renderStickerArrow(ctx: CanvasRenderingContext2D, annotation: AnnotationRegion, x: number, y: number, width: number, height: number, assets?: AnnotationRenderAssets): Promise<void> {
  const source = getArrowImageSource(annotation.figureData)
  const image = assets?.imageCache.get(source) ?? await loadAnnotationImage(source)
  if (!image) return
  const layout = getStickerArrowLayout(annotation.figureData?.arrowDirection ?? 'right', width, height)
  ctx.save(); ctx.translate(x + width / 2, y + height / 2); ctx.rotate(layout.angle)
  ctx.drawImage(image, -layout.width / 2, -layout.height / 2, layout.width, layout.height); ctx.restore()
}

/**
 * Draw wrapped text and keycap backgrounds using the same preset decoration as preview.
 * @param ctx Destination frame context.
 * @param annotation Text or keyboard annotation.
 * @param x Left edge of the annotation.
 * @param y Top edge of the annotation.
 * @param width Available output width.
 * @param height Available output height.
 * @param scaleFactor Scale from project coordinates to output pixels.
 * @returns Nothing; draws directly into the destination frame.
 */
function renderText(
	ctx: CanvasRenderingContext2D,
	annotation: AnnotationRegion,
	x: number,
	y: number,
	width: number,
	height: number,
	scaleFactor: number
): void {
	const style = annotation.style;

	ctx.save();

	ctx.beginPath();
	ctx.rect(x, y, width, height);
	ctx.clip();

	const fontWeight = style.fontWeight === "bold" ? "bold" : "normal";
	const fontStyle = style.fontStyle === "italic" ? "italic" : "normal";
	const scaledFontSize = style.fontSize * scaleFactor;
	ctx.font = `${fontStyle} ${fontWeight} ${scaledFontSize}px ${style.fontFamily}`;
	ctx.textBaseline = "middle";

	const containerPadding = 8 * scaleFactor;

	let textX = x;
	const textY = y + height / 2;

	if (style.textAlign === "center") {
		textX = x + width / 2;
		ctx.textAlign = "center";
	} else if (style.textAlign === "right") {
		textX = x + width - containerPadding;
		ctx.textAlign = "right";
	} else {
		textX = x + containerPadding;
		ctx.textAlign = "left";
	}

	const availableWidth = width - containerPadding * 2;
	const rawLines = annotation.content.split("\n");
	const lines: string[] = [];
	for (const rawLine of rawLines) {
		if (!rawLine) {
			lines.push("");
			continue;
		}
		const words = rawLine.split(/(\s+)/);
		let current = "";
		for (const word of words) {
			const test = current + word;
			if (current && ctx.measureText(test).width > availableWidth) {
				lines.push(current);
				current = word.trimStart();
			} else {
				current = test;
			}
		}
		if (current) lines.push(current);
	}
	const lineHeight = scaledFontSize * 1.4;

	const startY = textY - ((lines.length - 1) * lineHeight) / 2;

	lines.forEach((line, index) => {
		const currentY = startY + index * lineHeight;

		if (style.backgroundColor && style.backgroundColor !== "transparent") {
			const metrics = ctx.measureText(line);
			const verticalPadding = scaledFontSize * 0.1;
			const horizontalPadding = scaledFontSize * 0.2;
			const borderRadius =
				(annotation.type === "keystroke"
					? Math.max(0, Number.isFinite(style.borderRadius) ? style.borderRadius : 0)
					: 4) * scaleFactor;
			const keycap = getKeycapDecoration(
				annotation.type === "keystroke" ? style.keycapStyle : undefined
			);

			let bgX = textX - horizontalPadding;
			const bgWidth = metrics.width + horizontalPadding * 2;

			const contentHeight = scaledFontSize * 1.4;
			const bgHeight = contentHeight + verticalPadding * 2;
			const bgY = currentY - bgHeight / 2;

			if (style.textAlign === "center") {
				bgX = textX - bgWidth / 2;
			} else if (style.textAlign === "right") {
				bgX = textX - bgWidth;
			}

			ctx.fillStyle = style.backgroundColor;
			// Apply decoration only while drawing the keycap so text remains sharp.
			ctx.save();
			ctx.shadowColor = keycap.shadowColor;
			ctx.shadowBlur = keycap.shadowBlur * scaleFactor;
			ctx.shadowOffsetY = keycap.shadowOffsetY * scaleFactor;
			ctx.beginPath();
			ctx.roundRect(bgX, bgY, bgWidth, bgHeight, borderRadius);
			ctx.fill();
			ctx.restore();
			if (keycap.borderWidth > 0) {
				ctx.strokeStyle = keycap.borderColor;
				ctx.lineWidth = keycap.borderWidth * scaleFactor;
				ctx.stroke();
			}
		}

		ctx.fillStyle = style.color;
		ctx.fillText(line, textX, currentY);

		if (style.textDecoration === "underline") {
			const metrics = ctx.measureText(line);
			let underlineX = textX;
			const underlineY = currentY + scaledFontSize * 0.15;

			if (style.textAlign === "center") {
				underlineX = textX - metrics.width / 2;
			} else if (style.textAlign === "right") {
				underlineX = textX - metrics.width;
			}

			ctx.strokeStyle = style.color;
			ctx.lineWidth = Math.max(1, scaledFontSize / 16);
			ctx.beginPath();
			ctx.moveTo(underlineX, underlineY);
			ctx.lineTo(underlineX + metrics.width, underlineY);
			ctx.stroke();
		}
	});

	ctx.restore();
}

/**
 * Draw a contained annotation image with its preview-matched corner clipping.
 * @param ctx Destination frame context.
 * @param annotation Image annotation and corner radius.
 * @param x Left edge of the annotation.
 * @param y Top edge of the annotation.
 * @param width Available output width.
 * @param height Available output height.
 * @param assets Optional preloaded images.
 * @param scaleFactor Scale from project radius to output pixels.
 * @returns Resolves after drawing, or without drawing when the image is unavailable.
 */
async function renderImage(
	ctx: CanvasRenderingContext2D,
	annotation: AnnotationRegion,
	x: number,
	y: number,
	width: number,
	height: number,
	assets?: AnnotationRenderAssets,
	scaleFactor = 1
): Promise<void> {
	const source = getAnnotationImageContent(annotation);
	if (!source) {
		return;
	}

	const img = assets?.imageCache.get(source) ?? (await loadAnnotationImage(source));
	if (!img) {
		return;
	}

	const imgAspect = img.width / img.height;
	const boxAspect = width / height;

	let drawWidth = width;
	let drawHeight = height;
	let drawX = x;
	let drawY = y;

	if (imgAspect > boxAspect) {
		drawHeight = width / imgAspect;
		drawY = y + (height - drawHeight) / 2;
	} else {
		drawWidth = height * imgAspect;
		drawX = x + (width - drawWidth) / 2;
	}

	// Clip the annotation box, matching the object-contain DOM image preview.
	ctx.save();
	ctx.beginPath();
	ctx.roundRect(
		x,
		y,
		width,
		height,
		Math.max(
			0,
			Number.isFinite(annotation.style.borderRadius) ? annotation.style.borderRadius : 0
		) * scaleFactor
	);
	ctx.clip();
	ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
	ctx.restore();
}

/**
 * Composite active annotations and scene-sampling effects over a rendered frame.
 * @param ctx - Destination frame context.
 * @param annotations - Timed annotation regions.
 * @param canvasWidth - Destination width.
 * @param canvasHeight - Destination height.
 * @param currentTimeMs - Current timeline timestamp.
 * @param scaleFactor - Scale from reference pixels to output pixels.
 * @param assets - Preloaded image assets.
 * @param sceneTransform - Scene zoom and translation.
 * @param coordinateRect - Recording rectangle within the output.
 * @returns A promise resolved when active annotations have been drawn.
 */
export async function renderAnnotations(
	ctx: CanvasRenderingContext2D,
	annotations: AnnotationRegion[],
	canvasWidth: number,
	canvasHeight: number,
	currentTimeMs: number,
	scaleFactor: number = 1.0,
	assets?: AnnotationRenderAssets,
	sceneTransform?: AnnotationSceneTransform,
	coordinateRect?: AnnotationCoordinateRect
): Promise<void> {
	const activeAnnotations = resolveDisplayAnnotations(annotations, currentTimeMs);

	const sortedAnnotations = [...activeAnnotations].sort((a, b) => a.zIndex - b.zIndex);
	const annotationRect = coordinateRect ?? {
		x: 0,
		y: 0,
		width: canvasWidth,
		height: canvasHeight
	};

	for (const annotation of sortedAnnotations) {
		const rect = transformAnnotationRect(
			{
				x: annotationRect.x + (annotation.position.x / 100) * annotationRect.width,
				y: annotationRect.y + (annotation.position.y / 100) * annotationRect.height,
				width: (annotation.size.width / 100) * annotationRect.width,
				height: (annotation.size.height / 100) * annotationRect.height
			},
			sceneTransform
		);
		const { x, y, width, height } = rect;
		const effectiveScaleFactor = scaleFactor * (sceneTransform?.scale ?? 1);

    const centerX = x + width / 2, centerY = y + height / 2;
    const rotation = (annotation.rotation ?? 0) * Math.PI / 180;
    ctx.save();
    const motion = getAnnotationMotion(annotation, currentTimeMs);
    ctx.globalAlpha *= motion.opacity;
    // 聚焦的动画覆盖整个画幅；其他注释的擦除只作用于自身显示框。
    if (motion.reveal < 1 && annotation.type === 'focus') { ctx.beginPath(); ctx.rect(0, 0, canvasWidth * motion.reveal, canvasHeight); ctx.clip(); }
    ctx.translate(centerX, centerY + motion.y * height); ctx.rotate(rotation); ctx.scale(motion.scale, motion.scale); ctx.translate(-centerX, -centerY);
    if (motion.reveal < 1 && annotation.type !== 'focus') { ctx.beginPath(); ctx.rect(x, y, width * motion.reveal, height); ctx.clip(); }
    try {
		switch (annotation.type) {
			case "keystroke":
				ctx.save(); ctx.translate(x, y); drawKeycaps(ctx, annotation, width, height, effectiveScaleFactor); ctx.restore();
				break;
			case "text":
				renderText(ctx, annotation, x, y, width, height, effectiveScaleFactor);
				break;

			case "image":
				await renderImage(ctx, annotation, x, y, width, height, assets, effectiveScaleFactor);
				break;

			case "figure":
				await renderStickerArrow(ctx, annotation, x, y, width, height, assets);
				break;

      case "focus": {
        const layer = getBlurBufferCanvas(); if (!layer) break; layer.width = canvasWidth; layer.height = canvasHeight;
        const mask = layer.getContext('2d')!;
        mask.fillStyle = `rgba(0,0,0,${(annotation.blurIntensity ?? 60) / 100})`; mask.fillRect(0, 0, canvasWidth, canvasHeight);
        // 仅透明孔跟随对象变换，外围遮罩始终覆盖完整画幅。
        mask.setTransform(ctx.getTransform()); mask.translate(x, y); mask.globalCompositeOperation = 'destination-out';
        mask.beginPath(); mask.rect(0, 0, width, height); mask.clip();
        mask.fillStyle = '#000'; mask.fill(getAnnotationMaskPath(annotation.style, width, height, (annotation.style.borderRadius ?? 0) * effectiveScaleFactor));
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(layer, 0, 0);
        layer.width = 0; layer.height = 0;
        break;
      }
      case "mosaic":
      case "blur": {
        const buffer = getBlurBufferCanvas();
        if (!buffer) break;
        const block = Math.max(4, (annotation.blurIntensity ?? 20) * effectiveScaleFactor / 2);
        const mosaic = annotation.type === 'mosaic';
        buffer.width = mosaic ? Math.max(1, Math.ceil(canvasWidth / block)) : canvasWidth;
        buffer.height = mosaic ? Math.max(1, Math.ceil(canvasHeight / block)) : canvasHeight;
        const sample = buffer.getContext('2d');
        if (sample && width > 0 && height > 0) {
          // 采样已合成场景，旋转仅改变裁剪区域，不旋转区域里的源画面。
          sample.drawImage(ctx.canvas, 0, 0, buffer.width, buffer.height);
          ctx.translate(x, y);
          ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
          ctx.clip(getAnnotationMaskPath(annotation.style, width, height, (annotation.style.borderRadius ?? 0) * effectiveScaleFactor));
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.imageSmoothingEnabled = !mosaic;
          if (!mosaic) ctx.filter = `blur(${(annotation.blurIntensity ?? BLUR_ANNOTATION_STRENGTH) * effectiveScaleFactor}px)`;
          ctx.drawImage(buffer, 0, 0, canvasWidth, canvasHeight);
        }
        // 共享画布只复用身份，当前帧结束立即释放像素缓冲。
        buffer.width = 0; buffer.height = 0;
        break;
      }
		}
    } finally { ctx.restore(); }
	}
}

/**
 * 为本次导出的单个注释生成静态纹理，场景采样效果由逐帧合成处理。
 * @param annotation 当前片段及样式。
 * @param width 纹理宽度。
 * @param height 纹理高度。
 * @param scaleFactor 作品尺寸倍率。
 * @param assets 当前导出预载图片。
 * @returns 静态画布，或需要完整场景合成时的 null。
 */
export async function renderAnnotationToCanvas(
	annotation: AnnotationRegion,
	width: number,
	height: number,
	scaleFactor: number = 1.0,
	assets?: AnnotationRenderAssets
): Promise<HTMLCanvasElement | null> {
	const canvasWidth = Math.max(1, Math.ceil(width));
	const canvasHeight = Math.max(1, Math.ceil(height));
	const canvas = document.createElement("canvas");
	canvas.width = canvasWidth;
	canvas.height = canvasHeight;

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return null;
	}

	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";

	switch (annotation.type) {
		case "keystroke":
			drawKeycaps(ctx, annotation, canvasWidth, canvasHeight, scaleFactor);
			break;
		case "text":
			renderText(ctx, annotation, 0, 0, canvasWidth, canvasHeight, scaleFactor);
			break;

		case "image":
			await renderImage(ctx, annotation, 0, 0, canvasWidth, canvasHeight, assets, scaleFactor);
			break;

		case "figure":
			await renderStickerArrow(ctx, annotation, 0, 0, canvasWidth, canvasHeight, assets);
			break;
		case "focus":
		case "mosaic":
		case "blur":
			// Scene-sampling effects annotations must sample already-rendered scene pixels,
			// so they cannot be rasterized as standalone sprites.
			return null;
	}

	return canvas;
}
