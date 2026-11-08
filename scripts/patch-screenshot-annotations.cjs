const fs = require('node:fs')
const path = require('node:path')
const catalogue = require('../resources/annotation-tools.js')

/**
 * Extend the pinned screenshot sources with the same annotation tools as the image editor.
 * @param {string} file Upstream source path.
 * @param {string} source Source after the existing screenshot compatibility patches.
 * @returns {string} Source with annotation support, preserving unrelated capture behavior.
 */
function patchAnnotations(file, source) {
  let s = source.replaceAll('\r\n', '\n')
  if (file.endsWith('/sc_types.h')) {
    s = s
      .replace(/( {4}TB_Brush,[^\n]*\n)/, '$1    TB_Highlighter,\n')
      .replace(/( {4}TB_Text,[^\n]*\n)/, '$1    TB_Number,\n    TB_Spotlight,\n')
  }
  if (file.endsWith('/sc_annotations.h')) {
    s = s
      .replace(
        '    AT_Text,',
        '    AT_Highlighter,\n    AT_Number,\n    AT_Spotlight,\n    AT_Text,'
      )
      .replace(
        '    int thickness;',
        '    int number;             // Number stamp, owned by the undoable annotation.\n    int thickness;'
      )
  }
  if (file.endsWith('/capture_context.h')) {
    s = s.replace(
      '    int drawColorIdx',
      '    int penColorIdx = SC_DEFAULT_COLOR_IDX;\n    int highlighterColorIdx = 2;\n    int drawColorIdx'
    )
  }
  if (file.endsWith('/annotations_windows.cpp')) {
    s = s
      .replace(
        'btn == TB_Brush;',
        'btn == TB_Brush || btn == TB_Highlighter || btn == TB_Number || btn == TB_Spotlight;'
      )
      .replace(
        'return IsVectorTool(btn) || btn == TB_Text;',
        'return (IsVectorTool(btn) && btn != TB_Spotlight) || btn == TB_Text;'
      )
      .replace(
        'case TB_Brush:  return AT_Brush;',
        'case TB_Brush:  return AT_Brush;\n        case TB_Highlighter: return AT_Highlighter;\n        case TB_Number: return AT_Number;\n        case TB_Spotlight: return AT_Spotlight;'
      )
      .replace(
        'case AT_Brush:  return TB_Brush;',
        'case AT_Brush:  return TB_Brush;\n        case AT_Highlighter: return TB_Highlighter;\n        case AT_Number: return TB_Number;\n        case AT_Spotlight: return TB_Spotlight;'
      )
      .replace(
        'static void DrawOneAnnotation(',
        `${spotlightRenderer}\n${numberRenderer}\nstatic void DrawOneAnnotation(`
      )
      .replace(
        '    switch (a.type) {\n        case AT_Rect: {',
        `    switch (a.type) {\n        case AT_Spotlight: break; // One shared mask is drawn before the foreground marks.\n        case AT_Number: DrawNumberStamp(graphics, a, ox, oy); break;\n        case AT_Rect: {`
      )
      .replace(
        'case AT_Brush: {\n            if (a.pts.size() < 2)',
        'case AT_Highlighter:\n        case AT_Brush: {\n            if (a.type == AT_Highlighter) {\n                pen.SetColor(Gdiplus::Color(77, GetRValue(a.color), GetGValue(a.color), GetBValue(a.color)));\n                pen.SetWidth(thick * 4.0f);\n            }\n            if (a.pts.size() < 2)'
      )
      .replace(
        '        for (const Annotation& a : annotations) {',
        '        DrawSpotlights(graphics, annotations, curDrawing, clipRect, ox, oy);\n        for (const Annotation& a : annotations) {'
      )
      .replace(
        '        float oy = (float)-rect.top;\n        for',
        '        float oy = (float)-rect.top;\n        DrawSpotlights(graphics, annotations, nullptr, Gdiplus::Rect(0, 0, rect.right-rect.left, rect.bottom-rect.top), ox, oy);\n        for'
      )
      .replaceAll('if (a.type == AT_Brush)', 'if (a.type == AT_Brush || a.type == AT_Highlighter)')
      .replace(
        '        case AT_Mosaic:\n            if',
        '        case AT_Spotlight:\n        case AT_Number:\n        case AT_Mosaic:\n            if'
      )
      .replace(
        '        case AT_Brush: {\n            if (a.pts.empty())',
        '        case AT_Highlighter:\n        case AT_Brush: {\n            if (a.pts.empty())'
      )
      .replace(
        'r.left = minL; r.top = minT; r.right = maxR; r.bottom = maxB;',
        'int pad = a.type == AT_Highlighter ? a.thickness * 2 + 2 : a.thickness + 2;\n            r.left = minL-pad; r.top = minT-pad; r.right = maxR+pad; r.bottom = maxB+pad;'
      )
      .replace(
        '            case AT_Rect: {',
        '            case AT_Number: {\n                double radius = (a.x2-a.x1)*0.5;\n                if (std::hypot(x-(a.x1+a.x2)*0.5, y-(a.y1+a.y2)*0.5) <= radius) return i;\n                break;\n            }\n            case AT_Spotlight:\n            case AT_Rect: {'
      )
      .replace(
        '            case AT_Brush: {',
        '            case AT_Highlighter:\n            case AT_Brush: {'
      )
      .replace(
        'a.thickness / 2.0 + 2.0',
        '(a.type == AT_Highlighter ? a.thickness * 2.0 : a.thickness / 2.0) + 2.0'
      )
      .replaceAll(
        '        case AT_Circle:\n',
        '        case AT_Circle:\n        case AT_Spotlight:\n        case AT_Number:\n'
      )
      .replace(
        'int HitTestAnnotationResizeHandle(const Annotation& a, int x, int y, HDC hdc, int handleSize) {\n    switch (a.type) {',
        'int HitTestAnnotationResizeHandle(const Annotation& a, int x, int y, HDC hdc, int handleSize) {\n    switch (a.type) {\n        case AT_Spotlight: {\n            RECT box = MeasureAnnotationBounds(const_cast<Annotation&>(a), hdc);\n            return HitTestAnnotationHandle(x, y, box, handleSize);\n        }'
      )
      .replace(
        '        case AT_Brush:\n            for',
        '        case AT_Highlighter:\n        case AT_Brush:\n            for'
      )
    // The rectangular bounds branch was expanded above; avoid duplicate labels there.
    s = s.replace(
      '        case AT_Spotlight:\n        case AT_Number:\n        case AT_Spotlight:\n        case AT_Number:',
      '        case AT_Spotlight:\n        case AT_Number:'
    )
  }
  if (file.endsWith('/overlay_input_windows.cpp')) {
    s = s
      .replace(
        'if (b == TB_Rect || b == TB_Circle || b == TB_Arrow || b == TB_Brush) {',
        'if (IsVectorTool(b)) {'
      )
      .replace(
        '            bool matchesSelection = false;',
        `            // Keep independent pen/highlighter choices across all drawing tool switches.\n            if (isDrawToolBtn && b != ctx->activeTool) {\n                if (ctx->activeTool == TB_Highlighter) ctx->highlighterColorIdx = ctx->drawColorIdx;\n                else ctx->penColorIdx = ctx->drawColorIdx;\n                ctx->drawColorIdx = b == TB_Highlighter ? ctx->highlighterColorIdx : ctx->penColorIdx;\n            }\n            bool matchesSelection = false;`
      )
      .replace(
        'ctx->popupTool = b;\n                    ctx->popupOpen = true;',
        'ctx->popupTool = b;\n                    ctx->popupOpen = b != TB_Spotlight;'
      )
      .replace(
        'int hitAnn = HitTestAnnotation(ctx->annotations, ctx->mouseX, ctx->mouseY, ctx->backDC);',
        'int hitAnn = (ctx->activeTool == TB_Number || ctx->activeTool == TB_Spotlight || ctx->activeTool == TB_Highlighter) ? -1 : HitTestAnnotation(ctx->annotations, ctx->mouseX, ctx->mouseY, ctx->backDC);'
      )
      .replaceAll(
        'ctx->curDrawing.type == AT_Brush',
        '(ctx->curDrawing.type == AT_Brush || ctx->curDrawing.type == AT_Highlighter)'
      )
      .replace(
        '            ctx->state = CS_Drawing;\n',
        `            if (ctx->curDrawing.type == AT_Number) {\n                // Store the number in the history item so undo/redo and deletion remain coherent.\n                int number = 1;\n                for (const Annotation& item : ctx->annotations) if (item.type == AT_Number) number = (std::max)(number, item.number+1);\n                ctx->curDrawing.number = number;\n                int r = (std::max)(12, ctx->curDrawing.thickness*3+8);\n                ctx->curDrawing.x1 -= r; ctx->curDrawing.y1 -= r;\n                ctx->curDrawing.x2 += r; ctx->curDrawing.y2 += r;\n            }\n            ctx->state = CS_Drawing;\n`
      )
      .replace(
        '            } else if (ctx->curDrawing.type == AT_Mosaic && !ctx->curDrawing.mosaicRect) {',
        '            } else if (ctx->curDrawing.type == AT_Number) {\n                // A stamp stays anchored at the initial click; pointer jitter cannot stretch it.\n            } else if (ctx->curDrawing.type == AT_Mosaic && !ctx->curDrawing.mosaicRect) {'
      )
      .replace(
        '            RECT mouseBox =',
        '            if (ctx->curDrawing.type == AT_Spotlight) {\n                // BeginPaint clips the destination to the invalidated region even on a full back-buffer redraw.\n                ctx->needFullRedraw = true;\n                InvalidateRect(hwnd, NULL, FALSE);\n            }\n            RECT mouseBox ='
      )
      .replace(
        '            } else if (ctx->curDrawing.type == AT_Mosaic) {\n                if',
        '            } else if (ctx->curDrawing.type == AT_Number) {\n                valid = true;\n            } else if (ctx->curDrawing.type == AT_Spotlight) {\n                valid = abs(ctx->curDrawing.x2-ctx->curDrawing.x1) >= 2 && abs(ctx->curDrawing.y2-ctx->curDrawing.y1) >= 2;\n            } else if (ctx->curDrawing.type == AT_Mosaic) {\n                if'
      )
      .replace(
        '            case AT_Circle:\n',
        '            case AT_Circle:\n            case AT_Number:\n            case AT_Spotlight:\n'
      )
      .replace(
        '            case AT_Brush:\n',
        '            case AT_Highlighter:\n            case AT_Brush:\n'
      )
  }
  if (file.endsWith('/overlay_ui_windows.cpp')) {
    s = s
      .replace('case TB_Circle:      return L"圆形";', 'case TB_Circle:      return L"椭圆";')
      .replace(
        'case TB_Brush:       return L"画笔";',
        'case TB_Brush:       return L"画笔";\n    case TB_Highlighter: return L"荧光笔";\n    case TB_Number: return L"序号圆圈";\n    case TB_Spotlight: return L"聚光灯";'
      )
  }
  return documentAnnotationFunctions(file, s)
}

