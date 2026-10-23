<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  imageActions,
  videoActions,
  mediaFields,
  mediaDefaults,
  sizePresets,
  cropRatios
} from '@/utils/mediaOptions'
import MediaIcon from './MediaIcon.vue'
const props = defineProps({
  action: { type: Object, required: true },
  media: { type: String, required: true }
})
const actions = computed(() => (props.media === 'image' ? imageActions : videoActions))
const mode = ref(
  props.action.code === 'image-manual-crop'
    ? 'crop'
    : props.action.code === 'image-merge'
      ? 'merge'
      : 'compress'
)
const state = reactive({}),
  items = ref([]),
  selected = ref(''),
  busy = ref(false),
  reading = ref(false),
  message = ref(''),
  output = ref(
    window.tabdo.dbStorage.getItem('media-output-' + props.media) ||
      window.tabdo.getPath('downloads')
  ),
  outputMode = ref(
    window.tabdo.dbStorage.getItem('media-output-mode-' + props.media) === 'custom'
      ? 'custom'
      : 'source'
  ),
  settings = ref(false),
  imageInput = ref(''),
  progress = ref(''),
  viewer = ref(null),
  manualPreview = ref(''),
  effectPreview = ref(null),
  previewError = ref(''),
  previewBusy = ref(false),
  showOriginal = ref(false),
  previewTime = ref(0),
  playerFailed = ref(false),
  player = ref(null)
const videoUrl = computed(() =>
  active.value ? window.toolsProvider.fileUrl(active.value.path) : ''
)
watch(
  mode,
  (value) => {
    state[value] ||= mediaDefaults(props.media, value)
  },
  { immediate: true, flush: 'sync' }
)
const parameters = computed(() => state[mode.value])
const fields = computed(() =>
  mediaFields(props.media, mode.value).filter(
    (field) =>
      !(mode.value === 'crop') &&
      !(
        mode.value === 'watermark' &&
        parameters.value.watermarkType === 'image' &&
        ['text', 'fontSize', 'color'].includes(field.key)
      ) &&
      !(
        mode.value === 'audio' &&
        ((field.key === 'format' && parameters.value.audioMode !== 'extract') ||
          (field.key === 'volume' && parameters.value.audioMode !== 'volume'))
      )
  )
)
const active = computed(() => items.value.find((x) => x.path === selected.value) || items.value[0])
const canRun = computed(() => items.value.some((x) => !x.error) && !busy.value && !reading.value)
let disposed = false,
  controller,
  previewController,
  previewVersion = 0,
  previewPending = Promise.resolve(),
  readingController,
  readingPending = Promise.resolve(),
  disposal,
  version = 0,
  dragStart,
  previewTimer,
  sourcePath = '',
  pendingReads = 0
const cropping = computed(() => mode.value === 'crop')
const spatialVideo = computed(() =>
  ['crop', 'resize', 'rotate', 'flip', 'watermark'].includes(mode.value)
)
watch(
  [
    mode,
    () => active.value?.path,
    () => items.value.length,
    () => JSON.stringify(parameters.value),
    previewTime,
    playerFailed,
    busy
  ],
  () => {
    clearTimeout(previewTimer)
    previewVersion++
    previewController?.abort()
    effectPreview.value = null
    previewError.value = ''
    if (sourcePath !== active.value?.path) {
      manualPreview.value = ''
      sourcePath = ''
    }
    if (active.value && !active.value.error && !busy.value)
      previewTimer = setTimeout(() => {
        void preview(active.value.path, true)
      }, 250)
  }
)
watch([cropping, () => active.value?.path], () => {
  if (cropping.value && active.value?.width) applyCropRatio(parameters.value.cropRatio || '自由')
  previewTime.value = 0
})
watch(
  () => active.value?.path,
  () => {
    playerFailed.value = false
  }
)
watch([mode, () => JSON.stringify(parameters.value)], () => {
  if (!busy.value) message.value = ''
})

/**
 * 将常用画布组合填入尺寸，并选择完整显示或填满的明确缩放方式。
 * @returns {void} 无返回值。
 */
function applySizePreset() {
  const preset = sizePresets.find((item) => item[0] === parameters.value.sizePreset)
  if (!preset?.[2]) return
  parameters.value.width = preset[2]
  parameters.value.height = preset[3]
  parameters.value.fit = 'contain'
}
/**
 * 按原图百分比缩放，另一边由编码器保持比例。
 * @param {number} scale 目标百分比。
 * @returns {void} 无返回值。
 */
function applyScale(scale) {
  parameters.value.width = scale + '%'
  parameters.value.height = ''
  parameters.value.sizePreset = 'custom'
}
/**
 * 使用当前文件居中建立指定比例的最大裁剪框。
 * @param {string} ratio 比例预选。
 * @returns {void} 无返回值。
 */
function applyCropRatio(ratio) {
  if (!active.value?.width) return
  const item = active.value,
    p = parameters.value
  p.cropRatio = ratio
  const parts = ratio.split(':').map(Number)
  const aspect = parts.length === 2 ? parts[0] / parts[1] : item.width / item.height
  const width = Math.min(item.width, item.height * aspect),
    height = width / aspect
  p.region = {
    x: (1 - width / item.width) / 2,
    y: (1 - height / item.height) / 2,
    width: width / item.width,
    height: height / item.height
  }
}
/**
 * 将时间轴位置同步到播放器，不自动启动播放。
 * @returns {void} 无返回值。
 */
