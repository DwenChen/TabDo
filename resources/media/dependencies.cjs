const { createRequire } = require('node:module')
const path = require('node:path')
// 工作脚本物理展开时，依赖仍从应用包解析，不依赖用户系统的 Node 或 PATH。
module.exports = createRequire(
  path.join(process.env.TABDO_MEDIA_APP_ROOT || path.resolve(__dirname, '../..'), 'package.json')
)
