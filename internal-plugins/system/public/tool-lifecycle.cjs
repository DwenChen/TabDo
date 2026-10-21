const fs = require('fs'),
  path = require('path')
const candidates = [
  path.resolve(__dirname, '../../../resources/plugin-lifecycle.cjs'),
  path.resolve(__dirname, '../../resources/plugin-lifecycle.cjs')
]
module.exports = require(candidates.find((file) => fs.existsSync(file)))
