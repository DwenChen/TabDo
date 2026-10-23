export interface GuideStep {
  id: string
  chapter: string
  title: string
  location: string
  instruction: string
  expected: string
  tool?: string
  route?: string
  anchor?: string
  anchors?: string[]
  hostAnchor?: string
  sample?: string
  launch?: 'auto' | 'manual' | 'panel'
  expectedState?: string
  configTargets?: Array<{ name: string; value?: string; pressed?: boolean }>
  native?: boolean
  check:
    | 'panel'
    | 'match'
    | 'shortcut'
    | 'copy'
    | 'panel-open'
    | 'panel-pinned'
    | 'clipboard-open'
    | 'selection'
    | 'clipboard-search'
    | 'clipboard-menu'
    | 'clipboard-favorite'
    | 'clipboard-favorites'
    | 'clipboard-floating'
    | 'note'
    | 'note-options'
    | 'note-color'
    | 'note-opacity'
    | 'note-create'
    | 'note-collapse'
    | 'note-expand'
    | 'native'
    | 'tool-config'
    | 'rename'
    | 'folder'
    | 'qr-result'
    | 'qr'
    | 'image'
    | 'video'
    | 'provider-tab'
    | 'provider-config'
    | 'provider-enable'
    | 'ocr-result'
    | 'formula-result'
    | 'ocr'
    | 'formula'
    | 'web'
    | 'finder'
    | 'finder-preview'
}

export const GUIDE_COPY_TEXT = 'TabDo 练习：先复制，再找到我。'
export const GUIDE_QR_TEXT = 'https://example.com/tabdo-qr-test'

/**
 * 补充章节名称，并为依赖剪贴板记录的步骤提供手动恢复素材。
 * @param chapter 用户可见的章节名称。
 * @param steps 本章按真实操作顺序排列的步骤。
 * @returns 带章节信息的课程步骤。
 */
function chapter(chapter: string, steps: Omit<GuideStep, 'chapter'>[]): GuideStep[] {
  return steps.map((step) => ({
    ...step,
    chapter,
    // 跳过复制后仍可亲手恢复前置内容；不直接写入剪贴板或伪造记录。
    ...(step.tool === 'clipboard'
      ? {
          sample: GUIDE_COPY_TEXT,
          instruction: `${step.instruction} 若练习记录缺失，先手动复制下方文字，再打开剪贴板。`
        }
      : {})
  }))
}

