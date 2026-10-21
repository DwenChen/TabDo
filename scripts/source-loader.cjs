// Source preview only: reuse Electron and the repository's precompiled native modules.
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const resolve = Module._resolveFilename
const assets = new Map()

/** Resolve source aliases and asset paths without producing a build directory.
 * @param {string} request Requested module.
 * @param {Module} parent Importing module.
 * @param {...unknown} rest Remaining Node resolver arguments.
 * @returns {string} Resolved module path.
 */
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.includes('?asset')) {
    const file = path.resolve(path.dirname(parent.filename), request.split('?')[0])
    assets.set(file + '.preview-asset', file)
    return file + '.preview-asset'
  }
  if (request.startsWith('@shared/')) request = path.join(root, 'src/shared', request.slice(8))
  if (request === '@platform-updater')
    request = path.join(root, 'src/main/api/platformUpdater/disabled.ts')
  try {
    return resolve.call(this, request, parent, ...rest)
  } catch (error) {
    if (request.endsWith('.js'))
      return resolve.call(this, request.slice(0, -3) + '.ts', parent, ...rest)
    throw error
  }
}
/** Expose an existing asset's path to TypeScript source imports.
 * @param {Module} module Node module.
 * @param {string} filename Virtual asset module path.
 * @returns {void} No return value.
 */
require.extensions['.preview-asset'] = (module, filename) => {
  module.exports = assets.get(filename)
}
/** Load TypeScript directly into the current process; no output files are emitted.
 * @param {Module} module Node module.
 * @param {string} filename TypeScript source file.
 * @returns {void} No return value.
 */
require.extensions['.ts'] = (module, filename) => {
  let source = fs.readFileSync(filename, 'utf8')
  source = source
    .replaceAll('import.meta.url', 'require("node:url").pathToFileURL(__filename).href')
    .replace('const require = createRequire(', 'const sourceRequire = createRequire(')
    .replaceAll("require('original-fs')", "sourceRequire('original-fs')")
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  })
  module._compile(result.outputText, filename)
}
global.__TABDO_TARGET_ELECTRON_VERSION__ = require('../package.json').devDependencies.electron
