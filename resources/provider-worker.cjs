const path = require('node:path')
const fs = require('node:fs')
const { createServices } = require('./providers/services.cjs')

/**
 * 在一次性进程中执行翻译、OCR 或公式推理，临时文件全部属于本次请求。
 * @param {object} request 宿主提供的能力、输入、配置和数据路径。
 * @returns {Promise<unknown>} 已完成的能力结果。
 * @throws {Error} 不支持的操作或能力执行失败。
 */
async function execute(request) {
  const temp = request.tempRoot
  const services = createServices({ dbStorage: { getItem: (key) => request.settings[key] } })
  // 图像落盘统一收归本次进程，失败和取消也可以按目录回收。
  services._nativeDir = () => path.join(request.dataRoot, 'wechat')
  services._latexDir = () => path.join(request.dataRoot, 'latex')
  const materialize = services._ocrMaterialize.bind(services)
  services._ocrMaterialize = async (image) => {
    if (!/^data:|^https?:/i.test(image)) return materialize(image)
    const file = path.join(temp, 'input.png')
    if (/^data:/i.test(image)) fs.writeFileSync(file, Buffer.from(image.split(',')[1], 'base64'))
    else await services._downloadFile(image, file, undefined, 5)
    return file
  }
  try {
    const { input, operation } = request
    if (operation === 'wechat-ocr') return await services.ocrRecognize(input.image)
    if (operation === 'latex') {
      const { createLatexOcr } = require('./providers/latexOcr.cjs')
      services._latexEngine = createLatexOcr(services._latexDir(), () => ({
        ...request.pixels,
        bitmap: Buffer.from(request.pixels.bitmap, 'base64')
      }))
      services._latexEnsure = () => services._latexEngine
      return await services.latexRecognize(input.image)
    }
    if (operation === 'upload') return await services.uploadImage(input.image)
    const method = {
      baidu: 'translateBaidu',
      google: 'translateGoogle',
      youdao: 'translateYoudao',
      microsoft: 'translateMicrosoft'
    }[operation]
    if (!method) throw new Error('不支持的内置能力')
    return await services[method](input.text, input.from, input.to)
  } finally {
    // 先释放原生引擎，再清理磁盘；进程最终退出回收所有模块与推理会话。
    services.ocrDispose()
    await services._latexEngine?.dispose()
    services._latexEngine = null
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

process.once('message', async (request) => {
  try {
    process.send({ result: await execute(request) })
  } catch (error) {
    process.send({ error: error.message || String(error) })
  }
  // 保持存活直到宿主结束进程树，避免 WeChatOCR 子进程脱离其父进程。
})
process.on('disconnect', () => process.exit())