function seekPreview() {
  if (player.value) player.value.currentTime = Number(previewTime.value)
}
/**
 * 以当前播放位置设置截取起点或终点，并保留有效时间区间。
 * @param {boolean} end 是否设置终点。
 * @returns {void} 无返回值。
 */
function markTime(end = false) {
  const time = Math.min(
    active.value.duration - 0.01,
    player.value?.currentTime ?? Number(previewTime.value)
  )
  const p = parameters.value
  if (end && time <= Number(p.start || 0)) {
    message.value = '终点需要晚于起点'
    return
  }
  if (end) p.duration = +(time - Number(p.start || 0)).toFixed(2)
  else {
    p.start = +time.toFixed(2)
    p.duration = ''
  }
  message.value = ''
}

/**
 * 用独立读图任务生成有界预览，不保留大原图或未释放的对象 URL。
 * @param {string} file 待预览的文件。
 * @param {boolean} manual 是否更新常驻处理预览，否则打开大图。
 * @returns {Promise<void>} 预览加载后的 Promise。
 */
async function preview(file, manual = false) {
  if (disposed) return
  previewController?.abort()
  const request = ++previewVersion
  const cancellation = new AbortController()
  previewController = cancellation
  const selectedFile = active.value?.path
  const operation = mode.value
  const params = JSON.parse(JSON.stringify(parameters.value))
  const files =
    operation === 'merge' && props.media === 'image' ? items.value.map((item) => item.path) : [file]
  const previous = previewPending
  let complete
  previewPending = new Promise((resolve) => {
    complete = resolve
  })
  try {
    // 等旧进程关闭后再启动最新预览，快速切换最多保留一个实际读图进程。
    await previous
    if (disposed || cancellation.signal.aborted) return
    if (props.media === 'video' && !manual) {
      viewer.value = { url: window.toolsProvider.fileUrl(file), title: file, video: true }
      return
    }
    previewBusy.value = true
    const result =
      sourcePath === file && manualPreview.value && manual
        ? [{ thumbnail: manualPreview.value }]
        : props.media === 'video'
          ? [{ thumbnail: active.value.thumbnail }]
          : await window.toolsMedia.run(
              {
                action: 'inspect',
                media: 'image',
                files: file === '@clipboard' ? [] : [file],
                image: files.includes('@clipboard') ? imageInput.value : undefined,
                preview: true
              },
              cancellation.signal
            )
    if (
      disposed ||
      request !== previewVersion ||
      cancellation.signal.aborted ||
      !result[0]?.thumbnail
    )
      return
    if (manual) {
      if (selectedFile !== active.value?.path) return
      manualPreview.value = result[0].thumbnail
      sourcePath = file
      if (props.media === 'video' && !spatialVideo.value && !playerFailed.value) return
      if (operation === 'resize' && !params.width && !params.height) return
      if (operation === 'thumbnail' && !params.cover) return
      if (operation === 'watermark') params.watermark = await makeWatermark(params)
      if (cancellation.signal.aborted || disposed) return
      const effect = await window.toolsMedia.run(
        {
          action: 'preview',
          media: props.media,
          files: files.filter((x) => x !== '@clipboard'),
          image: files.includes('@clipboard') ? imageInput.value : undefined,
          mode: operation,
          params: { ...params, previewTime: previewTime.value },
          preview: true
        },
        cancellation.signal
      )
      if (!disposed && !cancellation.signal.aborted && request === previewVersion)
        effectPreview.value = effect[0]
    } else viewer.value = { url: result[0].thumbnail, title: result[0].name }
  } catch (error) {
    if (!disposed && !cancellation.signal.aborted && request === previewVersion)
      previewError.value = error.message
  } finally {
    if (previewController === cancellation) previewController = null
    complete()
    if (request === previewVersion) previewBusy.value = false
  }
}

/**
 * 选择一组普通媒体文件或图片文件夹。
 * @param {boolean} directory 是否递归读取文件夹。
 * @returns {void} 无返回值。
 */
function choose(directory = false) {
  const paths = window.tabdo.showOpenDialog({
    title: directory ? '读取文件夹' : '添加文件',
    properties: directory ? ['openDirectory'] : ['openFile', 'multiSelections'],
    filters: directory
      ? undefined
      : [
          {
            name: props.media === 'image' ? '图片' : '视频',
            extensions:
              props.media === 'image'
                ? ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'tiff', 'avif', 'heic', 'bmp', 'ico']
                : ['mp4', 'mkv', 'mov', 'webm', 'avi', 'flv', 'wmv', 'm4v', 'mpeg', 'ts']
          }
        ]
  })
  if (paths?.length) void add(paths)
}
/**
 * 在可取消的独立进程读取元数据，迟到结果不回填退出页面。
 * @param {string[]} files 用户选中的文件路径。
 * @returns {Promise<void>} 读取结束后的 Promise。
 */