/**
 * Keep the responsibilities and parameter contracts beside every substantially changed native function.
 * @param {string} file Patched upstream path.
 * @param {string} source Generated source text.
 * @returns {string} Source with JSDoc contracts attached to the affected declarations.
 */
function documentAnnotationFunctions(file, source) {
  const contracts = file.endsWith('/annotations_windows.cpp')
    ? {
        IsVectorTool:
          'Recognize every drawable annotation tool, including stamps and spotlight regions.',
        CanShowStylePopupTool:
          'Offer color and size only for tools that consume those style parameters.',
        ToolToAnnotationType:
          'Map the shared toolbar tool to its undo-owned native annotation type.',
        AnnotationTypeToTool: 'Restore the toolbar tool when selecting a committed annotation.',
        DrawOneAnnotation:
          'Render one foreground mark with translucent highlighter and number stamp support.',
        DrawAnnotations:
          'Render the spotlight union and foreground marks inside the current selection.',
        CompositeAnnotations:
          'Composite the same spotlight and foreground model into the final PNG.',
        CalcAnnotationsBounds:
          'Measure history bounds for selection constraints, including highlighted paths and stamps.',
        MeasureAnnotationBounds:
          'Measure the complete mark geometry used for repaint and selection.',
        HitTestAnnotation: 'Resolve the topmost mark, including stamp disks and spotlight borders.',
        HitTestAnnotationResizeHandle:
          'Resolve resize handles for the supported geometric annotation types.',
        TransformAnnotationByBox:
          'Transform geometric marks and highlighted paths without changing stamp sequence numbers.'
      }
    : file.endsWith('/overlay_input_windows.cpp')
      ? {
          OnLButtonDown:
            'Start a mark or switch tools while preserving independent highlighter color choices.',
          OnMouseMove:
            'Update the active path or region and repaint the whole spotlight complement when needed.',
          OnLButtonUp:
            'Commit a valid mark, allowing click stamps and rejecting empty spotlight regions.'
        }
      : file.endsWith('/overlay_ui_windows.cpp')
        ? {
            ToolbarButtonTip:
              'Name all toolbar tools in the same Chinese vocabulary as the image editor.'
          }
        : {}
  const descriptions = {
    btn: 'Toolbar button index.',
    t: 'Committed annotation type.',
    a: 'Annotation geometry and style.',
    graphics: 'Current drawing destination.',
    ox: 'Horizontal target-coordinate offset.',
    oy: 'Vertical target-coordinate offset.',
    hdc: 'Target device context.',
    finalDC: 'Final image context.',
    srcDC: 'Original screen pixels.',
    annotations: 'Committed undoable history.',
    anns: 'History items to inspect.',
    curDrawing: 'In-progress mark, if any.',
    selRel: 'Selection in target coordinates.',
    rect: 'Selected screen bounds.',
    virtualX: 'Virtual screen horizontal origin.',
    virtualY: 'Virtual screen vertical origin.',
    dpiScale: 'Capture pixel scale.',
    mosaicBlockPx: 'Existing mosaic block size.',
    out: 'Output bounds.',
    x: 'Horizontal pointer coordinate.',
    y: 'Vertical pointer coordinate.',
    handleSize: 'Scaled resize-handle size.',
    oldBox: 'Original geometry bounds.',
    newBox: 'Requested geometry bounds.',
    hwnd: 'Window receiving the annotation operation.',
    ctx: 'Current capture session and owned resources.'
  }
  let result = source
  for (const [name, responsibility] of Object.entries(contracts)) {
    const declaration = new RegExp(
      `^((?:static )?(void|bool|int|RECT|LRESULT|const wchar_t\\*) ${name}\\(([^)]*)\\)\\s*\\{)`,
      'm'
    )
    result = result.replace(declaration, (match, _all, returns, parameters) => {
      const params = parameters
        .split(',')
        .map((value) => value.trim().match(/(\w+)$/)?.[1])
        .filter(Boolean)
      return (
        '/**\n * ' +
        responsibility +
        '\n' +
        params
          .map(
            (param) => ` * @param ${param} ${descriptions[param] || 'Current operation input.'}\n`
          )
          .join('') +
        ` * @returns ${returns === 'void' ? 'No return value; updates only the current capture operation.' : returns === 'LRESULT' ? 'Windows message result after handling the operation.' : 'The resolved annotation value or geometry for this operation.'}\n */\n` +
        match
      )
    })
  }
  return result
}

