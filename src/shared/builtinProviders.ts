/** 内置能力的配置元数据，设置页与宿主共用稳定标识。 */
export interface BuiltinCapability {
  id: string
  label: string
  group: 'translation' | 'ocr' | 'formula' | 'image-host'
  description: string
  engine?: 'wechat' | 'latex' | 'bergamot'
  fields?: Array<{ key: string; label: string; secret?: boolean; multiline?: boolean }>
}

export const BUILTIN_CAPABILITIES: BuiltinCapability[] = [
  {
    id: 'builtin-bergamot',
    label: '离线翻译引擎',
    group: 'translation',
    engine: 'bergamot',
    description:
      '使用 Bergamot 在本机将英文翻译为中文，单次最多 1000 个字符。首次启用自动下载约 55 MB 资源，翻译内容无需联网。'
  },
  {
    id: 'builtin-baidu',
    label: '百度翻译',
    group: 'translation',
    description: '通过百度翻译开放平台进行多语言文本翻译，需填写应用凭据。',
    fields: [
      { key: 'appID', label: 'AppID' },
      { key: 'appKey', label: 'AppKey', secret: true }
    ]
  },
  {
    id: 'builtin-google',
    label: '谷歌翻译',
    group: 'translation',
    description: '通过 Google Translate 在线端点翻译文本，无需密钥；可用性取决于网络环境。'
  },
  {
    id: 'builtin-youdao',
    label: '有道翻译',
    group: 'translation',
    description: '通过有道智云文本翻译接口进行多语言翻译，需填写应用凭据。',
    fields: [
      { key: 'appKey', label: 'AppKey' },
      { key: 'appSecret', label: 'AppSecret', secret: true }
    ]
  },
  {
    id: 'builtin-microsoft',
    label: '微软翻译',
    group: 'translation',
    description: '通过 Microsoft Edge 在线翻译端点翻译文本，无需单独配置密钥。'
  },
  {
    id: 'builtin-ai-translation',
    label: 'AI 翻译',
    group: 'translation',
    description: '复用“AI”页已启用的模型与连接配置翻译文本，可自定义翻译提示词。',
    fields: [{ key: 'systemPrompt', label: '翻译提示词（支持 {from}、{to}）', multiline: true }]
  },
  {
    id: 'builtin-wechat-ocr',
    label: '离线OCR引擎',
    group: 'ocr',
    engine: 'wechat',
    description:
      '使用微信 OCR 运行组件在本机识别图片文字，并保留行级坐标。首次启用自动下载约 35 MB 资源。'
  },
  {
    id: 'builtin-ai-ocr',
    label: 'AI OCR',
    group: 'ocr',
    description: '直接复用“AI”页首个已启用且支持图片输入的模型识别文字，无需重复配置。'
  },
  {
    id: 'builtin-latex',
    label: '离线公式识别引擎',
    group: 'formula',
    engine: 'latex',
    description:
      '使用本地 ONNX 模型将公式图片转换为 LaTeX。首次启用自动下载约 264 MB 运行组件及模型。'
  },
  {
    id: 'builtin-ai-latex',
    label: 'AI 公式识别',
    group: 'formula',
    description: '复用“AI”页支持图片输入的模型，将图片中的数学公式转换为 LaTeX。',
    fields: [{ key: 'systemPrompt', label: '公式识别提示词', multiline: true }]
  },
  {
    id: 'builtin-image-host',
    label: '图片上传通道',
    group: 'image-host',
    description:
      '开启后，AI OCR 与 AI 公式识别先将图片上传至 img.scdn.io，再将链接交给模型；关闭时直接发送图片。默认关闭。'
  }
]

export const ONLINE_TRANSLATOR_IDS = [
  'builtin-baidu',
  'builtin-google',
  'builtin-youdao',
  'builtin-microsoft'
]

/**
 * 查找已声明的内置能力，拒绝不受支持的动态标识。
 * @param id 全局能力标识。
 * @returns 配置元数据，未找到时为 undefined。
 */
export function findBuiltinCapability(id: string): BuiltinCapability | undefined {
  return BUILTIN_CAPABILITIES.find((entry) => entry.id === id)
}

/**
 * 将旧插件保存的显式提供商标识路由到对应内置实现。
 * @param id 已保存的提供商标识。
 * @returns 对应内置标识，其他插件标识保持原样。
 */
export function resolveLegacyBuiltinProviderId(id: string): string {
  const aliases: Record<string, string> = {
    ocr: 'wechat-ocr',
    baidu: 'baidu',
    google: 'google',
    youdao: 'youdao',
    microsoft: 'microsoft',
    'ai-translation': 'ai-translation',
    'ai-ocr': 'ai-ocr'
  }
  const prefix = 'plugin:f-provider:'
  const mapped = id.startsWith(prefix) && aliases[id.slice(prefix.length)]
  return mapped ? 'builtin-' + mapped : id
}