async function add(files) {
  if (busy.value || disposed) return
  const current = version
  const image = imageInput.value
  const cancellation = new AbortController()
  const previous = readingPending
  let complete
  readingPending = new Promise((resolve) => {
    complete = resolve
  })
  reading.value = true
  pendingReads++
  try {
    // 连续添加串行排队，保留前一批选择；退出时才取消当前读取。
    await previous
    if (disposed || cancellation.signal.aborted || current !== version) return
    readingController = cancellation
    /**
     * 将流式读取的文件立即加入队列，同一路径只显示一次。
     * @param {object} item 文件元数据或错误。
     * @returns {void} 无返回值。
     */
    const append = (item) => {
      if (disposed || current !== version || cancellation.signal.aborted) return
      if (!items.value.some((row) => row.path === item.path)) items.value.push(item)
      selected.value ||= items.value[0]?.path || ''
    }
    const result = await window.toolsMedia.run(
      { action: 'inspect', media: props.media, files, image },
      cancellation.signal,
      (event) => {
        if (event.type === 'inspected') append(event.item)
      }
    )
    if (disposed || current !== version) return
    result.forEach(append)
    message.value = result.length ? '' : '未找到支持的媒体文件'
  } catch (error) {
    if (!disposed && !cancellation.signal.aborted && current === version)
      message.value = error.message
  } finally {
    if (readingController === cancellation) readingController = null
    complete()
    pendingReads--
    if (!disposed) reading.value = pendingReads > 0
  }
}
/**
 * 接收拖入的本地文件，编码路径由宿主预加载转换。
 * @param {DragEvent} event 拖入事件。
 * @returns {void} 无返回值。
 */
function drop(event) {
  void add(
    [...event.dataTransfer.files].map((file) => window.toolsProvider.filePath(file)).filter(Boolean)
  )
}
/**
 * 为水印或封面选择辅助图片/音频。
 * @param {string} key 参数字段。
 * @returns {void} 无返回值。
 */
function chooseAsset(key) {
  const paths = window.tabdo.showOpenDialog({
    properties: ['openFile'],
    filters: [
      {
        name: key === 'audioFile' ? '音频' : '图片',
        extensions:
          key === 'audioFile'
            ? ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg']
            : ['png', 'jpg', 'jpeg', 'webp']
      }
    ]
  })
  if (paths?.[0]) parameters.value[key] = paths[0]
}
/**
 * 保存此工具自己的输出目录设置。
 * @returns {void} 无返回值。
 */
function chooseOutput() {
  const paths = window.tabdo.showOpenDialog({ properties: ['openDirectory'] })
  if (paths?.[0]) {
    output.value = paths[0]
    window.tabdo.dbStorage.setItem('media-output-' + props.media, output.value)
  }
}
/**
 * 保存输出方式；各源文件同级目录为默认，原自定义路径仍保留可切回。
 * @returns {void} 无返回值。
 */
function saveOutputMode() {
  window.tabdo.dbStorage.setItem('media-output-mode-' + props.media, outputMode.value)
}
/**
 * 清空本会话的文件与预览，拒绝迟到的读取结果。
 * @returns {void} 无返回值。
 */
function clearFiles() {
  if (busy.value || reading.value) return
  version++
  previewVersion++
  previewController?.abort()
  items.value = []
  imageInput.value = ''
  selected.value = ''
  manualPreview.value = ''
  message.value = ''
}
/**
 * 按原插件位置/旋转选项生成透明水印，字体由当前系统渲染。
 * @param {object} params 当前纯数据选项。
 * @returns {Promise<string>} PNG data URI。
 * @throws {Error} 图片损坏、文字为空或画布过大时抛出。
 */
async function makeWatermark(params) {
  const canvas = document.createElement('canvas'),
    ctx = canvas.getContext('2d'),
    size = Math.max(10, Math.min(200, Number(params.fontSize) || 28))
  let image, width, height
  if (params.watermarkType === 'image') {
    if (!params.watermarkImage) throw new Error('请选择水印图片')
    image = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('无法读取水印图片'))
      image.src = window.toolsProvider.fileUrl(params.watermarkImage)
    })
    const scale = Math.min(1, 1500 / image.width, 1500 / image.height)
    width = image.width * scale
    height = image.height * scale
  } else {
    if (!String(params.text).trim()) throw new Error('请填写水印文字')
    ctx.font = `${size}px ${getComputedStyle(document.body).fontFamily}`
    width = Math.min(3000, ctx.measureText(String(params.text).slice(0, 300)).width) + 24
    height = size + 24
  }
  const angle = ((Number(params.angle) || 0) * Math.PI) / 180
  canvas.width =
    Math.ceil(Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle))) + 24
  canvas.height =
    Math.ceil(Math.abs(height * Math.cos(angle)) + Math.abs(width * Math.sin(angle))) + 24
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(angle)
  ctx.globalAlpha = Math.max(0.01, Math.min(1, Number(params.opacity) / 100))
  ctx.font = `${size}px ${getComputedStyle(document.body).fontFamily}`
  ctx.fillStyle = params.color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (image) ctx.drawImage(image, -width / 2, -height / 2, width, height)
  else ctx.fillText(String(params.text).slice(0, 300), 0, 0)
  const value = canvas.toDataURL('image/png')
  canvas.width = 0
  canvas.height = 0
  return value
}
/**
 * 登记完整媒体任务，前台退出不截断已确认的批次；取消和完成都会清理工作进程。
 * @returns {Promise<void>} 批次结束后的 Promise。
 */
