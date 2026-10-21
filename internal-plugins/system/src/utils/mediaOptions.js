export const imageActions = [
  ['compress', '图片压缩'],
  ['convert', '格式转换'],
  ['resize', '修改尺寸'],
  ['watermark', '添加水印'],
  ['corner', '添加圆角'],
  ['border', '添加边框'],
  ['pad', '补边留白'],
  ['crop', '裁剪'],
  ['rotate', '旋转'],
  ['flip', '翻转'],
  ['merge', '合并为图片'],
  ['pdf', '合并为 PDF'],
  ['gif', '合并为 GIF'],
  ['manual', '手动裁剪']
]
export const videoActions = [
  ['compress', '视频压缩'],
  ['cut', '时长裁剪'],
  ['crop', '画面裁剪'],
  ['convert', '格式转换'],
  ['gif', '转为动图'],
  ['watermark', '添加水印'],
  ['resize', '修改尺寸'],
  ['thumbnail', '视频封面'],
  ['speed', '视频加速'],
  ['flip', '视频翻转'],
  ['rotate', '视频旋转'],
  ['merge', '视频合并'],
  ['audio', '音频处理'],
  ['frame', '帧提取']
]
/**
 * 创建统一参数控件的纯数据描述。
 * @param {string} key 参数名。
 * @param {string} label 控件名称。
 * @param {string} type 控件类型。
 * @param {object} extra 范围和选项。
 * @returns {object} 控件描述。
 */
const field = (key, label, type = 'number', extra = {}) => ({ key, label, type, ...extra })
/**
 * 返回与原插件功能分组一致的参数控件，不把编码器细节带入常规操作。
 * @param {string} media 媒体种类。
 * @param {string} mode 当前功能。
 * @returns {object[]} 可见参数描述。
 */
