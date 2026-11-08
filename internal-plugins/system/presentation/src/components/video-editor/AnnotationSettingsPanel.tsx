import { ToggleButton } from "@heroui/react";
import { Card } from "@heroui/react";
import { TextArea } from "@presentation/components/ui/input";
import {
	AlignCenterHorizontal as AlignCenter,
	AlignLeft,
	AlignRight,
	TextB as Bold,
	ImageSquare as ImageIcon,
	TextItalic as Italic,
	BoundingBox as SquareDashed,
	Trash as Trash2,
	TextT as Type,
	TextUnderline as Underline,
	UploadSimple as Upload,
} from "@presentation/components/ui/icons";
import { ColorControl, ColorPalette, ANNOTATION_COLOR_PALETTE } from "@presentation/components/ui/color-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@presentation/components/ui/toast";
import { Button } from "@presentation/components/ui/button";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@presentation/components/ui/select";
import { SliderControl } from "./SliderControl";
import { Slider } from "@presentation/components/ui/slider";
import { ChoiceGroup, ChoiceItem } from "@presentation/components/ui/choice-group";
import { ToggleGroup, ToggleGroupItem } from "@presentation/components/ui/toggle-group";
import { type CustomFont, getCustomFonts } from "@presentation/lib/customFonts";
import { cn } from "@presentation/lib/utils";
import { useScopedT } from "../../contexts/I18nContext";
import { AddCustomFontDialog } from "./AddCustomFontDialog";
import { ArrowPreview } from "./ArrowSvgs";
import { ARROW_STYLES, normalizeArrowStyle } from "./arrowGeometry";
import { AnnotationAnimationControls } from './AnnotationAnimationControls';
import type { AnnotationRegion, AnnotationType, FigureData } from "./types";

interface AnnotationSettingsPanelProps {
	annotation: AnnotationRegion;
	onRotationChange?: (rotation: number) => void;
	onContentChange: (content: string) => void;
	onTypeChange: (type: AnnotationType) => void;
	onStyleChange: (style: Partial<AnnotationRegion["style"]>) => void;
	onFigureDataChange?: (figureData: FigureData) => void;
	onBlurIntensityChange?: (intensity: number) => void;
	onBlurColorChange?: (color: string) => void;
}

export const FONT_FAMILY_VALUES = [
	{ value: "system-ui, -apple-system, sans-serif", labelKey: "fontStyles.classic" },
	{ value: "Georgia, serif", labelKey: "fontStyles.editor" },
	{ value: "Impact, Arial Black, sans-serif", labelKey: "fontStyles.strong" },
	{ value: "Courier New, monospace", labelKey: "fontStyles.typewriter" },
	{ value: "Brush Script MT, cursive", labelKey: "fontStyles.deco" },
	{ value: "Arial, sans-serif", labelKey: "fontStyles.simple" },
	{ value: "Verdana, sans-serif", labelKey: "fontStyles.modern" },
	{ value: "Trebuchet MS, sans-serif", labelKey: "fontStyles.clean" },
];

export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96, 128];

/**
 * Render the current editor values with synchronized timeline interactions.
 * @param props - Current state and editing callbacks.
 * @returns The interactive editor component.
 */