/**
 * Inject the shared SVG catalogue into the generated native icon header.
 * @param {string} sourcePath Local pinned native source checkout.
 * @returns {void} Updates only the generated header in the ignored build directory.
 */
function patchIcons(sourcePath) {
  const file = path.join(sourcePath, 'src/generated/icon_svgs.h')
  let header = fs.readFileSync(file, 'utf8')
  for (const tool of catalogue.tools) {
    const value = `static const char* kIconSvg_${tool.native} = ${JSON.stringify(catalogue.svg(tool.path))};`
    const pattern = new RegExp(`static const char\\* kIconSvg_${tool.native}\\s*=[\\s\\S]*?;`)
    header = pattern.test(header)
      ? header.replace(pattern, value)
      : header.replace('#pragma once', '#pragma once\n' + value)
  }
  header = header
    .replace(
      'kIconSvg_Brush, kIconSvg_Mosaic',
      'kIconSvg_Brush, kIconSvg_Highlighter, kIconSvg_Mosaic'
    )
    .replace(
      'kIconSvg_Text, kIconSvg_LongCapture',
      'kIconSvg_Text, kIconSvg_Number, kIconSvg_Spotlight, kIconSvg_LongCapture'
    )
  fs.writeFileSync(file, header)
}

const spotlightRenderer = `/**
 * Darken the complement of all spotlight rectangles once, including overlapping regions.
 * @param graphics Current overlay or export graphics.
 * @param annotations Committed history items.
 * @param current In-progress annotation, if any.
 * @param bounds Complete selection in target coordinates.
 * @param ox Horizontal conversion from screen to target.
 * @param oy Vertical conversion from screen to target.
 * @returns No return value; temporary GDI+ regions are released on return.
 */
static void DrawSpotlights(Gdiplus::Graphics& graphics, const std::vector<Annotation>& annotations,
                          const Annotation* current, const Gdiplus::Rect& bounds, float ox, float oy) {
    Gdiplus::Region mask(bounds);
    bool found = false;
    auto exclude = [&](const Annotation& a) {
        if (a.type != AT_Spotlight || abs(a.x2-a.x1) < 2 || abs(a.y2-a.y1) < 2) return;
        found = true;
        mask.Exclude(Gdiplus::RectF((std::min)(a.x1,a.x2)+ox, (std::min)(a.y1,a.y2)+oy,
                                   (float)abs(a.x2-a.x1), (float)abs(a.y2-a.y1)));
    };
    for (const Annotation& a : annotations) exclude(a);
    if (current) exclude(*current);
    if (!found) return;
    Gdiplus::SolidBrush shade(Gdiplus::Color(143,0,0,0));
    graphics.FillRegion(&shade, &mask);
}
`

