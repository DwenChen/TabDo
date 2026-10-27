import type { useI18n } from '@presentation/contexts/I18nContext'
import { resolveExportStatusModel } from '../exportStatusModel'
import type { useExportSession } from './useExportSession'
import type { useExportSettings } from './useExportSettings'

type Input = {
  t: ReturnType<typeof useI18n>['t']
  session: ReturnType<typeof useExportSession>
  settings: ReturnType<typeof useExportSettings>
}

/**
 * 将导出进度整理为中文用户状态。
 * @param options 当前操作所需的参数。
 * @returns 阶段、百分比和处理速度。
 */
export function useExportStatusViewModel({ t, session, settings }: Input) {
  const status = resolveExportStatusModel({
    isExporting: session.isExporting,
    exportProgress: session.exportProgress,
    exportFormat: settings.exportFormat,
    exportPipelineModel: settings.exportPipelineModel
  })
  const exportRenderSpeedLabel = status.renderSpeedFps
    ? t('editor.exportStatus.renderSpeed', '处理速度：每秒 {{fps}} 帧', {
        fps: status.renderSpeedFps
      })
    : null
  const progress = session.exportProgress
  const exportPercentLabel = progress
    ? status.isExportPreparing
      ? t('editor.exportStatus.preparing', 'Preparing export...')
      : status.isExportSaving
        ? t('editor.exportStatus.saving', '正在选择保存位置…')
        : status.isRenderingAudio
          ? t('editor.exportStatus.renderingAudio', '正在处理音频 {{percent}}%', {
              percent: Math.round((progress.audioProgress ?? 0) * 100)
            })
          : status.isExportFinalizing
            ? settings.exportFormat === 'mp4' && settings.exportPipelineModel === 'modern'
              ? status.isExportFinalSaveIndeterminate
                ? t('editor.exportStatus.muxingAndSaving', '正在合并音轨并保存文件…')
                : t('editor.exportStatus.muxingAndSavingPercent', '正在合并并保存 {{percent}}%', {
                    percent: status.exportFinalizingPercent ?? 100
                  })
              : t('editor.exportStatus.finalizingPercent', '正在完成导出 {{percent}}%', {
                  percent: status.exportFinalizingPercent ?? 100
                })
            : t('editor.exportStatus.completePercent', '{{percent}}% complete', {
                percent: Math.round(progress.percentage)
              })
    : t('editor.exportStatus.preparing', 'Preparing export...')

  return { ...status, exportRenderSpeedLabel, exportPercentLabel }
}
