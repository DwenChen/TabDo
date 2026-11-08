import type { FigureData } from './types'
import { normalizeArrowStyle } from './arrowGeometry'

/**
 * 绘制六款卡通矢量箭头，使用统一深色描边、柔和投影和可调填充。
 * @param figure 已保存的形状、填充颜色和线宽。
 * @returns 独立定义作用域的三比一 SVG，供缩略图、预览和导出共用。
 */
export function buildArrowSvg(figure: Partial<FigureData> = {}): string {
  // 仅接受安全十六进制色值；完整物体共同应用透明度，避免残留描边。
  const rawColor = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(figure.color ?? '')
    ? figure.color!
    : '#ffffff'
  const hasAlpha = rawColor.length === 5 || rawColor.length === 9
  const color = hasAlpha ? rawColor.slice(0, rawColor.length === 5 ? 4 : 7) : rawColor
  const alphaHex = rawColor.length === 5 ? rawColor.at(-1)!.repeat(2) : rawColor.slice(-2)
  const opacity = hasAlpha ? Number.parseInt(alphaHex, 16) / 255 : 1
  const size = Math.max(1, Math.min(6, Number(figure.strokeWidth) || 4))
  const thickness = 5 + size * 1.1
  const style = normalizeArrowStyle(figure.arrowStyle)
  const defs = `<defs><filter id="shadow" x="-15%" y="-40%" width="130%" height="190%"><feDropShadow dx="0" dy="2.5" stdDeviation="1.8" flood-color="#101828" flood-opacity=".24"/></filter><linearGradient id="shine" x2="0" y2="1"><stop stop-color="white" stop-opacity=".44"/><stop offset=".45" stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity=".12"/></linearGradient></defs>`
  /**
   * 为轮廓添加统一卡通墨线与轻微体积感，避免不同外观的描边不一致。
   * @param path 当前箭头的封闭路径。
   * @returns 完整材质分组。
   */
  function outlined(path: string): string {
    return `<g filter="url(#shadow)" stroke-linejoin="round"><path d="${path}" fill="${color}" stroke="#17202c" stroke-width="3.5"/><path d="${path}" fill="url(#shine)"/></g>`
  }
  let body: string
  switch (style) {
    case 'line': {
      const path = 'M29 51Q118 47 266 49M243 27L268 49L244 73'
      body = `<g fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#shadow)"><path d="${path}" stroke="#17202c" stroke-width="${size + 7}"/><path d="${path}" stroke="${color}" stroke-width="${size + 2}"/></g>`
      break
    }
    case 'solid':
      body = outlined(
        `M28 ${50 - thickness}Q23 ${50 - thickness} 23 ${55 - thickness}V${45 + thickness}Q23 ${50 + thickness} 28 ${50 + thickness}H214L211 78Q211 83 218 79L278 53Q284 50 278 47L218 20Q211 17 211 22L214 ${50 - thickness}Z`
      )
      break
    case 'double':
      body = outlined(
        `M22 50L73 23Q78 20 78 26L76 ${50 - thickness}H224L222 26Q222 20 227 23L278 50L227 77Q222 80 222 74L224 ${50 + thickness}H76L78 74Q78 80 73 77Z`
      )
      break
    case 'dashed':
      body = outlined(
        [32, 77, 122, 167]
          .map(
            (x) =>
              `M${x + 4} ${50 - thickness}h22q5 0 5 5v${2 * thickness - 10}q0 5 -5 5h-22q-5 0 -5 -5v${10 - 2 * thickness}q0 -5 5 -5Z`
          )
          .join('') + 'M225 25Q222 22 222 27V73Q222 78 227 75L277 52Q281 50 277 48Z'
      )
      break
    case 'ribbon':
      body =
        outlined(`M27 ${37 - size}H217V22L277 50L217 78V${63 + size}H27L40 50Z`) +
        `<path d="M27 ${63 + size}L48 78V${63 + size}Z" fill="${color}" stroke="#17202c" stroke-width="2.6" stroke-linejoin="round"/><path d="M27 ${63 + size}L48 78V${63 + size}Z" fill="black" opacity=".17"/>`
      break
    default:
      body = outlined(
        `M25 63Q112 ${18 - size} 216 43L209 21Q208 18 213 20L279 46Q285 48 279 52L224 80Q219 83 220 78L225 61Q127 ${36 + size} 30 77Q24 78 25 72Z`
      )
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300" viewBox="0 0 300 100">${defs}<g opacity="${opacity}">${body}</g></svg>`
}

/**
 * 将矢量材质编码为安全图片源，确保预览与 Canvas 导出一致。
 * @param figure 箭头外观参数。
 * @returns 不依赖外部资源的 SVG data URL。
 */
export function getArrowImageSource(figure: Partial<FigureData> = {}): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildArrowSvg(figure))}`
}