const numberRenderer = `/**
 * Draw a filled number stamp with contrasting centered digits.
 * @param graphics Overlay or export destination.
 * @param a Stamp geometry, color and undo-owned sequence number.
 * @param ox Horizontal target offset.
 * @param oy Vertical target offset.
 * @returns No return value; all drawing resources are scoped to this call.
 */
static void DrawNumberStamp(Gdiplus::Graphics& graphics, const Annotation& a, float ox, float oy) {
    float diameter = (float)(a.x2-a.x1);
    float x = a.x1+ox, y = a.y1+oy;
    Gdiplus::SolidBrush fill(ScOpaqueColor(a.color));
    graphics.FillEllipse(&fill, x, y, diameter, diameter);
    int brightness = (GetRValue(a.color)*299+GetGValue(a.color)*587+GetBValue(a.color)*114)/1000;
    Gdiplus::SolidBrush ink(brightness > 170 ? Gdiplus::Color(255,51,51,51) : Gdiplus::Color(255,255,255,255));
    Gdiplus::FontFamily family(L"Segoe UI");
    Gdiplus::Font font(&family, diameter*(a.number > 99 ? 0.45f : 0.575f), Gdiplus::FontStyleBold, Gdiplus::UnitPixel);
    Gdiplus::StringFormat format;
    format.SetAlignment(Gdiplus::StringAlignmentCenter);
    format.SetLineAlignment(Gdiplus::StringAlignmentCenter);
    std::wstring label = std::to_wstring(a.number);
    graphics.DrawString(label.c_str(), -1, &font, Gdiplus::RectF(x,y,diameter,diameter), &format, &ink);
}
`

module.exports = { patchAnnotations, patchIcons }
