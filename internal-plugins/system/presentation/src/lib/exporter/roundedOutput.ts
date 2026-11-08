/**
 * 为最终输出增加背景圆角，复用一张所属导出画布，保留像素透明度。
 * @param source 已完成叠加的当前帧。
 * @param percent 相对画面短边的圆角百分比。
 * @param target 本次导出可复用的二维画布。
 * @returns 完成圆角遮罩的画布；零圆角直接返回原帧。
 */
export function roundOutputFrame(
  source: HTMLCanvasElement,
  percent: number,
  target: HTMLCanvasElement
): HTMLCanvasElement {
  if (!(percent > 0)) return source
  if (target.width !== source.width || target.height !== source.height) {
    target.width = source.width
    target.height = source.height
  }
  const context = target.getContext('2d')!
  const radius = (Math.min(source.width, source.height) * Math.min(50, percent)) / 100
  context.clearRect(0, 0, target.width, target.height)
  context.save()
  // 在所有画面、标注和人像叠加之后统一裁切，避免导出与预览边角不一致。
  context.beginPath()
  context.roundRect(0, 0, target.width, target.height, radius)
  context.clip()
  context.drawImage(source, 0, 0)
  context.restore()
  return target
}
