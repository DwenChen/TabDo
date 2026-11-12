import { ipcMain, clipboard, nativeImage } from 'electron'
import { readClipboardFiles, writeClipboardFiles } from '../../utils/clipboardFiles'

/**
 * 剪贴板基础操作API - 插件专用
 * 注意：这里是基础的复制操作，与 shared/clipboard.ts 的历史管理不同
 */
export class PluginClipboardAPI {
  public init(): void {
    this.setupIPC()
  }

  private setupIPC(): void {
    // 复制文本到剪贴板
    ipcMain.on('copy-text', (event, text: string) => {
      try {
        clipboard.writeText(text)
        event.returnValue = true
      } catch (error) {
        console.error('[PluginClipboard] 复制文本失败:', error)
        event.returnValue = false
      }
    })

    // 复制图片到剪贴板
    ipcMain.on('copy-image', (event, image: string | Buffer | Uint8Array) => {
      console.log('[PluginClipboard] 复制图片', image)
      try {
        let nativeImg

        if (typeof image === 'string') {
          if (image.startsWith('data:image/')) {
            nativeImg = nativeImage.createFromDataURL(image)
          } else {
            nativeImg = nativeImage.createFromPath(image)
          }
        } else if (Buffer.isBuffer(image)) {
          nativeImg = nativeImage.createFromBuffer(image)
        } else if (image instanceof Uint8Array) {
          // 将 Uint8Array 转换为 Buffer
          const buffer = Buffer.from(image)
          nativeImg = nativeImage.createFromBuffer(buffer)
        } else {
          throw new Error('不支持的图片类型')
        }

        if (nativeImg.isEmpty()) {
          throw new Error('图片为空或无效')
        }

        clipboard.writeImage(nativeImg)
        event.returnValue = true
      } catch (error) {
        console.error('[PluginClipboard] 复制图片失败:', error)
        event.returnValue = false
      }
    })

    // 复制文件到剪贴板
    ipcMain.on('copy-file', (event, filePath: string | string[]) => {
      try {
        const files = Array.isArray(filePath) ? filePath : [filePath]

        // 返回实际写入结果，调用方才能区分复制成功与系统剪贴板拒绝。
        event.returnValue = writeClipboardFiles(files)
      } catch (error) {
        console.error('[PluginClipboard] 复制文件失败:', error)
        event.returnValue = false
      }
    })

    // 获取剪贴板中的文件列表
    ipcMain.on('get-copyed-files', (event) => {
      try {
        const files = readClipboardFiles().map((file) => ({
          path: file.path,
          isDirectory: file.isDirectory,
          isFile: !file.isDirectory,
          name: file.name
        }))
        event.returnValue = files
      } catch (error) {
        console.error('[PluginClipboard] 获取剪贴板文件失败:', error)
        event.returnValue = []
      }
    })
  }
}

export default new PluginClipboardAPI()
