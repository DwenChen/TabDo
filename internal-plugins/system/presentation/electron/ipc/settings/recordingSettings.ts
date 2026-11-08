import { RECORDINGS_SETTINGS_FILE } from '../constants'
import { createRecordingPreferencesStore } from './recordingPreferencesStore'

// 设备与目录共用同一写入队列，修改一个选项不会覆盖另一项已有选择。
export const recordingPreferencesStore = createRecordingPreferencesStore(RECORDINGS_SETTINGS_FILE)