async function execute() {
  if (!canRun.value) return
  busy.value = true
  message.value = ''
  // 新批次不沿用上一批次的成功标记，避免进度中误读旧结果。
  for (const item of items.value) delete item.result
  controller = new AbortController()
  const snapshot = JSON.parse(JSON.stringify(parameters.value)),
    operation = mode.value,
    files = items.value.map((x) => x.path),
    image = imageInput.value,
    directory = output.value,
    destinationMode = outputMode.value
  try {
    await window.toolsLifecycle.runTask(async (task) => {
      /**
       * 把用户取消合并到必要任务的请求信号。
       * @returns {void} 无返回值。
       */
      const cancel = () => controller?.abort()
      task.signal.addEventListener('abort', cancel, { once: true })
      task.addCleanup(() => task.signal.removeEventListener('abort', cancel))
      if (operation === 'watermark') snapshot.watermark = await makeWatermark(snapshot)
      const result = await window.toolsMedia.run(
        {
          action: 'process',
          media: props.media,
          files,
          mode: operation,
          params: snapshot,
          output: directory,
          outputMode: destinationMode,
          image
        },
        controller.signal,
        (event) => {
          if (disposed) return
          if (event.type === 'progress')
            progress.value = `${event.index + 1}/${event.total} · ${event.name}`
          if (event.type === 'item') {
            const row = items.value.find((x) => x.path === event.item.source)
            if (row) row.result = event.item
          }
        }
      )
      if (!disposed) {
        const failures = result.filter((x) => x.error).length
        message.value = `处理完成：${result.length - failures} 项成功${failures ? '，' + failures + ' 项失败' : ''}`
        for (const row of result) {
          const item = items.value.find((x) => x.path === row.source) || items.value[0]
          if (item) item.result = row
        }
      }
    }, 600000)
  } catch (error) {
    if (!disposed) message.value = error.message
  } finally {
    if (!disposed) {
      busy.value = false
      progress.value = ''
    }
    controller = null
  }
}
/**
 * 记录裁剪框选、移动或四角调整的相对坐标起点。
 * @param {PointerEvent} event 指针事件。
 * @returns {void} 无返回值。
 */
function cropDown(event) {
  if (!active.value || busy.value || event.button !== 0) return
  const rect = event.currentTarget.getBoundingClientRect()
  const r = parameters.value.region || { x: 0, y: 0, width: 1, height: 1 }
  dragStart = {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
    rect,
    region: { ...r },
    handle: event.target.dataset.handle || (event.target.closest('.crop-box') ? 'move' : 'draw')
  }
  event.currentTarget.setPointerCapture(event.pointerId)
}
/**
 * 把可见选择框同步为有界相对矩形，固定比例在原图像素空间计算。
 * @param {PointerEvent} event 移动事件。
 * @returns {void} 无返回值。
 */
function cropMove(event) {
  if (!dragStart || !active.value) return
  const { rect, x, y, region: r, handle } = dragStart
  const endX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  const endY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  const p = parameters.value
  if (handle === 'move') {
    p.region = {
      ...r,
      x: Math.max(0, Math.min(1 - r.width, r.x + endX - x)),
      y: Math.max(0, Math.min(1 - r.height, r.y + endY - y))
    }
    return
  }
  const originX = handle === 'draw' ? x : handle.includes('w') ? r.x + r.width : r.x
  const originY = handle === 'draw' ? y : handle.includes('n') ? r.y + r.height : r.y
  let width = Math.max(1 / active.value.width, Math.abs(endX - originX))
  let height = Math.max(1 / active.value.height, Math.abs(endY - originY))
  const parts = p.cropRatio?.split(':').map(Number)
  const aspect =
    parts?.length === 2
      ? parts[0] / parts[1]
      : p.cropRatio === '原图'
        ? active.value.width / active.value.height
        : 0
  if (aspect) {
    const normalized = (aspect * active.value.height) / active.value.width
    width = Math.min(width, height * normalized)
    height = width / normalized
  }
  p.region = {
    x: endX < originX ? originX - width : originX,
    y: endY < originY ? originY - height : originY,
    width,
    height
  }
}
/**
 * 调整合并顺序，保持文件、预览和输出队列一致。
 * @param {number} index 原位置。
 * @param {number} delta 移动方向。
 * @returns {void} 无返回值。
 */
function move(index, delta) {
  const next = index + delta
  if (next < 0 || next >= items.value.length) return
  const [item] = items.value.splice(index, 1)
  items.value.splice(next, 0, item)
}
/**
 * 在资源管理器显示已发布的结果。
 * @param {string} file 结果绝对路径。
 * @returns {void} 无返回值。
 */
function reveal(file) {
  window.tabdo.shellShowItemInFolder(file)
}
/**
 * 退出时停止前台读取并丢弃缩略图，已登记批次由其任务作用域收尾。
 * @returns {Promise<void>} 前台进程和预览全部退出后的 Promise。
 */
