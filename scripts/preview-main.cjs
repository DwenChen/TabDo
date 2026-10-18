const path = require('node:path')
const { app } = require('electron')
process.chdir(path.resolve(__dirname, '..'))
process.env.ZTOOLS_SOURCE_PREVIEW = '1'
app.setAppPath(process.cwd())
app.setName('ZTools Local Preview')
app.getVersion = () => require('../package.json').version
require('./source-loader.cjs')
require('../src/main/index.ts')