export function mediaFields(media, mode) {
  const image = media === 'image',
    dimensions = [
      field('width', '宽度', image ? 'text' : 'number'),
      field('height', '高度', image ? 'text' : 'number')
    ]
  switch (mode) {
    case 'compress':
      return image
        ? [
            field('quality', '压缩质量', 'range', { min: 1, max: 100 }),
            field('maxSize', '目标大小（KB，留空不限）')
          ]
        : [
            field('codec', '视频编码', 'select', {
              options: [
                ['h264', 'H.264（兼容）'],
                ['hevc', 'H.265（更小）']
              ]
            }),
            field('crf', '质量（CRF，越小越清晰）', 'range', { min: 0, max: 51 })
          ]
    case 'convert':
      return [
        field('format', '目标格式', 'select', {
          options: (image
            ? ['png', 'jpeg', 'webp', 'tiff', 'avif', 'gif', 'bmp', 'ico', 'svg']
            : ['mp4', 'mkv', 'mov', 'webm', 'avi', 'flv', 'wmv']
          ).map((x) => [x, x.toUpperCase()])
        })
      ]
    case 'resize':
      return [
        ...dimensions,
        ...(image
          ? [
              field('fit', '缩放方式', 'select', {
                options: [
                  ['inside', '自动等比缩放'],
                  ['contain', '完整显示（留白）'],
                  ['cover', '填满画面（裁边）'],
                  ['fill', '拉伸填满'],
                  ['outside', '至少覆盖']
                ]
              }),
              field('background', '留白颜色', 'color')
            ]
          : [])
      ]
    case 'crop':
    case 'manual':
      return image
        ? [...dimensions, field('left', '距离左边'), field('top', '距离顶部')]
        : [field('ratio', '裁剪比例（宽:高）', 'text')]
    case 'watermark':
      return [
        field('watermarkType', '水印类型', 'select', {
          options: [
            ['text', '文字'],
            ['image', '图片']
          ]
        }),
        field('text', '水印文本', 'text'),
        field('fontSize', '字体大小'),
        field('color', '字体颜色', 'color'),
        field('opacity', '透明度', 'range', { min: 1, max: 100 }),
        field('angle', '旋转角度'),
        field('position', '水印位置', 'select', {
          options: [
            ['center', '中间'],
            ['top', '顶部'],
            ['bottom', '底部'],
            ['left', '左边'],
            ['right', '右边'],
            ['left-top', '左上'],
            ['right-top', '右上'],
            ['left-bottom', '左下'],
            ['right-bottom', '右下']
          ]
        }),
        field('tile', '平铺水印', 'checkbox')
      ]
    case 'corner':
      return [field('radius', '圆角半径（px）')]
    case 'border':
      return [field('border', '边框宽度（px）'), field('background', '边框颜色', 'color')]
    case 'pad':
      return [
        field('top', '上边距'),
        field('bottom', '下边距'),
        field('left', '左边距'),
        field('right', '右边距'),
        field('background', '背景颜色', 'color')
      ]
    case 'rotate':
      return [field('angle', '旋转角度')]
    case 'flip':
      return [
        field('direction', '翻转方向', 'select', {
          options: [
            ['horizontal', '左右翻转'],
            ['vertical', '上下翻转']
          ]
        })
      ]
    case 'merge':
      return image
        ? [
            field('direction', '合并方向', 'select', {
              options: [
                ['vertical', '纵向'],
                ['horizontal', '横向']
              ]
            }),
            ...dimensions,
            field('gap', '图片间距'),
            field('margin', '页面边距'),
            field('background', '背景颜色', 'color')
          ]
        : [field('reencode', '重新编码（兼容不同视频）', 'checkbox')]
    case 'pdf':
      return [
        field('pageSize', '页面规格', 'select', {
          options: [
            ['A4', 'A4'],
            ['A3', 'A3'],
            ['LETTER', 'Letter'],
            ['auto', '跟随图片尺寸']
          ]
        }),
        field('margin', '页面边距')
      ]
    case 'gif':
      return image
        ? [
            ...dimensions,
            field('delay', '每帧间隔（毫秒）'),
            field('background', '背景颜色', 'color')
          ]
        : [
            field('format', '动图格式', 'select', {
              options: [
                ['gif', 'GIF'],
                ['webp', 'WebP']
              ]
            }),
            field('start', '开始位置（秒）'),
            field('duration', '片段时长（秒，留空全部）'),
            field('width', '动图宽度'),
            field('fps', '每秒帧数'),
            field('loop', '循环播放', 'checkbox')
          ]
    case 'cut':
      return [field('start', '开始位置（秒）'), field('duration', '片段时长（秒）')]
    case 'thumbnail':
      return []
    case 'speed':
      return [
        field('speed', '加速倍数', 'number', { min: 0.1, max: 16, step: 0.1 }),
        field('speedAudio', '音频同步加速', 'checkbox')
      ]
    case 'audio':
      return [
        field('audioMode', '处理方式', 'select', {
          options: [
            ['extract', '提取音频'],
            ['mute', '移除声音'],
            ['volume', '调整音量'],
            ['replace', '替换音轨']
          ]
        }),
        field('format', '输出音频格式', 'select', {
          options: ['mp3', 'aac', 'wav', 'flac', 'm4a'].map((x) => [x, x.toUpperCase()])
        }),
        field('volume', '音量倍数', 'number', { step: 0.1 }),
        field('start', '开始位置（秒）'),
        field('duration', '片段时长（秒，留空全部）')
      ]
    case 'frame':
      return [
        field('start', '开始位置（秒）'),
        field('interval', '提取间隔（秒）', 'number', { min: 0.01, step: 0.1 }),
        field('count', '最多提取帧数', 'number', { min: 1, max: 500 }),
        field('width', '图片宽度（留空原尺寸）')
      ]
    default:
      return []
  }
}
/**
 * 为每个功能保留独立的参数初值。
 * @param {string} media 媒体种类。
 * @param {string} mode 功能。
 * @returns {object} 纯数据参数。
 */
export function mediaDefaults(media, mode) {
  return {
    quality: 80,
    maxSize: '',
    format: mode === 'gif' ? 'gif' : mode === 'audio' ? 'mp3' : media === 'image' ? 'png' : 'mp4',
    width: ['gif', 'merge'].includes(mode) ? 800 : '',
    height: ['gif', 'merge'].includes(mode) ? 600 : '',
    fit: 'inside',
    background: '#ffffff',
    radius: 20,
    border: 4,
    top: mode === 'pad' ? 20 : 0,
    left: mode === 'pad' ? 20 : 0,
    right: 20,
    bottom: 20,
    angle: mode === 'rotate' ? 90 : 0,
    direction: mode === 'merge' ? 'vertical' : 'horizontal',
    gap: 8,
    margin: 12,
    pageSize: 'A4',
    delay: 300,
    watermarkType: 'text',
    text: '水印',
    fontSize: 28,
    color: '#059669',
    opacity: 50,
    position: 'right-bottom',
    tile: false,
    codec: 'h264',
    crf: 25,
    start: 0,
    duration: '',
    fps: 10,
    loop: true,
    speed: 2,
    speedAudio: true,
    reencode: true,
    audioMode: 'extract',
    volume: 1.5,
    interval: 1,
    count: 10
  }
}