export function AnnotationSettingsPanel({
	annotation,
	onContentChange,
	onRotationChange,
	onTypeChange,
	onStyleChange,
	onFigureDataChange,
	onBlurIntensityChange,
}: AnnotationSettingsPanelProps) {
	const t = useScopedT("editor");
	const effectLabel = annotation.type === "focus" ? "遮罩强度" : annotation.type === "mosaic" ? "像素大小" : "模糊强度";
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);

	const fontFamilies = useMemo(
		() => FONT_FAMILY_VALUES.map((f) => ({ value: f.value, label: t(f.labelKey) })),
		[t],
	);

	// Load custom fonts on mount
	useEffect(() => {
		setCustomFonts(getCustomFonts());
	}, []);

	const colorPalette = ANNOTATION_COLOR_PALETTE;

	const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = event.target.files;
		if (!files || files.length === 0) return;

		const file = files[0];

		// Validate file type
		const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
		if (!validTypes.includes(file.type)) {
			toast.error(t("annotations.imageUploadError"), {
				description: t("annotations.imageUploadErrorDescription"),
			});
			event.target.value = "";
			return;
		}

		const reader = new FileReader();

		reader.onload = (e) => {
			const dataUrl = e.target?.result as string;
			if (dataUrl) {
				onContentChange(dataUrl);
				toast.success(t("annotations.imageUploadSuccess"));
			}
		};

		reader.onerror = () => {
			toast.error(t("annotations.imageUploadFailed"), {
				description: t("annotations.imageUploadFailedDescription"),
			});
		};

		reader.readAsDataURL(file);
		event.target.value = "";
	};

	return (
		<Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-none bg-transparent p-0 shadow-none">
			<div className="flex-1 inspector-scroll custom-scrollbar">
				<div className="mb-6">
					{/* Type Selector */}
					<div className="space-y-4">
						<ChoiceGroup
							aria-label="标注类型"
							value={annotation.type}
							onValueChange={(value) => onTypeChange(value as AnnotationType)}
							className="grid grid-cols-3 gap-2"
						>
							<ChoiceItem
								value="text"
								aria-label={t("annotations.text")}
								className="min-w-0 gap-1 px-1 text-xs"
							>
								<Type className="w-4 h-4" />
								{t("annotations.text")}
							</ChoiceItem>
							<ChoiceItem
								value="image"
								aria-label={t("annotations.image")}
								className="min-w-0 gap-1 px-1 text-xs"
							>
								<ImageIcon className="w-4 h-4" />
								{t("annotations.image")}
							</ChoiceItem>
							<ChoiceItem
								value="figure"
								aria-label={t("annotations.arrow")}
								className="min-w-0 gap-1 px-1 text-xs"
							>
								<svg
									className="w-4 h-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
								>
									<path
										d="M4 12h16m0 0l-6-6m6 6l-6 6"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
								{t("annotations.arrow")}
							</ChoiceItem>
							<ChoiceItem
								value="blur"
								aria-label={t("annotations.blur")}
								className="min-w-0 gap-1 px-1 text-xs"
							>
								<SquareDashed className="w-4 h-4" />
								{t("annotations.blur")}
							</ChoiceItem>
              <ChoiceItem value="mosaic" aria-label="马赛克" className="min-w-0 gap-1 px-1 text-xs">▦ 马赛克</ChoiceItem>
              <ChoiceItem value="focus" aria-label="聚焦" className="min-w-0 gap-1 px-1 text-xs">◉ 聚焦</ChoiceItem>
            </ChoiceGroup>

						{/* Text Content */}
						{(annotation.type === "text" || annotation.type === "keystroke") && (
							<div className="space-y-4">
								<div>
									<label className="text-sm font-medium text-foreground mb-2 block">
										{t("annotations.textContent")}
									</label>
									<TextArea
										value={annotation.textContent || annotation.content}
										onChange={(e) => onContentChange(e.target.value)}
										placeholder={t("annotations.textPlaceholder")}
										rows={3}
										className="w-full px-3 py-2 text-sm resize-none"
									/>
								</div>

								{/* Styling Controls */}
								<div className="space-y-4">
									{/* Font Family & Size */}
									<div className="grid grid-cols-2 gap-2">
										<div>
											<label className="text-sm font-medium text-foreground mb-2 block">
												{t("annotations.fontStyle")}
											</label>
											<Select
												value={annotation.style.fontFamily}
												onValueChange={(value) =>
													onStyleChange({ fontFamily: value })
												}
											>
												<SelectTrigger className="w-full h-9 text-xs">
													<SelectValue
														placeholder={t("annotations.selectStyle")}
													/>
												</SelectTrigger>
												<SelectContent className="max-h-[300px]">
													{!fontFamilies.some(
														(font) =>
															font.value ===
															annotation.style.fontFamily,
													) &&
														!customFonts.some(
															(font) =>
																font.fontFamily ===
																annotation.style.fontFamily,
														) && (
															<SelectItem
																value={annotation.style.fontFamily}
															>
																{annotation.style.fontFamily
																	.split(",")[0]
																	.replace(/"/g, "")}
															</SelectItem>
														)}
													{fontFamilies.map((font) => (
														<SelectItem
															key={font.value}
															value={font.value}
															style={{ fontFamily: font.value }}
														>
															{font.label}
														</SelectItem>
													))}
													{customFonts.length > 0 && (
														<>
															<div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">自定义字体</div>
															{customFonts.map((font) => (
																<SelectItem
																	key={font.id}
																	value={font.fontFamily}
																	style={{
																		fontFamily: font.fontFamily,
																	}}
																>
																	{font.name}
																</SelectItem>
															))}
														</>
													)}
												</SelectContent>
											</Select>
										</div>
										<div>
											<label className="text-sm font-medium text-foreground mb-2 block">
												{t("annotations.size")}
											</label>
											<Select
												value={annotation.style.fontSize.toString()}
												onValueChange={(value) =>
													onStyleChange({ fontSize: parseInt(value) })
												}
											>
												<SelectTrigger className="w-full h-9 text-xs">
													<SelectValue
														placeholder={t("annotations.size")}
													/>
												</SelectTrigger>
												<SelectContent className="max-h-[200px]">
													{FONT_SIZES.map((size) => (
														<SelectItem
															key={size}
															value={size.toString()}
														>
															{size}px
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>

									{/* Add Custom Font Button */}
									<div>
										<AddCustomFontDialog
											onFontAdded={(font) => {
												setCustomFonts(getCustomFonts());
												onStyleChange({ fontFamily: font.fontFamily });
											}}
										/>
									</div>

									{/* Formatting Toggles */}
									<div className="flex flex-wrap items-center justify-between gap-2">
										<ToggleGroup
											type="multiple"
											value={[
												...(annotation.style.fontWeight === "bold"
													? ["bold"]
													: []),
												...(annotation.style.fontStyle === "italic"
													? ["italic"]
													: []),
												...(annotation.style.textDecoration === "underline"
													? ["underline"]
													: []),
											]}
											size="sm"
											className="justify-start"
										>
											<ToggleGroupItem
												value="bold"
												aria-label={t("annotations.toggleBold")}
												onClick={() =>
													onStyleChange({
														fontWeight:
															annotation.style.fontWeight === "bold"
																? "normal"
																: "bold",
													})
												}
												className="h-8 w-8 min-w-8 p-0"
											>
												<Bold className="h-4 w-4" />
											</ToggleGroupItem>
											<ToggleGroupItem
												value="italic"
												aria-label={t("annotations.toggleItalic")}
												onClick={() =>
													onStyleChange({
														fontStyle:
															annotation.style.fontStyle === "italic"
																? "normal"
																: "italic",
													})
												}
												className="h-8 w-8 min-w-8 p-0"
											>
												<Italic className="h-4 w-4" />
											</ToggleGroupItem>
											<ToggleGroupItem
												value="underline"
												aria-label={t("annotations.toggleUnderline")}
												onClick={() =>
													onStyleChange({
														textDecoration:
															annotation.style.textDecoration ===
															"underline"
																? "none"
																: "underline",
													})
												}
												className="h-8 w-8 min-w-8 p-0"
											>
												<Underline className="h-4 w-4" />
											</ToggleGroupItem>
										</ToggleGroup>

										<ToggleGroup
											type="single"
											value={annotation.style.textAlign}
											size="sm"
											className="justify-start"
										>
											<ToggleGroupItem
												value="left"
												aria-label={t("annotations.alignLeft")}
												onClick={() => onStyleChange({ textAlign: "left" })}
												className="h-8 w-8 min-w-8 p-0"
											>
												<AlignLeft className="h-4 w-4" />
											</ToggleGroupItem>
											<ToggleGroupItem
												value="center"
												aria-label={t("annotations.alignCenter")}
												onClick={() =>
													onStyleChange({ textAlign: "center" })
												}
												className="h-8 w-8 min-w-8 p-0"
											>
												<AlignCenter className="h-4 w-4" />
											</ToggleGroupItem>
											<ToggleGroupItem
												value="right"
												aria-label={t("annotations.alignRight")}
												onClick={() =>
													onStyleChange({ textAlign: "right" })
												}
												className="h-8 w-8 min-w-8 p-0"
											>
												<AlignRight className="h-4 w-4" />
											</ToggleGroupItem>
										</ToggleGroup>
									</div>

									{/* Colors */}
									<div className="grid grid-cols-2 gap-4">
										<div>
											<label className="text-sm font-medium text-foreground mb-2 block">
												{t("annotations.textColor")}
											</label>
											<ColorControl
												value={annotation.style.color}
												label={t("annotations.textColor")}
												onChange={(color) => onStyleChange({ color })}
												colors={colorPalette}
												compact
											/>
										</div>
										<div>
											<label className="text-sm font-medium text-foreground mb-2 block">
												{t("annotations.background")}
											</label>
											<ColorControl
												value={annotation.style.backgroundColor}
												label={t("annotations.background")}
												onChange={(color) =>
													onStyleChange({ backgroundColor: color })
												}
												colors={colorPalette}
												compact
												onClear={() =>
													onStyleChange({
														backgroundColor: "transparent",
													})
												}
											/>
										</div>
									</div>
								</div>
							</div>
						)}

						{/* Image Upload */}
						{annotation.type === "image" && (
							<div className="space-y-4">
								<input
									type="file"
									ref={fileInputRef}
									onChange={handleImageUpload}
									accept=".jpg,.jpeg,.png,.gif,.webp,image/*"
									className="hidden"
								/>
								<Button
									onClick={() => fileInputRef.current?.click()}
									variant="outline"
									className="w-full gap-2 py-8"
								>
									<Upload className="w-5 h-5" />
									{t("annotations.uploadImage")}
								</Button>

								{annotation.content &&
									annotation.content.startsWith("data:image") && (
										<div className="rounded-lg border border-foreground/10 overflow-hidden bg-foreground/5 p-2">
											<img
												src={annotation.content || undefined}
												alt="已上传的注释图片"
												className="w-full h-auto rounded-md"
											/>
										</div>
									)}

								<p className="text-xs text-muted-foreground/70 text-center leading-relaxed">
									{t("annotations.supportedFormats")}
								</p>
							</div>
						)}


            <SliderControl label="旋转" value={annotation.rotation ?? 0} min={0} max={360} step={1}
              onChange={(rotation) => onRotationChange?.(rotation)} formatValue={(value) => `${Math.round(value)}°`} />

            {annotation.type === "figure" && (
              <div className="space-y-4">
                <section className="space-y-2">
                  <span className="inspector-section-title">箭头外观</span>
                  <ChoiceGroup aria-label="箭头外观" value={normalizeArrowStyle(annotation.figureData?.arrowStyle)}
                    onValueChange={(arrowStyle) => onFigureDataChange?.({ ...annotation.figureData!, arrowStyle: arrowStyle as FigureData['arrowStyle'] })}
                    className="grid grid-cols-2 gap-1.5">
                    {Object.entries(ARROW_STYLES).map(([value, label]) => (
                      <ChoiceItem key={value} value={value} aria-label={label} title={label} className="h-20 min-w-0 px-3 py-2" style={{ borderRadius: 8 }}>
                        <span className="block h-14 w-full"><ArrowPreview direction="right" color={annotation.figureData?.color ?? '#ffffff'} strokeWidth={5} arrowStyle={value as FigureData['arrowStyle']} /></span>
                      </ChoiceItem>
                    ))}
                  </ChoiceGroup>
                </section>
                <SliderControl label="线宽" value={annotation.figureData?.strokeWidth ?? 4} min={1} max={6} step={1}
                  onChange={(strokeWidth) => onFigureDataChange?.({ ...annotation.figureData!, strokeWidth })} formatValue={(value) => String(value)} />
                <ColorControl value={annotation.figureData?.color || '#ffffff'} label="箭头颜色" compact colors={colorPalette}
                  onChange={(color) => onFigureDataChange?.({ ...annotation.figureData!, color })} />
                <p className="inspector-description">填充颜色可调整，深色描边保证清晰；可在预览中调整尺寸和旋转。</p>
              </div>
            )}

						{["blur", "mosaic", "focus"].includes(annotation.type) && (
							<div className="space-y-4">
                  <span className="inspector-section-title">遮罩形状</span>
                  <ChoiceGroup aria-label="遮罩形状" className="grid grid-cols-3 gap-2" value={annotation.style.maskShape ?? 'rectangle'} onValueChange={maskShape => onStyleChange({ maskShape: maskShape as 'rectangle' | 'ellipse' | 'brush' })}>
                    <ChoiceItem value="rectangle">矩形</ChoiceItem><ChoiceItem value="ellipse">圆形</ChoiceItem><ChoiceItem value="brush">手绘涂抹</ChoiceItem>
                  </ChoiceGroup>
                  {annotation.style.maskShape === 'brush' && <>
                    <SliderControl label="笔刷大小" value={annotation.style.maskBrushSize ?? 16} min={4} max={60} step={1} onChange={maskBrushSize => onStyleChange({ maskBrushSize })} formatValue={v => `${v}%`} />
                    <p className="inspector-description">在预览中选择该注释，点击“涂抹遮罩”后绘制；每一笔支持撤销，Esc 取消当前笔画。</p>
                    <Button size="sm" variant="ghost" onClick={() => onStyleChange({ maskStrokes: [] })}>清空笔画</Button>
                  </>}
								<div className="flex flex-col items-center">
									<div className="w-full space-y-5">
										<div className="flex items-center justify-between">
											<span className="text-sm font-medium text-foreground">
												{`${effectLabel} ${annotation.blurIntensity ?? 20}`}
											</span>
										</div>
										<Slider
											aria-label={effectLabel}
											value={[annotation.blurIntensity ?? 20]}
											onValueChange={([value]) =>
												onBlurIntensityChange?.(value)
											}
											min={1}
											max={100}
											step={1}
											className="w-full"
										/>
									</div>

								</div>
							</div>
						)}
					</div>

					{["focus", "blur", "image", "mosaic"].includes(annotation.type) && <div className="space-y-3 mt-4"><label className="text-sm font-medium">圆角 {annotation.style.borderRadius ?? 0}</label><Slider aria-label="注释圆角" value={[annotation.style.borderRadius ?? 0]} min={0} max={200} step={1} onValueChange={([value]) => onStyleChange({ borderRadius: value })} /></div>}
          <div className="mt-5"><AnnotationAnimationControls style={annotation.style} onChange={onStyleChange} /></div>
				</div>
			</div>
		</Card>
	);
}