/** 每步要求真实操作结果；连续子步骤保留现场，跳过不计为完成。 */
export const GUIDE_STEPS: GuideStep[] = [
  ...chapter('上手与呼出', [
    {
      id: 'panel',
      title: '设置鼠标呼出方式',
      location: '设置 → 通用设置 → 超级面板',
      instruction: '展开高亮的触发方式，选择“长按鼠标中键”。这里的修改只保存在隔离练习配置中。',
      expected: '已保存“长按中键”，且长按时长大于 0',
      route: 'GeneralSetting',
      anchors: [
        '[data-guide="panel-trigger"] [data-option-value="middle-long"]',
        '[data-guide="panel-trigger"] .dropdown-trigger'
      ],
      check: 'panel'
    },
    {
      id: 'match',
      title: '认识复制后的内容匹配',
      location: '设置 → 剪贴板快捷匹配',
      instruction:
        '将“复制后匹配时限（秒）”改为 10，按 Tab 或点击输入框外保存。之后复制文字，再长按中键，超级面板会根据文字匹配可用操作。',
      expected: '复制后匹配时限已保存为 10 秒',
      route: 'GeneralSetting',
      anchors: ['#clipboard-quick-match input', '#clipboard-quick-match'],
      check: 'match'
    }
  ]),
  ...chapter('剪贴板完整体验', [
    {
      id: 'copy',
      title: '亲手复制练习文字',
      location: '右侧提示卡 → 练习文字',
      instruction:
        '在下方文字框中拖选整段文字，或点击文字框后按 Ctrl+A，再按 Ctrl+C。下一步会学习用中键打开工具。',
      expected: '系统剪贴板中出现完整的练习文字',
      sample: GUIDE_COPY_TEXT,
      launch: 'manual',
      check: 'copy'
    },
    {
      id: 'panel-open',
      title: '长按中键呼出超级面板',
      location: '桌面 → 长按鼠标中键',
      instruction:
        '将鼠标移到提示卡外，按住鼠标中键直到超级面板出现，再松开。本步需要你实际呼出面板。',
      expected: '真实超级面板已显示',
      launch: 'manual',
      anchor: '[data-guide="super-panel"]',
      check: 'panel-open'
    },
    {
      id: 'panel-pinned',
      title: '切回常用工具',
      location: '超级面板 → 左上角九宫格',
      instruction:
        '复制后面板可能显示匹配结果。点击左上角“返回固定列表”的九宫格按钮，找到“剪贴板”。已在固定列表时会直接确认。',
      expected: '固定工具列表中出现剪贴板入口',
      launch: 'manual',
      anchors: ['[title="返回固定列表"]', '[data-guide-command="clipboard"]'],
      check: 'panel-pinned'
    },
    {
      id: 'clipboard-open',
      title: '从面板选择剪贴板',
      location: '超级面板 → 剪贴板',
      instruction:
        '点击超级面板中的“剪贴板”，找到刚复制的练习文字。面板消失时，可再次长按中键呼出。本步不会替你打开工具。',
      expected: '剪贴板工具可见，并已载入练习文字',
      tool: 'clipboard',
      launch: 'panel',
      anchor: '[data-guide-command="clipboard"]',
      check: 'clipboard-open'
    },
    {
      id: 'selection',
      title: '选中一条历史记录',
      location: '剪贴板 → 练习文字记录',
      instruction:
        '单击练习文字记录，观察整行选中效果和勾选框。双击或按 Enter 会执行粘贴，这次先只做选择。',
      expected: '练习记录实际处于选中状态',
      tool: 'clipboard',
      launch: 'manual',
      anchor: '[data-content="TabDo 练习：先复制，再找到我。"]',
      check: 'selection'
    },
    {
      id: 'clipboard-search',
      title: '搜索刚复制的文字',
      location: '剪贴板 → 顶部搜索框',
      instruction:
        '按 Ctrl+F 聚焦顶部搜索框，输入“先复制”。确认结果中保留练习记录。搜索只筛选当前内容，不会删除历史。',
      expected: '搜索词包含“先复制”，且结果中保留练习记录',
      tool: 'clipboard',
      launch: 'manual',
      hostAnchor: '.titlebar .search-input, .plugin-header input, .search-input',
      check: 'clipboard-search'
    },
    {
      id: 'clipboard-menu',
      title: '打开记录的右键菜单',
      location: '剪贴板 → 练习记录 → 右键',
      instruction:
        '在练习文字记录上点击鼠标右键，查看“悬浮固定”“收藏”等操作。先保持菜单打开，下一步会实际保存收藏。',
      expected: '练习记录被选中，且右键菜单实际显示',
      tool: 'clipboard',
      launch: 'manual',
      anchors: [
        '[data-guide="clipboard-favorite-action"]',
        '[data-content="TabDo 练习：先复制，再找到我。"]'
      ],
      check: 'clipboard-menu'
    },
    {
      id: 'clipboard-favorite',
      title: '给记录添加收藏备注',
      location: '右键菜单 → 收藏 → 备注 → 确定',
      instruction:
        '点击“收藏”，在备注中输入“入门练习”，再点击“确定”。菜单关闭时可重新右键练习记录。引导会核对实际保存的收藏及备注。',
      expected: '练习文字与“入门练习”备注已保存到收藏',
      tool: 'clipboard',
      launch: 'manual',
      anchors: [
        '[data-guide="clipboard-favorite-dialog"] input',
        '[data-guide="clipboard-favorite-action"]',
        '[data-content="TabDo 练习：先复制，再找到我。"]'
      ],
      check: 'clipboard-favorite'
    },
    {
      id: 'clipboard-favorites',
      title: '在收藏分类找回内容',
      location: '剪贴板 → 收藏分类',
      instruction:
        '点击顶部“收藏”。确认练习文字和备注；若尚未收藏，先回“文本”分类右键该记录，收藏并填写“入门练习”，再切回收藏。',
      expected: '收藏分类已激活，并显示练习文字及备注',
      tool: 'clipboard',
      launch: 'manual',
      anchor: '[data-guide="clipboard-tab-favorite"]',
      check: 'clipboard-favorites'
    },
    {
      id: 'clipboard-floating',
      title: '把收藏文字悬浮到桌面',
      location: '收藏记录 → 悬浮按钮或右键 → 悬浮固定',
      instruction:
        '点击练习记录的悬浮按钮，或右键选择“悬浮固定”。观察独立便签窗口，接下来会继续编辑这张便签。',
      expected: '真实独立便签中出现练习文字',
      tool: 'clipboard',
      launch: 'manual',
      anchors: [
        '[data-guide="clipboard-float-action"]',
        '.float-btn',
        '[data-content="TabDo 练习：先复制，再找到我。"]'
      ],
      check: 'clipboard-floating'
    }
  ]),
  ...chapter('桌面便签完整体验', [
    {
      id: 'note',
      title: '编辑桌面便签',
      location: '独立便签 → 正文',
      instruction:
        '点击刚悬浮的便签正文，在末尾换行输入“你好 TabDo”。若前面跳过了悬浮，可用“恢复本步工具”创建便签。',
      expected: '便签正文实际包含“你好 TabDo”',
      tool: 'sticky-note',
      launch: 'manual',
      anchor: '#note',
      check: 'note'
    },
    {
      id: 'note-options',
      title: '打开便签外观菜单',
      location: '便签标题栏 → 更多',
      instruction: '点击标题栏“更多”，展开纸色、透明度、字号和贴靠屏幕边缘选项，先保持菜单打开。',
      expected: '便签外观菜单实际可见',
      tool: 'sticky-note',
      launch: 'manual',
      anchors: ['#note-options', '#note-more'],
      check: 'note-options'
    },
    {
      id: 'note-color',
      title: '换成天空蓝纸色',
      location: '便签更多 → 天空蓝',
      instruction: '点击“天空蓝”色块，观察纸张与标题栏同步变色。菜单收起时，可再次点击“更多”。',
      expected: '当前便签实际使用天空蓝纸色',
      tool: 'sticky-note',
      launch: 'manual',
      anchors: ['[data-note-color="#bdd7f3"]', '#note-more'],
      check: 'note-color'
    },
    {
      id: 'note-opacity',
      title: '调低纸张透明度',
      location: '便签更多 → 透明度',
      instruction: '拖动透明度滑块到 80% 以下，观察纸张透出桌面。菜单会保持清晰，调整后仍可编辑。',
      expected: '便签透明度实际低于或等于 80%',
      tool: 'sticky-note',
      launch: 'manual',
      anchors: ['#note-opacity', '#note-more'],
      check: 'note-opacity'
    },
    {
      id: 'note-create',
      title: '再新建一张便签',
      location: '便签标题栏 → 加号',
      instruction:
        '点击标题栏加号，或按 Ctrl+N，新建第二张便签。原便签保留，新窗口有独立的纸色与正文。',
      expected: '独立便签数量比本步开始时增加',
      tool: 'sticky-note',
      launch: 'manual',
      anchor: '#new-note',
      check: 'note-create'
    },
    {
      id: 'note-collapse',
      title: '拖到屏幕边缘收成色签',
      location: '便签标题栏 → 屏幕左侧边缘',
      instruction:
        '按住任意便签的标题栏，拖到屏幕左侧边缘后松开，再将鼠标移开，等待收成窄色签。没有收起时，检查更多菜单中“贴靠屏幕边缘”已勾选。',
      expected: '至少一张便签真实处于贴边折叠状态',
      tool: 'sticky-note',
      launch: 'manual',
      anchors: ['#note-header', '#note-dock-toggle'],
      check: 'note-collapse'
    },
    {
      id: 'note-expand',
      title: '展开刚才的色签',
      location: '屏幕边缘 → 便签色签',
      instruction:
        '点击刚收起的色签，让同一张便签重新展开，确认文字与外观仍在。以后也可以拖动色签调整位置，或拖回桌面取消贴边。',
      expected: '本步开始时折叠的同一张便签已展开',
      tool: 'sticky-note',
      launch: 'manual',
      anchor: '#note-dock-tab',
      check: 'note-expand'
    }
  ]),
  ...chapter('屏幕采集', [
    {
      id: 'screenshot',
      title: '框选并确认截图',
      location: '截图 → 框选 → 工具栏确认',
      instruction:
        '点击“打开截图”后提示会暂时让开。框选桌面的一小块区域，可在原生工具栏标注，再点击确认。取消会停在本步，可重新打开。',
      expected: '截图确认并返回有效图像',
      tool: 'screenshot',
      native: true,
      check: 'native'
    },
    {
      id: 'color',
      title: '读取并复制屏幕颜色',
      location: '屏幕取色 → 移动 → 确认',
      instruction:
        '点击“打开取色”，移动鼠标观察放大的像素与颜色值，选定后确认。颜色值会复制到系统剪贴板；取消不会算完成。',
      expected: '取色确认并返回有效颜色',
      tool: 'color-picker',
      native: true,
      check: 'native'
    }
  ]),
  ...chapter('文件整理', [
    {
      id: 'rename-config',
      title: '先预览重命名规则',
      location: '重命名 → 自动编号 → 前缀',
      instruction:
        '已带入两份练习文本。将“编号前缀”填写为“入门_”，观察文件列表的新名称预览；先不要执行。',
      expected: '编号前缀实际填写为“入门_”',
      tool: 'file-renamer',
      configTargets: [{ name: '编号前缀', value: '入门_' }],
      anchor: '.number-panel input[aria-label="编号前缀"]',
      check: 'tool-config'
    },
    {
      id: 'rename',
      title: '执行刚预览的重命名',
      location: '重命名 → 执行重命名',
      instruction:
        '核对新名称没有冲突，再点击“执行重命名”。引导会检查真实文件名称变化和两份原文件的内容保留情况。',
      expected: '练习文件名称改变且原内容完整保留',
      tool: 'file-renamer',
      launch: 'manual',
      anchor: '.action-bar',
      check: 'rename'
    },
    {
      id: 'folder',
      title: '核对预览并解散练习文件夹',
      location: '解散文件夹 → 预览 → 执行',
      instruction:
        '先查看“待解散文件夹”中的文件将移到哪里，再执行解散，把“练习文件.txt”移到上级。只有真实移动完成才会继续。',
      expected: '练习文件移到上级，原练习文件夹移除',
      tool: 'folder-break',
      anchor: '.break-page',
      check: 'folder'
    }
  ]),
  ...chapter('扫码与图片', [
    {
      id: 'qr-result',
      title: '选择图片并读取二维码',
      location: '扫码 → 选择图片',
      instruction:
        '选择桌面练习目录“图片”中的“练习图片.png”，或将其拖入。识别后先核对右侧结果，下一步再复制。',
      expected: '扫码工具显示练习网址',
      tool: 'qrcode-scan',
      anchor: '.qr-pick',
      check: 'qr-result'
    },
    {
      id: 'qr',
      title: '复制已经识别的网址',
      location: '扫码 → 复制内容',
      instruction: '核对右侧完整网址，再点击“复制内容”。本步只复制结果，不会替你打开网页。',
      expected: '屏幕结果与系统剪贴板均为练习网址',
      tool: 'qrcode-scan',
      launch: 'manual',
      anchor: '.qr-copy',
      check: 'qr'
    },
    {
      id: 'annotate-config',
      title: '在图片上添加标记',
      location: '图片标记 → 箭头或文字',
      instruction:
        '点击箭头、画笔或文字工具，在样例图片上实际画出标记；可用撤销修改。下一步会保存结果。',
      expected: '画布上已提交至少一个有效标记',
      tool: 'image-annotate',
      anchor: '#drawing-tools',
      check: 'tool-config'
    },
    {
      id: 'annotate',
      title: '保存标注后的图片',
      location: '图片标记 → 保存图片',
      instruction:
        '确认画面上的标记后点击保存，将结果保存到默认“练习输出”目录。会检测真实生成的图片。',
      expected: '练习目录产生新的非空图片',
      tool: 'image-annotate',
      launch: 'manual',
      anchor: '#save-image',
      check: 'image'
    }
  ]),
  ...chapter('图片与视频处理', [
    {
      id: 'resize-config',
      title: '设置图片的新尺寸',
      location: '图片处理 → 修改尺寸 → 按原图缩放 → 50%',
      instruction:
        '切换到“修改尺寸”，点击“按原图缩放”中的“50%”，观察宽高与预览缩小。本步保留 50%；正式使用时也可手动输入目标宽高。',
      expected: '宽度实际设置为原图的 50%',
      tool: 'image-batch',
      expectedState: 'resize',
      configTargets: [{ name: '宽度', value: '50%' }],
      anchors: [
        '.media-batch:not([data-mode="resize"]) [data-media-action="resize"]',
        '[aria-label="按原图缩放"] button:nth-child(2)',
        '[aria-label="常用尺寸"]'
      ],
      check: 'tool-config'
    },
    {
      id: 'resize',
      title: '生成缩小的图片',
      location: '图片处理 → 开始处理',
      instruction:
        '确认预览和输出目录后点击“开始处理”。完成后文件行会出现结果入口；引导会检查真实新图片。',
      expected: '生成新的非空尺寸处理图片',
      tool: 'image-batch',
      launch: 'manual',
      anchor: '.media-batch footer .primary',
      check: 'image'
    },
    {
      id: 'crop-config',
      title: '设置裁剪比例与范围',
      location: '裁剪图片 → 裁剪比例 → 裁剪框',
      instruction:
        '点击“1:1”比例，观察方形裁剪框；可以继续拖动框或四角调整构图，下一步再生成图片。',
      expected: '裁剪比例实际选择为 1:1',
      tool: 'image-manual-crop',
      expectedState: 'crop',
      configTargets: [{ name: '1:1', pressed: true }],
      anchor: '[aria-label="裁剪比例"] button:nth-child(3)',
      check: 'tool-config'
    },
    {
      id: 'crop',
      title: '生成裁剪后的图片',
      location: '裁剪图片 → 开始处理',
      instruction: '确认裁剪框保留了需要的部分，再点击“开始处理”，等待新裁剪文件发布。',
      expected: '练习目录生成新的裁剪图片',
      tool: 'image-manual-crop',
      launch: 'manual',
      anchor: '.media-batch footer .primary',
      check: 'image'
    },
    {
      id: 'merge-config',
      title: '安排图片合并布局',
      location: '合并图片 → 布局参数',
      instruction:
        '两张图片已经带入。将“合并方向”从纵向改为“横向”，查看预览中的并排布局；间距也可继续调整。',
      expected: '合并方向实际选择为横向',
      tool: 'image-merge',
      expectedState: 'merge',
      configTargets: [{ name: '合并方向', value: 'horizontal' }],
      anchor: '.media-parameters select[aria-label="合并方向"]',
      check: 'tool-config'
    },
    {
      id: 'merge',
      title: '输出合并图片',
      location: '合并图片 → 开始处理',
      instruction: '核对排列方向及顺序，点击“开始处理”，等待真实图片输出。',
      expected: '练习目录生成新的合并图片',
      tool: 'image-merge',
      launch: 'manual',
      anchor: '.media-batch footer .primary',
      check: 'image'
    },
    {
      id: 'video-config',
      title: '预览并设置视频裁剪',
      location: '视频处理 → 时长裁剪 → 起止范围',
      instruction:
        '切到“时长裁剪”，将“开始位置（秒）”设为 0、“片段时长（秒）”填为 1，预览三秒样片中最初的一秒。本步不录制屏幕。',
      expected: '实际设置为从 0 秒开始、裁剪 1 秒',
      tool: 'video-batch',
      expectedState: 'cut',
      configTargets: [
        { name: '开始位置（秒）', value: '0' },
        { name: '片段时长（秒）', value: '1' }
      ],
      anchors: [
        '.media-batch:not([data-mode="cut"]) [data-media-action="cut"]',
        '.media-parameters input[aria-label="片段时长（秒）"]',
        '.media-parameters'
      ],
      check: 'tool-config'
    },
    {
      id: 'video',
      title: '输出裁剪后的视频',
      location: '视频处理 → 开始处理',
      instruction: '确认起止范围后点击“开始处理”，等待完成并生成视频文件。',
      expected: '练习目录生成新的非空视频',
      tool: 'video-batch',
      launch: 'manual',
      anchor: '.media-batch footer .primary',
      check: 'video'
    }
  ]),
  ...chapter('录制体验', [
    {
      id: 'recorder-config',
      title: '选择录屏参数',
      location: '录屏 → 来源与录制选项',
      instruction:
        '保持全屏录制模式，选择要练习的屏幕，将“录屏倒计时”改为“5 秒”。建议关闭音频，下一步将录制真实画面。',
      expected: '录屏倒计时实际选择为 5 秒',
      tool: 'screen-recorder',
      configTargets: [{ name: '5秒', pressed: true }],
      anchor: '[aria-label="录屏倒计时"] button:nth-child(3)',
      check: 'tool-config'
    },
    {
      id: 'recorder',
      title: '开始录制，再亲手停止',
      location: '录屏 → 开始 → 控制条停止',
      instruction:
        '开始并等待倒计时，录几秒后通过可见控制条停止。画面写入练习目录；结束整个教学时清理练习文件。',
      expected: '录制停止并发布新的非空 MP4',
      tool: 'screen-recorder',
      launch: 'manual',
      anchor: '.recorder-page .primary',
      check: 'video'
    }
  ]),
  ...chapter('识别与服务配置', [
    {
      id: 'provider',
      title: '找到 OCR 提供商入口',
      location: '设置 → 提供商 → OCR',
      instruction:
        '点击顶部“OCR”页签。教学环境有明确演示标记，后台模拟固定结果，无需安装模型或填写密钥。',
      expected: '实际切换到 OCR 页签',
      route: 'Providers&tab=ai',
      anchor: '.providers-tabs',
      check: 'provider-tab'
    },
    {
      id: 'provider-enable',
      title: '启用文字识别教学接口',
      location: 'OCR → 微信离线OCR引擎 → 启用',
      instruction: '打开“微信离线OCR引擎”卡片的开关。这里只保存隔离练习设置，不下载或安装模型。',
      expected: '文字识别教学接口已保存为开启',
      route: 'Providers&tab=ocr',
      expectedState: 'ocr',
      anchor: '[data-provider="builtin-wechat-ocr"] label.toggle',
      check: 'provider-enable'
    },
    {
      id: 'provider-formula',
      title: '单独启用公式识别接口',
      location: 'OCR → 离线公式识别引擎 → 启用',
      instruction: '打开“离线公式识别引擎”卡片的开关。文字识别与公式识别是独立服务，需要分别配置。',
      expected: '公式识别教学接口已保存为开启',
      route: 'Providers&tab=ocr',
      expectedState: 'formula',
      anchor: '[data-provider="builtin-latex"] label.toggle',
      check: 'provider-enable'
    },
    {
      id: 'ocr-result',
      title: '读取文字识别结果',
      location: '文字识别 → 提供商 → 识别',
      instruction:
        '确认使用“微信离线OCR引擎”，点击“选择图片”，从桌面练习目录“图片”中选择“练习图片.png”，或将它拖入。选图后自动识别，观察可编辑结果；本次返回固定教学文字。缺少服务时可打开相关设置启用，再回工具刷新配置。',
      expected: '识别文字及新的历史记录已出现',
      tool: 'recognize',
      anchors: ['.image-actions .file-button', '.provider-toolbar'],
      check: 'ocr-result'
    },
    {
      id: 'ocr',
      title: '复制识别文字',
      location: '文字识别 → 复制结果',
      instruction: '检查或编辑识别文字，再点击“复制结果”。本步核对可见结果与系统剪贴板一致。',
      expected: '当前识别结果已实际复制',
      tool: 'recognize',
      launch: 'manual',
      anchor: '.result-actions .primary',
      check: 'ocr'
    },
    {
      id: 'formula-result',
      title: '查看公式与 LaTeX 源码',
      location: '公式识别 → 提供商 → 识别',
      instruction:
        '选择“离线公式识别引擎”，点击“选择图片”，从桌面练习目录“图片”中选择“练习图片.png”，或将它拖入。观察教学接口返回的公式预览和 LaTeX 源码；缺少服务时可打开相关设置启用，再回工具刷新配置。',
      expected: '公式预览、源码及新的识别历史均出现',
      tool: 'latex-recognize',
      anchors: ['.formula-preview', '.image-actions .file-button', '.provider-toolbar'],
      check: 'formula-result'
    },
    {
      id: 'formula',
      title: '复制公式源码',
      location: '公式识别 → 复制结果',
      instruction: '点击“复制结果”，将 LaTeX 源码写入剪贴板。公式预览用于核对显示效果。',
      expected: '当前 LaTeX 源码已实际复制',
      tool: 'latex-recognize',
      launch: 'manual',
      anchor: '.result-actions .primary',
      check: 'formula'
    },
    {
      id: 'translation',
      title: '保存翻译服务参数',
      location: '提供商 → 翻译 → 谷歌翻译 → 服务配置',
      instruction:
        '将目标语言改为“英语”，再点击这张卡片的“保存配置”。识别工具翻译按钮共用此服务；本步不发送翻译请求。',
      expected: '翻译页签中谷歌目标语言已保存为英语',
      route: 'Providers&tab=translation',
      anchor: '#builtin-google-to',
      check: 'provider-config'
    }
  ]),
  ...chapter('快开与文件搜索', [
    {
      id: 'web',
      title: '配置网页快开站点',
      location: '网页快开 → 站点配置',
      instruction:
        '将一个现有网站的名称改为“TabDo 入门搜索”，保留原网址模板，再点击“保存设置”。本步只练习配置保存，不发起网页访问。',
      expected: '网站名称“TabDo 入门搜索”已实际保存',
      tool: 'web-quick-open',
      anchor: '.quick-open .site input[aria-label="网站名称"]',
      check: 'web'
    },
    {
      id: 'finder',
      title: '按图片分类搜索练习文件',
      location: '文件搜索 → 图片分类',
      instruction:
        '点击左侧“图片”。Everything 接口由教学脚本模拟，只列举本次练习目录，不安装软件或搜索其他文件。',
      expected: '图片分类激活，并返回练习图片',
      tool: 'local-search',
      anchor: '.finder-sidebar',
      check: 'finder'
    },
    {
      id: 'finder-preview',
      title: '选择文件并查看预览',
      location: '文件搜索 → 图片结果 → 文件预览',
      instruction:
        '单击练习图片，查看右侧预览。预览关闭时，使用界面上的预览开关展开。确认文件后再执行打开等操作。',
      expected: '图片结果实际选中，并显示预览内容',
      tool: 'local-search',
      launch: 'manual',
      anchors: ['.search-result', '.finder-preview-zoom'],
      check: 'finder-preview'
    }
  ]),
  ...chapter('按需设置', [
    {
      id: 'shortcut',
      title: '按需开启工具内快捷键',
      location: '设置 → 快捷键 → 内置快捷键 → Esc',
      instruction:
        '开启“Esc”对应的“关闭/隐藏当前插件”开关。应用快捷键初始全部关闭，正式使用时按需开启。练习开关不写回正式资料。',
      expected: 'Esc 开关已保存为开启',
      route: 'Shortcuts&tab=builtin',
      anchor: '[data-guide="shortcut-esc"]',
      check: 'shortcut'
    }
  ])
]
