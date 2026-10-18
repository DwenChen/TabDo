const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const revision = '8b221e72c4b5462ba2c9b490370cc10df72108cc'

/**
 * 在固定版本源码上编译 Windows 截图模块，精简工具栏并修复长截图采样。
 * @returns {void} 无返回值。
 * @throws 源码版本、工具链、头文件或编译结果无效时抛出错误。
 */
function main() {
  // 源码与中间文件放在忽略目录，不修改完整原生模块或用户配置。
  const source = path.resolve(
    process.env.ZTOOLS_SCREENSHOT_SOURCE || path.join(root, '.artifacts/native/screenshot-source')
  )
  if (!fs.existsSync(source)) {
    fs.mkdirSync(path.dirname(source), { recursive: true })
    execFileSync(
      'git',
      ['clone', 'https://github.com/ZToolsCenter/ZTools-native-api.git', source],
      { stdio: 'inherit', windowsHide: true }
    )
    execFileSync('git', ['checkout', '--detach', revision], {
      cwd: source,
      stdio: 'inherit',
      windowsHide: true
    })
  }
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: source,
    encoding: 'utf8',
    windowsHide: true
  }).trim()
  if (actual !== revision) throw new Error('Unexpected screenshot source revision: ' + actual)
  const compiler = process.env.ZTOOLS_NATIVE_CXX || 'g++'
  const compilerDir = path.dirname(compiler)
  /**
   * 定位编译器配套的 GNU 辅助程序。
   * @param {string} name 辅助程序名称。
   * @returns {string} 可执行路径或 PATH 命令名。
   */
  const binTool = (name) => (compilerDir === '.' ? name : path.join(compilerDir, name + '.exe'))
  const headers = process.env.ZTOOLS_NODE_HEADERS
  const addonHeaders = process.env.ZTOOLS_ADDON_HEADERS
  if (!headers || !addonHeaders)
    throw new Error(
      'Set ZTOOLS_NODE_HEADERS and ZTOOLS_ADDON_HEADERS to the Electron headers root and node-addon-api directory'
    )
  /**
   * 从固定提交读取原文后应用补丁，重复编译不会重复修改源码。
   * @param {string} file 源码相对路径。
   * @param {Function} transform 补丁变换。
   * @returns {void} 无返回值。
   */
  function patch(file, transform) {
    const original = execFileSync('git', ['show', revision + ':' + file], {
      cwd: source,
      encoding: 'utf8',
      windowsHide: true
    })
    fs.writeFileSync(path.join(source, file), transform(original))
  }
  patch('src/screenshot/windows/sc_types.h', (s) =>
    s
      .replace(/ {4}TB_Translate,[^\n]*\n/, '')
      .replace(
        '    TB_Count\n};',
        '    TB_Count\n};\n// 工具栏不再包含翻译；保留不可命中的内部值，避免改动其他标注和长截图逻辑。\nstatic constexpr int TB_Translate = -100;'
      )
  )
  patch('src/screenshot/windows/internal.h', (s) =>
    s.replace(
      'int CalcToolbarWidth(const SCToolbarMetrics& m);',
      `/**
 * Return the compact separator or normal button width.
 * @param btn Toolbar button index.
 * @param m DPI-scaled toolbar metrics.
 * @returns Cell width in pixels.
 */
int ToolbarButtonWidth(int btn, const SCToolbarMetrics& m);
/**
 * Position a toolbar cell using the shared variable-width layout.
 * @param btn Toolbar button index, or TB_Count for the ending boundary.
 * @param m DPI-scaled toolbar metrics.
 * @returns Horizontal offset from the toolbar left edge.
 */
int ToolbarButtonOffset(int btn, const SCToolbarMetrics& m);
int CalcToolbarWidth(const SCToolbarMetrics& m);`
    )
  )
  patch('src/screenshot/windows/icons_windows.cpp', (s) =>
    s.replace(
      /int CalcToolbarWidth\(const SCToolbarMetrics& m\) \{[\s\S]*?\n\}/,
      `/**
 * Keep separator cells at 12/32 of a button width instead of reserving a full button.
 * @param btn Toolbar button index.
 * @param m DPI-scaled toolbar metrics.
 * @returns Cell width in pixels.
 */
int ToolbarButtonWidth(int btn, const SCToolbarMetrics& m) {
    return (btn == TB_Separator1 || btn == TB_Separator2) ? (std::max)(1, m.btn * 3 / 8) : m.btn;
}
/**
 * Share the variable-width cell positions across painting, hit tests and tooltips.
 * @param btn Toolbar button index, or TB_Count for the ending boundary.
 * @param m DPI-scaled toolbar metrics.
 * @returns Horizontal offset from the toolbar left edge.
 */
int ToolbarButtonOffset(int btn, const SCToolbarMetrics& m) {
    int x = m.border + m.pad + m.btn + m.gap;
    for (int i = 0; i < btn; ++i) x += ToolbarButtonWidth(i, m) + m.gap;
    return x;
}
/**
 * Size the toolbar from compact cell boundaries without trailing spacing.
 * @param m DPI-scaled toolbar metrics.
 * @returns Complete toolbar width in pixels.
 */
int CalcToolbarWidth(const SCToolbarMetrics& m) {
    return ToolbarButtonOffset(TB_Count, m) + m.pad + m.border - m.gap;
}`
    )
  )
  patch('src/screenshot/windows/overlay_ui_windows.cpp', (s) =>
    s
      .replace(
        /int HitTestToolbar\(int x, int y, const RECT& toolbarRect, const SCToolbarMetrics& m\) \{[\s\S]*?\n\}/,
        `/**
 * Resolve pointer hits using the same compact cells as toolbar painting.
 * @param x Pointer horizontal coordinate.
 * @param y Pointer vertical coordinate.
 * @param toolbarRect Toolbar bounds.
 * @param m DPI-scaled toolbar metrics.
 * @returns Button index, grip identifier, or -1 for spacing and separators.
 */
int HitTestToolbar(int x, int y, const RECT& toolbarRect, const SCToolbarMetrics& m) {
    if (!PointInRect(x, y, toolbarRect)) return -1;
    int relative = x - toolbarRect.left;
    if (relative >= m.border + m.pad && relative < m.border + m.pad + m.btn) return SC_TB_GRIP;
    for (int i = 0; i < TB_Count; ++i) {
        int left = ToolbarButtonOffset(i, m);
        if (relative >= left && relative < left + ToolbarButtonWidth(i, m)) {
            return (i == TB_Separator1 || i == TB_Separator2) ? -1 : i;
        }
    }
    return -1;
}`
      )
      .replaceAll(
        'toolbarRect.left + m.border + m.pad + (i + 1) * (m.btn + m.gap)',
        'toolbarRect.left + ToolbarButtonOffset(i, m)'
      )
      .replace('int sx = bx + m.btn / 2;', 'int sx = bx + ToolbarButtonWidth(i, m) / 2;')
      .replace(
        'int cell = (btn == SC_TB_GRIP) ? 0 : btn + 1;',
        '// Compact cells use the same positions as painting and hit testing.'
      )
      .replace(
        'ctx->toolbarRect.left + m.border + m.pad + cell * (m.btn + m.gap)',
        'ctx->toolbarRect.left + (btn == SC_TB_GRIP ? m.border + m.pad : ToolbarButtonOffset(btn, m))'
      )
  )
  // 修复 MSVC 允许而标准 C++ 不允许的临时值取址，不改变脏区范围。
  patch('src/screenshot/windows/annotations_windows.cpp', (s) =>
    s
      .replace('#include "internal.h"', '#include "internal.h"\n#include <cfloat>')
      .replace(
        'InvalidateRect(hwnd, &InflateRectBy(b, handleMargin), FALSE);',
        'const RECT dirtyBounds = InflateRectBy(b, handleMargin);\n    InvalidateRect(hwnd, &dirtyBounds, FALSE);'
      )
      .replace(
        'InvalidateRect(hwnd, &InflateRectBy(line, 4), FALSE);',
        'const RECT dirtyLine = InflateRectBy(line, 4);\n    InvalidateRect(hwnd, &dirtyLine, FALSE);'
      )
  )
  patch('src/screenshot/windows/lc_panel_ui_windows.cpp', (s) =>
    s
      .replaceAll(
        'switch (msg) {',
        'switch (msg) {\n    case WM_CREATE: SetWindowDisplayAffinity(hwnd, 0x11 /* WDA_EXCLUDEFROMCAPTURE */); return 0;'
      )
      .replace(
        /(g\.FillRectangle\(&(?:t?fill), )([\s\S]*?)(\);)/g,
        (_, start, args, end) =>
          start +
          args
            .split(',')
            .map((v) => '(int)(' + v.trim() + ')')
            .join(', ') +
          end
      )
  )
  patch('src/screenshot/windows/lc_toolbar_ui_windows.cpp', (s) =>
    s.replaceAll(
      'switch (msg) {',
      'switch (msg) {\n    // Keep toolbar and hover tips out of the sampled document pixels.\n    case WM_CREATE: SetWindowDisplayAffinity(hwnd, 0x11 /* WDA_EXCLUDEFROMCAPTURE */); return 0;'
    )
  )
  patch('src/screenshot/windows/lc_session_windows.cpp', (s) =>
    s
      .replace(
        'bool RunLongCapture(LongCaptureContext* c) {',
        `/**
 * Sample visible scrolling content even when touchpad or scrollbar motion emits no Raw Input.
 * @param c Active long capture session.
 * @returns Whether a final image was emitted successfully.
 */
bool RunLongCapture(LongCaptureContext* c) {`
      )
      .replace(
        'if (!LongCaptureRegisterWheelObserver(g_longControlWindow)) {\n        LongCaptureEmitFailure();\n        return false;\n    }',
        `bool wheelObserverRegistered = LongCaptureRegisterWheelObserver(g_longControlWindow);
    if (!wheelObserverRegistered) {
        ZLOG_WARN("longcapture", "raw wheel observer unavailable; using visual sampling");
    }`
      )
      .replace(
        'if (settleSample || midScrollSample || c->pendingMatch.valid) {',
        `// Pointer-independent sampling covers touchpads, scrollbars, keyboard and injected scrolling.
        // Identical frames are skipped and must never be counted as bottom confirmation.
        bool visualSample = !c->wheelPending && !c->pendingMatch.valid
                         && now - c->lastSampleTick >= (DWORD)LC_SCROLL_SAMPLE_MAX_GAP;
        bool freshFrame = false;
        if (visualSample) {
            c->lastSampleTick = now;
            if (!LongCaptureCaptureFrameBuf(c, frameBuf)) continue;
            if (frameBuf.size() == c->lastFrame.size()
                && memcmp(frameBuf.data(), c->lastFrame.data(), frameBuf.size() * sizeof(uint32_t)) == 0) continue;
            freshFrame = true;
        }
        if (settleSample || midScrollSample || c->pendingMatch.valid || visualSample) {`
      )
      .replace(
        'if (LongCaptureCaptureFrameBuf(c, frameBuf))\n',
        'if (freshFrame || LongCaptureCaptureFrameBuf(c, frameBuf)) {\n                    freshFrame = false;\n'
      )
      .replace(
        'oc = LongCaptureTryStitch(c, frameBuf, c->lastDir,',
        'oc = LongCaptureTryStitch(c, frameBuf, visualSample ? 0 : c->lastDir,'
      )
      .replace(
        '!c->autoScroll && stableWaits < LC_STABLE_MAX_WAITS);',
        '!c->autoScroll && stableWaits < LC_STABLE_MAX_WAITS);\n                }'
      )
      .replace(
        'LongCaptureUnregisterWheelObserver();',
        'if (wheelObserverRegistered) LongCaptureUnregisterWheelObserver();'
      )
      .replace(
        'c->noChangeCount = 0;\n                c->weakTries = 0;',
        'c->noChangeCount = 0;\n                c->reachedBottom = false;\n                c->weakTries = 0;'
      )
  )
  execFileSync(process.execPath, ['scripts/gen-icons.js'], {
    cwd: source,
    stdio: 'inherit',
    windowsHide: true
  })
  const icons = path.join(source, 'src/generated/icon_svgs.h')
  fs.writeFileSync(
    icons,
    fs
      .readFileSync(icons, 'utf8')
      .replace(
        'kIconSvg_Text, kIconSvg_Translate, kIconSvg_LongCapture',
        'kIconSvg_Text, kIconSvg_LongCapture'
      )
  )
  fs.writeFileSync(
    path.join(source, 'tools_binding.cpp'),
    `#include "src/screenshot/windows/screenshot_windows.h"
/**
 * Register the isolated screenshot entry points, leaving the host native APIs untouched.
 * @param env Node-API environment.
 * @param exports Module exports.
 * @returns Registered module exports.
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("startRegionCapture", Napi::Function::New(env, StartRegionCapture));
  exports.Set("primeScreenshotFrame", Napi::Function::New(env, PrimeScreenshotFrame));
  exports.Set("startRegionCaptureWithPrimedFrame", Napi::Function::New(env, StartRegionCaptureWithPrimedFrame));
  exports.Set("abortLongCapture", Napi::Function::New(env, AbortLongCapture));
  return exports;
}
NODE_API_MODULE(ztools_screenshot, Init)
`
  )
  const sources = ['windows', 'algo'].flatMap((dir) =>
    fs
      .readdirSync(path.join(source, 'src/screenshot', dir))
      .filter((f) => f.endsWith('.cpp'))
      .map((f) => 'src/screenshot/' + dir + '/' + f)
  )
  const output = path.join(root, 'resources/lib/win/ztools_screenshot.node')
  // Electron 的宿主可执行文件不是 node.exe，从当前进程解析 Node-API，避免错误加载 Node 可执行文件。
  const exportsText = execFileSync(binTool('objdump'), ['-p', process.execPath], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 50 * 1024 * 1024
  })
  const names = [...exportsText.matchAll(/\]\s+((?:napi_|node_api_)[A-Za-z0-9_]+)\s*$/gm)].map(
    (match) => match[1]
  )
  if (names.length < 100)
    throw new Error('Cannot resolve Node-API exports for the GNU import library')
  fs.writeFileSync(
    path.join(source, 'node-api-thunks.S'),
    '.text\n' +
      names
        .map((name) => '.globl ' + name + '\n' + name + ':\n  jmp *__imp_' + name + '(%rip)\n')
        .join('')
  )
  fs.writeFileSync(
    path.join(source, 'node-api-resolve.cpp'),
    '#include <windows.h>\nextern "C" {\n' +
      names.map((name) => 'FARPROC __imp_' + name + ' = nullptr;\n').join('') +
      `
/**
 * Resolve Node-API entry points from the active Node or Electron executable.
 * @param module Loaded screenshot module.
 * @param reason DLL lifecycle event.
 * @param reserved Loader context.
 * @returns TRUE after resolving the process API table.
 */
BOOL WINAPI DllMain(HINSTANCE module, DWORD reason, LPVOID reserved) {
  if (reason == DLL_PROCESS_ATTACH) {
    HMODULE host = GetModuleHandleW(nullptr);
` +
      names
        .map((name) => '    __imp_' + name + ' = GetProcAddress(host, "' + name + '");\n')
        .join('') +
      '  }\n  return TRUE;\n}\n}\n'
  )
  const args = [
    '-shared',
    '-std=c++17',
    '-O2',
    '-DNAPI_DISABLE_CPP_EXCEPTIONS',
    '-DNAPI_VERSION=8',
    '-DUNICODE',
    '-D_UNICODE',
    '-D_WIN32_WINNT=0x0A00',
    '-static',
    '-static-libgcc',
    '-static-libstdc++',
    '-I' + addonHeaders,
    '-I' + path.join(headers, 'include/node'),
    '-Isrc/screenshot/algo',
    ...sources,
    'tools_binding.cpp',
    'node-api-thunks.S',
    'node-api-resolve.cpp',
    '-o',
    output,
    ...[
      'user32',
      'kernel32',
      'shell32',
      'shlwapi',
      'ole32',
      'oleaut32',
      'gdiplus',
      'dwmapi',
      'gdi32',
      'imm32',
      'msimg32',
      'comdlg32',
      'uuid'
    ].map((lib) => '-l' + lib)
  ]
  const result = spawnSync(compiler, args, {
    cwd: source,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  })
  fs.mkdirSync(path.join(root, '.artifacts/logs'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.artifacts/logs/native-screenshot-build.log'),
    (result.stdout || '') + (result.stderr || '')
  )
  if (result.status !== 0)
    throw new Error(
      result.error?.message ||
        'Screenshot compilation failed; see .artifacts/logs/native-screenshot-build.log'
    )
  // 固定记录来源及许可证，二进制可在没有完整宿主原生工具链时独立复现。
  console.log('Compiled screenshot module: ' + output)
}
main()