function dispose() {
  if (disposal) return disposal
  disposed = true
  previewVersion++
  previewController?.abort()
  clearTimeout(previewTimer)
  readingController?.abort()
  version++
  items.value = []
  imageInput.value = ''
  dragStart = null
  viewer.value = null
  manualPreview.value = ''
  effectPreview.value = null
  // 旧页面只等前台读图收束；必要处理批次仍由独立任务作用域持有。
  disposal = Promise.allSettled([readingPending, previewPending]).then(() => {})
  return disposal
}
onMounted(() => {
  window.tabdo.setExpendHeight(540)
  window.toolsLifecycle.addCleanup(dispose)
  if (props.action.type === 'img') {
    imageInput.value = props.action.payload
    void add([])
  } else if (props.action.type === 'files')
    void add(props.action.payload.map((x) => (typeof x === 'string' ? x : x.path)))
})
onUnmounted(dispose)
</script>
<template>
  <main
    class="media-batch"
    :data-media="media"
    :data-mode="mode"
    @dragover.prevent
    @drop.prevent="drop"
  >
    <nav aria-label="处理功能">
      <button
        v-for="[key, label] in actions"
        :key="key"
        :data-media-action="key"
        :class="{ selected: mode === key }"
        :disabled="busy"
        @click="mode = key"
      >
        <MediaIcon :name="key" />{{ label }}
      </button>
    </nav>
    <section
      class="media-parameters"
      :aria-label="actions.find((x) => x[0] === mode)?.[1] + '参数'"
    >
      <div class="parameter-title">{{ actions.find((x) => x[0] === mode)?.[1] }}</div>
      <template v-if="mode === 'resize'">
        <label class="parameter"
          ><span>常用尺寸</span
          ><select v-model="parameters.sizePreset" aria-label="常用尺寸" @change="applySizePreset">
            <option v-for="[key, label] in sizePresets" :key="key" :value="key">{{ label }}</option>
          </select></label
        >
        <div v-if="media === 'image'" class="preset-buttons" aria-label="按原图缩放">
          <button v-for="scale in [25, 50, 75, 100]" :key="scale" @click="applyScale(scale)">
            {{ scale }}%
          </button>
        </div>
      </template>
      <template v-if="cropping">
        <span class="control-label">裁剪比例</span>
        <div class="preset-buttons" aria-label="裁剪比例">
          <button
            v-for="ratio in cropRatios"
            :key="ratio"
            :aria-pressed="parameters.cropRatio === ratio"
            @click="applyCropRatio(ratio)"
          >
            {{ ratio }}
          </button>
        </div>
        <p>在右侧画面拖动框选；拖动框内移动，拖动四角调整。批量图片按相同构图裁剪。</p>
        <button @click="applyCropRatio(parameters.cropRatio)">重置裁剪框</button>
      </template>
      <div v-if="mode === 'rotate'" class="preset-buttons">
        <button
          v-for="[angle, label] in [
            [-90, '左转 90°'],
            [90, '右转 90°'],
            [180, '旋转 180°']
          ]"
          :key="angle"
          @click="parameters.angle = angle"
        >
          {{ label }}
        </button>
      </div>
      <div v-if="mode === 'speed'" class="preset-buttons">
        <button v-for="speed in [0.5, 1, 1.5, 2, 4]" :key="speed" @click="parameters.speed = speed">
          {{ speed }}×
        </button>
      </div>
      <label
        v-for="field in fields"
        :key="field.key"
        :class="['parameter', { check: field.type === 'checkbox' }]"
      >
        <input
          v-if="field.type === 'checkbox'"
          v-model="parameters[field.key]"
          type="checkbox"
          :aria-label="field.label"
        />
        <span
          >{{ field.label
          }}<output v-if="field.type === 'range'">{{ parameters[field.key] }}</output></span
        >
        <select
          v-if="field.type === 'select'"
          v-model="parameters[field.key]"
          :aria-label="field.label"
        >
          <option v-for="[value, label] in field.options" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
        <input
          v-else-if="field.type !== 'checkbox'"
          v-model="parameters[field.key]"
          :type="field.type"
          :min="field.min ?? (field.key === 'angle' ? -360 : 0)"
          :max="field.max"
          :step="field.step || 1"
          :aria-label="field.label"
        />
      </label>
      <button
        v-if="mode === 'watermark' && parameters.watermarkType === 'image'"
        @click="chooseAsset('watermarkImage')"
      >
        {{ parameters.watermarkImage ? '已选择水印 · 更换' : '选择水印图片' }}
      </button>
      <button v-if="mode === 'thumbnail'" @click="chooseAsset('cover')">
        {{ parameters.cover ? '已选择封面 · 更换' : '选择封面图片' }}
      </button>
      <button
        v-if="mode === 'audio' && parameters.audioMode === 'replace'"
        @click="chooseAsset('audioFile')"
      >
        {{ parameters.audioFile ? '已选择音轨 · 更换' : '选择音频文件' }}
      </button>
      <p v-if="mode === 'resize'">
        {{
          media === 'image'
            ? '支持像素或百分比，如 800、50%。留空的一边自动等比计算。'
            : '留空的一边自动等比计算。'
        }}
      </p>
      <p v-if="mode === 'merge' || mode === 'pdf' || (mode === 'gif' && media === 'image')">
        按右侧队列顺序合并，可用箭头调整。
      </p>
      <p v-if="mode === 'convert' && parameters.format === 'svg'">
        输出为内嵌图片的 SVG，不进行矢量描摹。
      </p>
      <p v-if="items.some((x) => x.pages > 1) && !['compress', 'convert'].includes(mode)">
        多帧图片的此项操作处理首帧；压缩和格式转换可保留动画。
      </p>
    </section>
    <section class="media-queue" aria-label="文件队列">
      <header>
        <span>{{ items.length ? '文件 ' + items.length + ' 个' : '文件队列' }}</span
        ><button v-if="items.length" :disabled="busy || reading" @click="choose(false)">
          ＋ 添加
        </button>
      </header>
      <section v-if="active && !active.error" class="media-preview" aria-label="处理预览">
        <div class="preview-heading">
          <strong>{{ cropping ? '框选裁剪范围' : showOriginal ? '原始画面' : '处理预览' }}</strong
          ><button
            v-if="media === 'image' && !cropping"
            :aria-pressed="showOriginal"
            @click="showOriginal = !showOriginal"
          >
            {{ showOriginal ? '查看效果' : '查看原图' }}
          </button>
        </div>
        <div
          v-if="cropping"
          class="manual-crop"
          :style="{ width: Math.min(400, (180 * active.width) / active.height) + 'px' }"
          @pointerdown="cropDown"
          @pointermove="cropMove"
          @pointerup="dragStart = null"
          @pointercancel="dragStart = null"
        >
          <img :src="manualPreview || active.thumbnail" alt="拖动框选裁剪范围" draggable="false" />
          <div
            v-if="parameters.region"
            class="crop-box"
            :style="{
              left: parameters.region.x * 100 + '%',
              top: parameters.region.y * 100 + '%',
              width: parameters.region.width * 100 + '%',
              height: parameters.region.height * 100 + '%'
            }"
          >
            <span
              v-for="handle in ['nw', 'ne', 'sw', 'se']"
              :key="handle"
              :class="['crop-handle', handle]"
              :data-handle="handle"
            />
          </div>
        </div>
        <video
          v-else-if="media === 'video' && !spatialVideo && !playerFailed"
          ref="player"
          class="preview-media"
          :src="videoUrl"
          :poster="active.thumbnail"
          controls
          :playbackRate="mode === 'speed' ? Number(parameters.speed) : 1"
          :muted="mode === 'audio' && parameters.audioMode === 'mute'"
          @error="playerFailed = true"
        />
        <img
          v-else
          class="preview-media"
          :src="
            showOriginal
              ? manualPreview || active.thumbnail
              : effectPreview?.thumbnail || manualPreview || active.thumbnail
          "
          :alt="showOriginal ? '原始画面' : '处理效果'"
        />
        <div class="preview-caption" aria-live="polite">
          {{
            previewBusy
              ? '正在更新预览…'
              : previewError ||
                (effectPreview
                  ? `输出 ${effectPreview.width} × ${effectPreview.height}${effectPreview.partial ? '（预览前 12 张）' : ''}`
                  : `${active.width} × ${active.height}`)
          }}
        </div>
        <template v-if="media === 'video'">
          <label class="timeline"
            >查看时间 {{ Number(previewTime).toFixed(1) }} /
            {{ active.duration.toFixed(1) }} 秒<input
              v-model.number="previewTime"
              aria-label="预览时间"
              type="range"
              min="0"
              :max="Math.max(0, active.duration - 0.01)"
              step="0.01"
              @input="seekPreview"
          /></label>
          <div v-if="['cut', 'gif', 'audio', 'frame'].includes(mode)" class="time-marks">
            <button @click="markTime(false)">当前位置设为起点</button
            ><button v-if="mode !== 'frame'" @click="markTime(true)">当前位置设为终点</button
            ><span
              >从 {{ parameters.start || 0 }} 秒{{
                parameters.duration
                  ? ' 到 ' +
                    (Number(parameters.start || 0) + Number(parameters.duration)).toFixed(2) +
                    ' 秒'
                  : ' 到结束'
              }}</span
            >
          </div>
        </template>
        <p v-if="media === 'image' && ['pdf', 'gif'].includes(mode)">
          显示首张画面，完整合并按下方队列顺序。
        </p>
        <p v-if="media === 'video'">画面用于构图预览；压缩画质、声音和完整片段以输出文件为准。</p>
        <p v-if="playerFailed">此格式使用逐帧预览，拖动时间轴查看画面。</p>
      </section>
      <div class="queue-scroll">
        <div v-if="!items.length" class="media-empty">
          <svg
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <rect x="7" y="7" width="34" height="34" rx="5" />
            <path d="M14 32l9-10 7 7 5-5M16 16h1" /></svg
          ><span>{{
            reading ? '正在读取…' : media === 'image' ? '拖放图片到这里' : '拖放视频文件到这里'
          }}</span
          ><button @click="choose(false)">选择文件</button>
        </div>
        <article
          v-for="(item, index) in items"
          :key="item.path"
          class="media-row"
          :class="{ active: selected === item.path, error: item.error || item.result?.error }"
          @click="selected = item.path"
        >
          <img
            v-if="item.thumbnail"
            :src="item.thumbnail"
            alt="预览原图"
            role="button"
            tabindex="0"
            @click.stop="selected = item.path"
            @dblclick.stop="preview(item.path)"
            @keydown.enter="selected = item.path"
          /><button
            v-else
            class="video-symbol"
            aria-label="预览视频"
            @click.stop="selected = item.path"
          >
            ▶
          </button>
          <div class="file-meta">
            <strong :title="item.path">{{ item.name }}</strong
            ><span
              >{{ item.width || '—' }} × {{ item.height || '—' }} ·
              {{ (item.size / 1024).toFixed(1) }} KB{{
                item.duration ? ' · ' + item.duration.toFixed(1) + 's' : ''
              }}</span
            ><span v-if="item.error || item.result?.error" class="error-text">{{
              item.error || item.result.error
            }}</span
            ><button
              v-else-if="item.result?.path"
              class="result-link"
              :data-output-name="item.result.name"
              @click.stop="reveal(item.result.path)"
            >
              上次输出 · {{ item.result.name }}
            </button>
          </div>
          <div class="row-tools">
            <button aria-label="上移" :disabled="busy || index === 0" @click.stop="move(index, -1)">
              ↑</button
            ><button
              aria-label="下移"
              :disabled="busy || index === items.length - 1"
              @click.stop="move(index, 1)"
            >
              ↓</button
            ><button aria-label="移除" :disabled="busy" @click.stop="items.splice(index, 1)">
              ×
            </button>
          </div>
        </article>
      </div>
      <section v-if="settings" class="media-settings" aria-label="输出设置">
        <header>
          <strong>输出目录</strong
          ><button aria-label="关闭设置" @click="settings = false">×</button>
        </header>
        <label
          ><input
            v-model="outputMode"
            type="radio"
            value="source"
            @change="saveOutputMode"
          />与源文件同级目录</label
        >
        <label
          ><input
            v-model="outputMode"
            type="radio"
            value="custom"
            @change="saveOutputMode"
          />自定义目录</label
        >
        <div v-if="outputMode === 'custom'" class="output-custom">
          <span :title="output">{{ output }}</span
          ><button :disabled="outputMode !== 'custom' || busy" @click="chooseOutput">更换</button>
        </div>
        <p v-if="outputMode === 'source'">
          每个文件保存在各自目录；合并结果保存在队列第一个文件的目录。剪贴板图片保存在下载目录。
        </p>
      </section>
      <div v-if="message || progress" class="media-status" role="status">
        {{ progress || message }}
      </div>
      <footer>
        <div>
          <button aria-label="设置" @click="settings = !settings">⚙</button
          ><button
            v-if="media === 'image'"
            aria-label="读取文件夹"
            :disabled="busy || reading"
            @click="choose(true)"
          >
            文件夹</button
          ><button
            aria-label="清空文件"
            :disabled="busy || reading || !items.length"
            @click="clearFiles"
          >
            清空
          </button>
        </div>
        <button v-if="busy" @click="controller?.abort()">取消</button
        ><button v-else class="primary" :disabled="!canRun" @click="execute">
          {{ reading ? '正在读取…' : '开始处理'
          }}{{ items.length ? '（' + items.length + '）' : '' }}
        </button>
      </footer>
    </section>
    <div v-if="viewer" class="media-viewer" @click.self="viewer = null">
      <section role="dialog" aria-label="媒体预览">
        <header>
          <span>{{ viewer.title }}</span
          ><button aria-label="关闭预览" @click="viewer = null">×</button>
        </header>
        <video v-if="viewer.video" :src="viewer.url" controls /><img
          v-else
          :src="viewer.url"
          alt="图片预览"
        />
      </section>
    </div>
  </main>
