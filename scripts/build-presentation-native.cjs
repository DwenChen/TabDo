const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

/**
 * Fingerprint only the small native source tree for its shipped build receipt.
 * @param {string} directory Native source directory, excluding compiler output.
 * @returns {string} SHA-256 of sorted relative paths and file contents, separated by NUL.
 * @throws {Error} A source file cannot be read.
 */
function fingerprintSource(directory) {
  const hash = crypto.createHash('sha256')
  /**
   * Add one source subtree in deterministic name order.
   * @param {string} relative Source-relative directory.
   * @returns {void} Updates the current source digest.
   */
  function visit(relative) {
    for (const name of fs.readdirSync(path.join(directory, relative)).sort()) {
      const child = path.join(relative, name)
      if (fs.statSync(path.join(directory, child)).isDirectory()) visit(child)
      else
        hash
          .update(child.replaceAll('\\', '/'))
          .update('\0')
          .update(fs.readFileSync(path.join(directory, child)))
          .update('\0')
    }
  }
  visit('')
  return hash.digest('hex')
}

/**
 * Build the cursor-free Windows helper with an explicit local MSVC/SDK toolchain.
 * @returns Nothing; publishes the helper only after compilation and linking succeed.
 * @throws Missing toolchain or compiler failure leaves the previous helper intact.
 */
function build() {
  if (process.platform !== 'win32') throw new Error('Windows native build requires Windows')
  const root = path.resolve(__dirname, '..')
  const toolchain = process.env.TABDO_MSVC_ROOT
  if (!toolchain)
    throw new Error('Set TABDO_MSVC_ROOT to the directory containing VC and Windows Kits')
  /**
   * Select the newest locally installed compiler or SDK version.
   * @param {string} directory Directory containing versioned toolchains.
   * @returns {string|undefined} Highest numeric version, if present.
   */
  const latest = (directory) =>
    fs
      .readdirSync(directory)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .at(-1)
  const vc = path.join(toolchain, 'VC/Tools/MSVC')
  const sdk = path.join(toolchain, 'Windows Kits/10')
  const vcVersion = latest(vc)
  const sdkVersion = latest(path.join(sdk, 'Include'))
  const compilerDirectory = path.join(vc, vcVersion, 'bin/Hostx64/x64')
  const buildDirectory = path.join(root, '.artifacts/native/presentation-wgc')
  fs.mkdirSync(buildDirectory, { recursive: true })
  const source = path.join(
    root,
    'internal-plugins/system/presentation/electron/native/wgc-capture/src'
  )
  const output = path.join(buildDirectory, 'wgc-capture.exe')
  const environment = {
    ...process.env,
    PATH: [compilerDirectory, path.join(sdk, 'bin', sdkVersion, 'x64'), process.env.PATH].join(
      path.delimiter
    ),
    INCLUDE: [
      path.join(vc, vcVersion, 'include'),
      ...['ucrt', 'shared', 'um', 'winrt', 'cppwinrt'].map((part) =>
        path.join(sdk, 'Include', sdkVersion, part)
      )
    ].join(path.delimiter),
    LIB: [
      path.join(vc, vcVersion, 'lib/x64'),
      ...['ucrt', 'um'].map((part) => path.join(sdk, 'Lib', sdkVersion, part, 'x64'))
    ].join(path.delimiter)
  }
  // Compile in the owned artifact directory; failed builds never overwrite the shipped helper.
  const result = spawnSync(
    path.join(compilerDirectory, 'cl.exe'),
    [
      '/nologo',
      '/std:c++17',
      '/EHsc',
      '/O2',
      '/MT',
      '/W3',
      '/utf-8',
      '/DNOMINMAX',
      ...['main', 'wgc_session', 'mf_encoder', 'monitor_utils', 'wasapi_loopback'].map((name) =>
        path.join(source, name + '.cpp')
      ),
      '/Fe:' + output,
      '/link',
      'windowsapp.lib',
      'user32.lib',
      'd3d11.lib',
      'dxgi.lib',
      'mfplat.lib',
      'mfreadwrite.lib',
      'mf.lib',
      'mfuuid.lib',
      'ole32.lib',
      'shcore.lib',
      'dwmapi.lib'
    ],
    { cwd: buildDirectory, env: environment, stdio: 'inherit' }
  )
  if (result.error || result.status !== 0)
    throw result.error ?? new Error('Native compilation failed: ' + result.status)
  fs.copyFileSync(
    output,
    path.join(root, 'resources/presentation/native/bin/win32-x64/wgc-capture.exe')
  )
  // Keep the distributed helper receipt aligned with this source and successful binary.
  const manifestPath = path.join(
    root,
    'resources/presentation/native/bin/win32-x64/helpers-manifest.json'
  )
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  manifest.helpers['wgc-capture'] = {
    ...manifest.helpers['wgc-capture'],
    binarySha256: crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),
    sourceFingerprint: fingerprintSource(path.dirname(source)),
    sourceFingerprintAlgorithm: 'sha256(sorted-relative-path + NUL + file-content + NUL)',
    updatedAt: new Date().toISOString(),
    build: { compiler: 'MSVC', vcVersion, sdkVersion }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify({ native: 'wgc-capture', vcVersion, sdkVersion, output }))
}

build()