</template>
<style scoped>
.media-batch {
  box-sizing: border-box;
  height: 100vh;
  display: grid;
  grid-template-columns: 114px minmax(170px, 0.85fr) minmax(240px, 1.2fr);
  font: var(--tool-font);
  color: var(--text-primary);
  padding: 10px 12px;
  gap: 0;
  overflow: hidden;
}
.media-viewer {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: #0005;
  display: grid;
  place-items: center;
  padding: 20px;
}
.media-viewer > section {
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px;
  max-width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.media-viewer header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.media-viewer header span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 80vw;
}
.media-viewer img,
.media-viewer video {
  max-width: 80vw;
  max-height: 70vh;
  object-fit: contain;
}
button,
input,
select {
  font: inherit;
  color: inherit;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-surface);
  box-sizing: border-box;
}
button {
  cursor: pointer;
  min-height: 30px;
  padding: 4px 8px;
}
button:hover {
  background: var(--bg-hover);
}
button:disabled {
  opacity: 0.42;
  cursor: default;
}
button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 1px;
}
input[type='checkbox'],
input[type='range'] {
  accent-color: var(--primary-color);
}
nav {
  overflow-y: auto;
  padding-right: 8px;
  border-right: 1px solid var(--border-color);
}
nav button {
  display: flex;
  align-items: center;
  gap: 7px;
  text-align: left;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 7px 6px;
  margin-bottom: 2px;
  white-space: nowrap;
  font-size: 12px;
}
nav svg {
  width: 17px;
  height: 17px;
  flex: none;
}
nav button.selected {
  color: var(--primary-color);
  background: var(--bg-accent-light);
}
nav button:nth-last-child(4) {
  margin-top: 8px;
}
.media-parameters {
  overflow: auto;
  padding: 0 12px;
  border-right: 1px solid var(--border-color);
  min-width: 0;
}
.parameter-title {
  font-size: 13px;
  font-weight: 600;
  padding: 4px 0 12px;
}
.parameter {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 12px;
}
.parameter span {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  justify-content: space-between;
  gap: 4px;
}
.parameter input:not([type='checkbox']),
.parameter select {
  width: 100%;
  min-height: 31px;
  padding: 4px 7px;
}
.parameter input[type='range'] {
  padding: 0;
}
.parameter input[type='color'] {
  height: 31px;
  padding: 3px;
}
.parameter.check {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
.parameter.check input {
  margin: 0;
  width: 14px;
  height: 14px;
}
p {
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-tertiary);
  margin: 10px 0;
}
.manual-crop {
  position: relative;
  touch-action: none;
  cursor: crosshair;
  margin-bottom: 12px;
  line-height: 0;
  max-width: 100%;
  margin: 0 auto;
}
.manual-crop img {
  width: 100%;
  display: block;
  user-select: none;
}
.crop-box {
  position: absolute;
  border: 1px solid var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  box-sizing: border-box;
  cursor: move;
  box-shadow: 0 0 0 1px #fff8;
}
.crop-handle {
  position: absolute;
  width: 9px;
  height: 9px;
  background: var(--primary-color);
  border: 1px solid white;
}
.crop-handle.nw {
  left: -4px;
  top: -4px;
  cursor: nwse-resize;
}
.crop-handle.ne {
  right: -4px;
  top: -4px;
  cursor: nesw-resize;
}
.crop-handle.sw {
  left: -4px;
  bottom: -4px;
  cursor: nesw-resize;
}
.crop-handle.se {
  right: -4px;
  bottom: -4px;
  cursor: nwse-resize;
}
.preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 12px;
}
.preset-buttons button {
  font-size: 11px;
  min-height: 27px;
}
button[aria-pressed='true'] {
  color: var(--primary-color);
  background: var(--bg-accent-light);
  border-color: var(--primary-color);
}
.control-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.media-preview {
  flex: none;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
  margin-bottom: 7px;
  min-width: 0;
  max-height: 62%;
  overflow: auto;
}
.preview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 5px;
  font-size: 12px;
}
.preview-heading button {
  font-size: 11px;
  min-height: 25px;
  padding: 2px 6px;
}
.preview-media {
  display: block;
  width: 100%;
  height: 170px;
  object-fit: contain;
  background: var(--bg-hover);
  border-radius: 6px;
}
.preview-caption {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 5px;
  overflow-wrap: anywhere;
  max-height: 46px;
  overflow: auto;
}
.media-preview p {
  margin: 4px 0 0;
  font-size: 10px;
}
.timeline {
  display: flex;
  flex-direction: column;
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.timeline input {
  width: 100%;
  margin: 0;
}
.time-marks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 11px;
}
.time-marks button {
  font-size: 10px;
  padding: 2px 4px;
  min-height: 25px;
}
.time-marks span {
  width: 100%;
  color: var(--text-secondary);
}
.media-queue {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding-left: 12px;
  overflow: hidden;
}
.media-queue header {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
  padding-bottom: 7px;
}
.media-queue header button {
  border: 0;
  background: transparent;
  color: var(--primary-color);
}
.queue-scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
}
.media-empty {
  height: 100%;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-tertiary);
}
.media-empty svg {
  width: 44px;
  height: 44px;
}
.media-empty button {
  color: var(--primary-color);
  border-color: var(--primary-color);
}
.media-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 6px;
  border-radius: 7px;
  margin: 0 0 5px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
}
.media-row.active {
  border-color: var(--primary-color);
}
.media-row > img,
.video-symbol {
  width: 45px;
  height: 40px;
  object-fit: contain;
  border-radius: 4px;
  flex: none;
  background: var(--bg-hover);
}
.video-symbol {
  display: grid;
  place-items: center;
  color: var(--text-tertiary);
}
.file-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.file-meta strong {
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-meta > span {
  font-size: 11px;
  color: var(--text-tertiary);
  overflow-wrap: anywhere;
}
.file-meta > .error-text {
  color: var(--danger-color, #ef4444);
}
.row-tools {
  display: flex;
  gap: 1px;
  flex-wrap: wrap;
  width: 24px;
}
.row-tools button {
  border: 0;
  background: transparent;
  min-height: 20px;
  padding: 0 5px;
  font-size: 12px;
}
.result-link {
  border: 0;
  background: transparent;
  color: var(--primary-color);
  text-align: left;
  padding: 0;
  font-size: 11px;
  min-height: 20px;
}
.media-settings {
  padding: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 5px;
  margin-top: 8px;
  font-size: 11px;
}
.media-settings header,
.output-custom,
.media-settings label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.media-settings header {
  justify-content: space-between;
  padding: 0;
}
.media-settings header button {
  min-height: 24px;
  border: 0;
}
.media-settings label input {
  margin: 0;
  accent-color: var(--primary-color);
}
.media-settings p {
  margin: 3px 0 0;
}
.media-settings span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.media-status {
  padding: 7px 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-top: 7px;
  font-size: 11px;
  overflow-wrap: anywhere;
  max-height: 70px;
  overflow: auto;
}
footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 5px;
  padding-top: 9px;
  border-top: 1px solid var(--border-color);
  margin-top: 8px;
}
footer > div {
  display: flex;
  gap: 3px;
}
footer > div > button {
  font-size: 11px;
  padding: 3px 5px;
}
.primary,
.primary:hover {
  background: var(--primary-color);
  color: white;
  border-color: transparent;
  white-space: nowrap;
}
@media (max-width: 620px) {
  .media-batch {
    grid-template-columns: 94px minmax(145px, 0.8fr) minmax(175px, 1fr);
    padding: 8px;
  }
  .media-parameters {
    padding: 0 8px;
  }
  .media-queue {
    padding-left: 8px;
  }
  .row-tools {
    display: none;
  }
  nav button {
    font-size: 11px;
    gap: 4px;
  }
  nav svg {
    width: 15px;
  }
  .media-row > img,
  .video-symbol {
    width: 32px;
    height: 32px;
  }
  footer {
    flex-wrap: wrap;
  }
}
</style>
