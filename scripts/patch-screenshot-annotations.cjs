const fs = require('node:fs')
const path = require('node:path')
const catalogue = require('../resources/annotation-tools.js')

// 截图工具栏的专用动作图标，不加入共用 actions；
// 悬浮内容页会为 actions 的每个键查找同名 DOM 按钮。
const OCR_ICON_PATH =
  'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3M7 9h10M7 12h10M7 15h6'

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
        'case TB_Brush:       return L"画笔";\n    case TB_Highlighter: return L"荧光笔";\n    case TB_Number: return L"序号圆圈";\n    case TB_Spotlight: return L"聚光灯";\n    case TB_Ocr: return L"文字识别";'
      )
  }
  return documentAnnotationFunctions(file, enhanceSpotlightBrush(file, enhanceMarkInteraction(file, s)))
}

/**
 * 为聚光灯加入与马赛克一致的笔触模式：模式子菜单、路径蒙版、命中与缩放行为。
 * @param {string} file 已应用既有补丁的源码路径。
 * @param {string} source 当前源码文本。
 * @returns {string} 支持框选与笔触聚光灯的源码文本。
 */
function enhanceSpotlightBrush(file, source) {
  if (file.endsWith('/sc_annotations.h')) {
    return source.replace(
      '    bool mosaicRect;        // true=框选区域马赛克；false=鼠标涂抹马赛克',
      '    bool mosaicRect;        // true=框选区域马赛克；false=鼠标涂抹马赛克\n    bool spotlightBrush;    // true=聚光灯笔触路径；false=框选聚光灯'
    )
  }
  if (file.endsWith('/capture_context.h')) {
    return source.replace(
      '    bool mosaicRectMode = false;           // true=框选区域模式；false=涂抹模式',
      '    bool mosaicRectMode = false;           // true=框选区域模式；false=涂抹模式\n    bool spotlightRectMode = true;         // true=框选聚光灯；false=笔触聚光灯\n    int spotlightRadiusIdx = 1;            // 笔触聚光灯半径索引，复用马赛克半径预设'
    )
  }
  if (file.endsWith('/internal.h')) {
    return source.replace(
      'void DrawMosaicPopup(HDC hdc, const RECT& popupRect, int modeIdx, int sizeIdx, int radiusIdx, const SCPopupMetrics& m);',
      `void DrawMosaicPopup(HDC hdc, const RECT& popupRect, int modeIdx, int sizeIdx, int radiusIdx, const SCPopupMetrics& m);
/**
 * Size the spotlight submenu with one mode group and one brush-radius group.
 * @param m DPI-scaled popup metrics.
 * @param outW Resolved popup width.
 * @param outH Resolved popup height.
 * @returns No return value.
 */
void CalcSpotlightPopupSize(const SCPopupMetrics& m, int& outW, int& outH);
/**
 * Resolve spotlight submenu hits.
 * @param x Horizontal pointer coordinate.
 * @param y Vertical pointer coordinate.
 * @param popupRect Submenu bounds.
 * @param m DPI-scaled popup metrics.
 * @returns 1 brush mode, 2 rect mode, 201+ radius index, or 0 for spacing.
 */
int HitTestSpotlightPopup(int x, int y, const RECT& popupRect, const SCPopupMetrics& m);
/**
 * Draw the spotlight mode and brush-radius submenu.
 * @param hdc Overlay device context.
 * @param popupRect Submenu bounds.
 * @param modeIdx Current mode (0 brush, 1 rect).
 * @param radiusIdx Current brush radius index.
 * @param m DPI-scaled popup metrics.
 * @returns No return value.
 */
void DrawSpotlightPopup(HDC hdc, const RECT& popupRect, int modeIdx, int radiusIdx, const SCPopupMetrics& m);`
    )
  }
  if (file.endsWith('/overlay_ui_windows.cpp')) {
    return source.replace(
      '// 命中测试子菜单，返回值约定：\n//   +1..+SC_THICK_COUNT',
      `${spotlightPopupUi}
// 命中测试子菜单，返回值约定：
//   +1..+SC_THICK_COUNT`
    )
  }
  if (file.endsWith('/annotations_windows.cpp')) {
    return source
      .replaceAll(
        '            if (a.type == AT_Mosaic && !a.mosaicRect) {',
        '            if ((a.type == AT_Mosaic && !a.mosaicRect) || (a.type == AT_Spotlight && a.spotlightBrush)) {'
      )
      .replace(
        `            case AT_Spotlight:
            case AT_Rect: {
                if (areaInterior && a.type == AT_Spotlight`,
        `            case AT_Spotlight:
                if (a.spotlightBrush) {
                    if (PointToPolylineDist((double)x, (double)y, a.pts) <= a.brushRadius + tol) return i;
                    break;
                }
            case AT_Rect: {
                if (areaInterior && a.type == AT_Spotlight`
      )
      .replace(
        `        case AT_Spotlight: {
            RECT box = MeasureAnnotationBounds(const_cast<Annotation&>(a), hdc);`,
        `        case AT_Spotlight: {
            if (a.spotlightBrush) return RH_None;
            RECT box = MeasureAnnotationBounds(const_cast<Annotation&>(a), hdc);`
      )
      .replace(
        '        } else if (a.type == AT_Arrow) {',
        `        } else if (a.type == AT_Spotlight && a.spotlightBrush) {
            int r = a.brushRadius;
            for (const POINT& p : a.pts) {
                expand(p.x - r, p.y - r);
                expand(p.x + r, p.y + r);
            }
        } else if (a.type == AT_Arrow) {`
      )
  }
  if (file.endsWith('/overlay_input_windows.cpp')) {
    return source
      // 聚光灯按钮重新打开自己的模式子菜单。
      .replace(
        'ctx->popupOpen = b != TB_Spotlight;',
        'ctx->popupOpen = true;'
      )
      // 聚光灯子菜单命中：模式与笔触半径。
      .replace(
        '        // 命中马赛克子菜单（模式切换 + 块大小 + 涂抹半径）',
        `        // 命中聚光灯子菜单（笔触/框选 + 笔触半径）。
        if (ctx->popupOpen && ctx->popupTool == TB_Spotlight) {
            int hit = HitTestSpotlightPopup(mxRel, myRel, ctx->popupRect, ctx->popupMetrics);
            auto clearSel = [&]() {
                RECT dirty = CalcSelectionDirty(ctx, false /*includeToolbar*/);
                ctx->selectedAnnotation = -1;
                ctx->selectedTextAnnotation = -1;
                ctx->hoveredAnnotation = -1;
                ctx->hoveredTextAnnotation = -1;
                return dirty;
            };
            if (hit == 1) {
                ctx->spotlightRectMode = false;
                { RECT d = clearSel();
                  if (IsValidRect(d)) InvalidateRect(hwnd, &d, FALSE); else InvalidateRect(hwnd, NULL, FALSE); }
                return 0;
            }
            if (hit == 2) {
                ctx->spotlightRectMode = true;
                { RECT d = clearSel();
                  if (IsValidRect(d)) InvalidateRect(hwnd, &d, FALSE); else InvalidateRect(hwnd, NULL, FALSE); }
                return 0;
            }
            if (hit >= 201) {
                if ((size_t)(hit - 201) >= (size_t)SC_MOSAIC_RADIUS_COUNT) return 0;
                ctx->spotlightRadiusIdx = hit - 201;
                { RECT d = clearSel();
                  if (IsValidRect(d)) InvalidateRect(hwnd, &d, FALSE); else InvalidateRect(hwnd, NULL, FALSE); }
                return 0;
            }
        }

        // 命中马赛克子菜单（模式切换 + 块大小 + 涂抹半径）`
      )
      // 开始绘制时记录聚光灯模式、半径与首点。
      .replace(
        `            ctx->state = CS_Drawing;
            ctx->needFullRedraw = true;
            return 0;
        }

        // 马赛克工具激活时`,
        `            if (ctx->curDrawing.type == AT_Spotlight) {
                ctx->curDrawing.spotlightBrush = !ctx->spotlightRectMode;
                ctx->curDrawing.brushRadius = SC_MOSAIC_RADIUS[ctx->spotlightRadiusIdx];
                if (ctx->curDrawing.spotlightBrush) {
                    POINT p = { ctx->curDrawing.x1, ctx->curDrawing.y1 };
                    ctx->curDrawing.pts.push_back(p);
                }
            }
            ctx->state = CS_Drawing;
            ctx->needFullRedraw = true;
            return 0;
        }

        // 马赛克工具激活时`
      )
      // 笔触聚光灯记录路径点。
      .replace(
        `            } else if (ctx->curDrawing.type == AT_Mosaic && !ctx->curDrawing.mosaicRect) {
                // 马赛克涂抹模式：记录路径点。揭示由 WM_PAINT 统一处理（reveal-mask 模型，
                // 每帧从预计算的 base 揭示蒙版区域，无需增量绘制）。
                POINT p = { ax, ay };
                ctx->curDrawing.pts.push_back(p);
            } else {`,
        `            } else if (ctx->curDrawing.type == AT_Mosaic && !ctx->curDrawing.mosaicRect) {
                // 马赛克涂抹模式：记录路径点。揭示由 WM_PAINT 统一处理（reveal-mask 模型，
                // 每帧从预计算的 base 揭示蒙版区域，无需增量绘制）。
                POINT p = { ax, ay };
                ctx->curDrawing.pts.push_back(p);
            } else if (ctx->curDrawing.type == AT_Spotlight && ctx->curDrawing.spotlightBrush) {
                POINT p = { ax, ay };
                ctx->curDrawing.pts.push_back(p);
            } else {`
      )
      // 松手校验：笔触聚光灯至少一个点。
      .replace(
        `            } else if (ctx->curDrawing.type == AT_Spotlight) {
                valid = abs(ctx->curDrawing.x2-ctx->curDrawing.x1) >= 2 && abs(ctx->curDrawing.y2-ctx->curDrawing.y1) >= 2;`,
        `            } else if (ctx->curDrawing.type == AT_Spotlight) {
                valid = ctx->curDrawing.spotlightBrush
                    ? ctx->curDrawing.pts.size() >= 1
                    : (abs(ctx->curDrawing.x2-ctx->curDrawing.x1) >= 2 && abs(ctx->curDrawing.y2-ctx->curDrawing.y1) >= 2);`
      )
      // 笔触聚光灯沿用马赛克的半径圆形光标。
      .replace(
        `    // 文字编辑中：I-beam 光标`,
        `    if (ctx->activeTool == TB_Spotlight && !ctx->spotlightRectMode
        && (ctx->state == CS_Confirmed || ctx->state == CS_Drawing)
        && ctx->mosaicBrushCursorsInited
        && ctx->spotlightRadiusIdx >= 0 && ctx->spotlightRadiusIdx < SC_MOSAIC_RADIUS_COUNT
        && ctx->mosaicBrushCursors[ctx->spotlightRadiusIdx]) {
        int mxRel = ctx->mouseX - ctx->virtualX;
        int myRel = ctx->mouseY - ctx->virtualY;
        if (PointInRect(mxRel, myRel, ctx->toolbarRect)) {
            SetCursor(LoadCursorW(NULL, (LPCWSTR)IDC_ARROW));
            return TRUE;
        }
        if (ctx->popupOpen && PointInRect(mxRel, myRel, ctx->popupRect)) {
            SetCursor(LoadCursorW(NULL, (LPCWSTR)IDC_HAND));
            return TRUE;
        }
        if (PointInRect(ctx->mouseX, ctx->mouseY, ctx->selection)) {
            SetCursor(ctx->mosaicBrushCursors[ctx->spotlightRadiusIdx]);
            return TRUE;
        }
    }
    // 文字编辑中：I-beam 光标`
      )
      // 工具栏拖动时按聚光灯子菜单尺寸重排。
      .replace(
        `            if (ctx->popupTool == TB_Mosaic) {
                int mpw, mph;
                CalcMosaicPopupSize(ctx->popupMetrics, mpw, mph);
                CalcPopupPlacement(n, ctx->virtualX, ctx->virtualY,
                    ctx->virtualW, ctx->virtualH, ctx->popupMetrics, mpw, mph, np);
            } else {`,
        `            if (ctx->popupTool == TB_Mosaic) {
                int mpw, mph;
                CalcMosaicPopupSize(ctx->popupMetrics, mpw, mph);
                CalcPopupPlacement(n, ctx->virtualX, ctx->virtualY,
                    ctx->virtualW, ctx->virtualH, ctx->popupMetrics, mpw, mph, np);
            } else if (ctx->popupTool == TB_Spotlight) {
                int mpw, mph;
                CalcSpotlightPopupSize(ctx->popupMetrics, mpw, mph);
                CalcPopupPlacement(n, ctx->virtualX, ctx->virtualY,
                    ctx->virtualW, ctx->virtualH, ctx->popupMetrics, mpw, mph, np);
            } else {`
      )
      // 整体拖动笔触聚光灯时平移路径。
      .replace(
        '                if (a.type == AT_Mosaic && !a.mosaicRect) {',
        '                if ((a.type == AT_Mosaic && !a.mosaicRect) || (a.type == AT_Spotlight && a.spotlightBrush)) {'
      )
  }
  if (file.endsWith('/overlay_paint_windows.cpp')) {
    return source.replace(
      `                DrawMosaicPopup(backDC, curPopupRect, modeIdx, ctx->mosaicSizeIdx,
                    ctx->mosaicRadiusIdx, ctx->popupMetrics);
            }`,
      `                DrawMosaicPopup(backDC, curPopupRect, modeIdx, ctx->mosaicSizeIdx,
                    ctx->mosaicRadiusIdx, ctx->popupMetrics);
            }
            // 聚光灯子菜单：笔触/框选 + 笔触半径
            else if (ctx->popupOpen && popupTool == TB_Spotlight) {
                int mpw, mph;
                CalcSpotlightPopupSize(ctx->popupMetrics, mpw, mph);
                CalcPopupPlacement(curToolbarRect, ctx->virtualX, ctx->virtualY,
                    ctx->virtualW, ctx->virtualH,
                    ctx->popupMetrics, mpw, mph, curPopupRect);
                ctx->popupRect = curPopupRect;
                DrawSpotlightPopup(backDC, curPopupRect, ctx->spotlightRectMode ? 1 : 0,
                    ctx->spotlightRadiusIdx, ctx->popupMetrics);
            }`
    )
  }
  return source
}

/**
 * 统一非笔触标记的选中、拖动与缩放，并恢复“未选中任何工具”的选择态。
 * 命中优先级：已选中元素的手柄 > 已有元素 > 空白处新建，避免拖动与放置互相抢占。
 * @param {string} file 已应用既有补丁的源码路径。
 * @param {string} source 当前源码文本。
 * @returns {string} 完善后的源码文本。
 */
function enhanceMarkInteraction(file, source) {
  if (file.endsWith('/annotations_windows.cpp')) {
    return (
      source
        // 区分区域绘制工具：同一种区域工具下只认边框，内部点击继续新建，避免抢占。
        .replace(
          'bool IsDragTool(int btn) {\n    return btn == TB_Drag;\n}',
          `bool IsDragTool(int btn) {
    return btn == TB_Drag;
}

/**
 * Recognize tools that draw filled regions whose interior would otherwise swallow new marks.
 * @param btn Toolbar button index.
 * @returns Whether interior clicks must stay available for drawing.
 */
bool IsAreaDrawTool(int btn) {
    return btn == TB_Spotlight || btn == TB_Mosaic;
}`
        )
        .replace(
          'int HitTestAnnotation(std::vector<Annotation>& anns, int x, int y, HDC hdc) {',
          'int HitTestAnnotation(std::vector<Annotation>& anns, int x, int y, HDC hdc, bool areaInterior) {'
        )
        // 马赛克不再整体跳过：框选按矩形、涂抹按路径半径参与命中。
        .replace(
          '        // 马赛克区域（框选/涂抹）不可选中、不可拖拽，直接跳过命中测试。\n        if (a.type == AT_Mosaic) continue;\n',
          ''
        )
        .replace(
          '// AT_Mosaic 在循环顶部 continue 跳过（马赛克不可选中），故 switch 内无 AT_Mosaic case。',
          '// AT_Mosaic 与其他标记一样参与命中：框选按矩形边框，涂抹按路径半径。'
        )
        .replace(
          '//   画笔/马赛克 = 无手柄（RH_None，不可缩放，画笔仅可整体拖动）。',
          '//   框选马赛克 = 包围盒 8 手柄；画笔/涂抹马赛克 = 无手柄（仅可整体拖动）。'
        )
        .replace(
          '            case AT_Spotlight:\n            case AT_Rect: {\n',
          `            case AT_Mosaic: {
                if (a.mosaicRect) {
                    // 选择态整块可点选；绘制态只认边框，内部点击仍可新建马赛克。
                    if (areaInterior && x >= (std::min)(a.x1, a.x2) && x <= (std::max)(a.x1, a.x2)
                        && y >= (std::min)(a.y1, a.y2) && y <= (std::max)(a.y1, a.y2)) return i;
                    double d1 = PointToSegmentDist((double)x, (double)y, a.x1, a.y1, a.x2, a.y1);
                    double d2 = PointToSegmentDist((double)x, (double)y, a.x2, a.y2, a.x1, a.y2);
                    double d3 = PointToSegmentDist((double)x, (double)y, a.x1, a.y2, a.x1, a.y1);
                    double d4 = PointToSegmentDist((double)x, (double)y, a.x2, a.y1, a.x2, a.y2);
                    double dm = (std::min)((std::min)(d1, d2), (std::min)(d3, d4));
                    if (dm <= tol) return i;
                } else if (PointToPolylineDist((double)x, (double)y, a.pts) <= a.brushRadius + tol) {
                    return i;
                }
                break;
            }
            case AT_Spotlight:
            case AT_Rect: {
                if (areaInterior && a.type == AT_Spotlight
                    && x >= (std::min)(a.x1, a.x2) && x <= (std::max)(a.x1, a.x2)
                    && y >= (std::min)(a.y1, a.y2) && y <= (std::max)(a.y1, a.y2)) return i;
`
        )
        // 框选马赛克与矩形一样提供八个手柄；涂抹路径只能整体拖动。
        .replace(
          '        case AT_Arrow:\n            return HitTestArrowEndpoints',
          `        case AT_Mosaic: {
            if (!a.mosaicRect) return RH_None;
            RECT box = MeasureAnnotationBounds(const_cast<Annotation&>(a), hdc);
            return HitTestAnnotationHandle(x, y, box, handleSize);
        }
        case AT_Arrow:
            return HitTestArrowEndpoints`
        )
    )
  }
  if (file.endsWith('/overlay_input_windows.cpp')) {
    return (
      source
        // 所有工具都先选中已有元素；区域工具下只有内部让位给新建。
        .replace(
          'int hitAnn = (ctx->activeTool == TB_Number || ctx->activeTool == TB_Spotlight || ctx->activeTool == TB_Highlighter) ? -1 : HitTestAnnotation(ctx->annotations, ctx->mouseX, ctx->mouseY, ctx->backDC);',
          'int hitAnn = HitTestAnnotation(ctx->annotations, ctx->mouseX, ctx->mouseY, ctx->backDC, !IsAreaDrawTool(ctx->activeTool));'
        )
        .replace(
          'ha = HitTestAnnotation(ctx->annotations, ctx->mouseX, ctx->mouseY, ctx->backDC);',
          'ha = HitTestAnnotation(ctx->annotations, ctx->mouseX, ctx->mouseY, ctx->backDC, !IsAreaDrawTool(ctx->activeTool));'
        )
        .replace(
          'int hit = HitTestAnnotation(ctx->annotations, ctx->mouseX, ctx->mouseY, ctx->backDC);',
          'int hit = HitTestAnnotation(ctx->annotations, ctx->mouseX, ctx->mouseY, ctx->backDC, !IsAreaDrawTool(ctx->activeTool));'
        )
        // 拖拽工具或未选中工具时同样允许缩放，不再按工具禁用缩放手柄。
        .replace(
          `        if (ctx->selectedAnnotation >= 0 && ctx->selectedAnnotation < (int)ctx->annotations.size()
            && !IsDragTool(ctx->activeTool)) {`,
          `        if (ctx->selectedAnnotation >= 0 && ctx->selectedAnnotation < (int)ctx->annotations.size()) {`
        )
        // 选中元素时只为真正支持样式参数的标记打开子菜单。
        .replace(
          `            ctx->activeTool = AnnotationTypeToTool(hitA.type);
            ctx->popupTool = ctx->activeTool;
            ctx->popupOpen = true;`,
          `            ctx->activeTool = AnnotationTypeToTool(hitA.type);
            ctx->popupTool = ctx->activeTool;
            ctx->popupOpen = CanShowStylePopupTool(ctx->activeTool);`
        )
        .replace(
          '            // 按类型命中缩放手柄：箭头=2 端点；矩形/圆=8 手柄；画笔=无（仅可拖动）',
          '            // 按类型命中缩放手柄：箭头=2 端点；矩形/圆/聚光灯/序号/框选马赛克=8 手柄；其余仅可拖动'
        )
    )
  }
  if (file.endsWith('/overlay_paint_windows.cpp')) {
    return source
      .replace(
        `            //   矩形：无包围盒 + 8 手柄（4 角 + 4 边中点）
            //   圆形：蓝色虚线包围盒 + 8 手柄（4 角 + 4 边中点）
            //   箭头：无包围盒 + 2 端点手柄
            //   画笔：蓝色虚线包围盒 + 无手柄（仅可整体拖动）`,
        `            //   矩形：无包围盒 + 8 手柄（4 角 + 4 边中点）
            //   圆形/聚光灯/序号：蓝色虚线包围盒 + 8 手柄
            //   箭头：无包围盒 + 2 端点手柄
            //   框选马赛克：虚线包围盒 + 8 手柄；画笔/涂抹马赛克：虚线包围盒 + 无手柄`
      )
      .replace(
        '                if (selA.type == AT_Circle || selA.type == AT_Brush) {',
        `                // 区域类标记平时没有可见边框，选中后统一显示虚框。
                if (selA.type == AT_Circle || selA.type == AT_Brush || selA.type == AT_Spotlight
                    || selA.type == AT_Number || selA.type == AT_Mosaic) {`
      )
      .replace(
        '                } else if (selA.type == AT_Rect || selA.type == AT_Circle) {',
        `                } else if (selA.type == AT_Rect || selA.type == AT_Circle
                           || selA.type == AT_Spotlight || selA.type == AT_Number
                           || (selA.type == AT_Mosaic && selA.mosaicRect)) {`
      )
  }
  if (file.endsWith('/wndproc_windows.cpp')) {
    return source.replace(
      '    if (ctx->activeTool < 0) ctx->activeTool = TB_Drag;\n',
      '    // 保持未选中工具的选择态：此时选中框、手柄和整体拖动都可用，点击空白不会新建标记。\n'
    )
  }
  if (file.endsWith('/internal.h')) {
    return source
      .replace(
        'int HitTestAnnotation(std::vector<Annotation>& anns, int x, int y, HDC hdc);',
        `/**
 * Resolve the topmost mark, allowing area interiors when the select state is active.
 * @param anns History items to inspect.
 * @param x Horizontal pointer coordinate.
 * @param y Vertical pointer coordinate.
 * @param hdc Target device context.
 * @param areaInterior Whether filled regions may be hit anywhere inside.
 * @returns Mark index, or -1 when nothing matches.
 */
int HitTestAnnotation(std::vector<Annotation>& anns, int x, int y, HDC hdc, bool areaInterior = false);`
      )
      .replace(
        'bool IsDragTool(int btn);',
        `bool IsDragTool(int btn);
/**
 * Report whether the tool paints a filled region that needs interior clicks for new marks.
 * @param btn Toolbar button index.
 * @returns Whether the tool is a filled-region draw tool.
 */
bool IsAreaDrawTool(int btn);`
      )
  }
  return source
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
      '#pragma once',
      '#pragma once\nstatic const char* kIconSvg_Ocr = ' +
        JSON.stringify(catalogue.svg(OCR_ICON_PATH)) +
        ';'
    )
    .replace(
      'kIconSvg_Brush, kIconSvg_Mosaic',
      'kIconSvg_Brush, kIconSvg_Highlighter, kIconSvg_Mosaic'
    )
    .replace(
      'kIconSvg_Text, kIconSvg_LongCapture',
      'kIconSvg_Text, kIconSvg_Number, kIconSvg_Spotlight, kIconSvg_Ocr, kIconSvg_LongCapture'
    )
  fs.writeFileSync(file, header)
}

const spotlightRenderer = `/**
 * Darken the complement of all spotlight rectangles and brush paths once.
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
        if (a.type != AT_Spotlight) return;
        if (a.spotlightBrush) {
            if (a.pts.empty()) return;
            float r = (float)a.brushRadius;
            if (r < 1.0f) r = 1.0f;
            Gdiplus::GraphicsPath path;
            // GraphicsPath 默认交替填充，重叠胶囊会互相抵消出洞；改用绕向填充取并集。
            path.SetFillMode(Gdiplus::FillModeWinding);
            for (size_t i = 0; i < a.pts.size(); i++) {
                float px = a.pts[i].x + ox, py = a.pts[i].y + oy;
                path.AddEllipse(px - r, py - r, r * 2, r * 2);
                if (i == 0) continue;
                float qx = a.pts[i - 1].x + ox, qy = a.pts[i - 1].y + oy;
                float dx = px - qx, dy = py - qy;
                float len = std::sqrt(dx * dx + dy * dy);
                if (len < 0.01f) continue;
                float nx = -dy / len * r, ny = dx / len * r;
                Gdiplus::PointF quad[4] = {
                    Gdiplus::PointF(qx - nx, qy - ny),
                    Gdiplus::PointF(px - nx, py - ny),
                    Gdiplus::PointF(px + nx, py + ny),
                    Gdiplus::PointF(qx + nx, qy + ny)
                };
                path.AddPolygon(quad, 4);
            }
            found = true;
            Gdiplus::Region region(&path);
            mask.Exclude(&region);
            return;
        }
        if (abs(a.x2-a.x1) < 2 || abs(a.y2-a.y1) < 2) return;
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

const spotlightPopupUi = `// 聚光灯子菜单：模式（笔触/框选）+ 笔触半径，不含块大小。
static const int SC_SPOTLIGHT_MODE_COUNT = 2;

/**
 * Size the spotlight submenu with one mode group and one brush-radius group.
 * @param m DPI-scaled popup metrics.
 * @param outW Resolved popup width.
 * @param outH Resolved popup height.
 * @returns No return value.
 */
void CalcSpotlightPopupSize(const SCPopupMetrics& m, int& outW, int& outH) {
    int cellGap = PopupCellGap(m);
    int modeW = SC_SPOTLIGHT_MODE_COUNT * m.cell + (SC_SPOTLIGHT_MODE_COUNT - 1) * cellGap;
    int radiusW = SC_MOSAIC_RADIUS_COUNT * m.cell + (SC_MOSAIC_RADIUS_COUNT - 1) * cellGap;
    int contentW = modeW + (m.sepGap * 2 + 1) + radiusW;
    outW = contentW + m.pad * 2 + m.border * 2;
    outH = m.cell + m.pad * 2 + m.border * 2;
}

/**
 * Resolve spotlight submenu hits.
 * @param x Horizontal pointer coordinate.
 * @param y Vertical pointer coordinate.
 * @param popupRect Submenu bounds.
 * @param m DPI-scaled popup metrics.
 * @returns 1 brush mode, 2 rect mode, 201+ radius index, or 0 for spacing.
 */
int HitTestSpotlightPopup(int x, int y, const RECT& popupRect, const SCPopupMetrics& m) {
    if (!PointInRect(x, y, popupRect)) return 0;
    int contentLeft = popupRect.left + m.border + m.pad;
    int contentTop = popupRect.top + m.border + m.pad;
    int cellGap = PopupCellGap(m);
    if (y < contentTop || y >= contentTop + m.cell) return 0;
    for (int i = 0; i < SC_SPOTLIGHT_MODE_COUNT; i++) {
        int ix = contentLeft + i * (m.cell + cellGap);
        if (x >= ix && x < ix + m.cell) return i + 1;
    }
    int modeEndX = contentLeft + SC_SPOTLIGHT_MODE_COUNT * m.cell
        + (SC_SPOTLIGHT_MODE_COUNT - 1) * cellGap;
    int radiusStartX = modeEndX + m.sepGap * 2 + 1;
    if (x < radiusStartX) return 0;
    for (int i = 0; i < SC_MOSAIC_RADIUS_COUNT; i++) {
        int ix = radiusStartX + i * (m.cell + cellGap);
        if (x >= ix && x < ix + m.cell) return 200 + i + 1;
    }
    return 0;
}

/**
 * Draw the spotlight mode and brush-radius submenu.
 * @param hdc Overlay device context.
 * @param popupRect Submenu bounds.
 * @param modeIdx Current mode (0 brush, 1 rect).
 * @param radiusIdx Current brush radius index.
 * @param m DPI-scaled popup metrics.
 * @returns No return value.
 */
void DrawSpotlightPopup(HDC hdc, const RECT& popupRect, int modeIdx, int radiusIdx,
                        const SCPopupMetrics& m) {
    Gdiplus::Graphics graphics(hdc);
    graphics.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);
    int pw = popupRect.right - popupRect.left;
    int ph = popupRect.bottom - popupRect.top;
    Gdiplus::SolidBrush whiteBrush(Gdiplus::Color(255, 255, 255, 255));
    Gdiplus::GraphicsPath bgPath;
    AddRoundedRect(bgPath, popupRect.left, popupRect.top, pw, ph, m.radius);
    graphics.FillPath(&whiteBrush, &bgPath);
    Gdiplus::Pen borderPen(Gdiplus::Color(255, 210, 210, 210), (Gdiplus::REAL)m.border);
    graphics.DrawPath(&borderPen, &bgPath);

    int contentLeft = popupRect.left + m.border + m.pad;
    int contentTop = popupRect.top + m.border + m.pad;
    int midY = contentTop + m.cell / 2;
    int cellGap = PopupCellGap(m);
    auto cellColor = [&](bool sel) -> Gdiplus::Color {
        return sel ? ScOpaqueColor(SC_THEME_TOOLBAR_BLUE)
                   : ScOpaqueColor(SC_THEME_ICON_DARK);
    };

    // 模式组：笔触曲线 / 框选矩形。
    for (int i = 0; i < SC_SPOTLIGHT_MODE_COUNT; i++) {
        int cellLeft = contentLeft + i * (m.cell + cellGap);
        bool sel = (i == modeIdx);
        if (sel) DrawPopupCellBg(graphics, m, contentTop, cellLeft,
                                 ScOpaqueColor(SC_THEME_SEL_BG));
        int cx = cellLeft + m.cell / 2;
        Gdiplus::Color c = cellColor(sel);
        if (i == 0) {
            Gdiplus::Pen pen(c, (Gdiplus::REAL)2.0f);
            pen.SetLineJoin(Gdiplus::LineJoinRound);
            pen.SetStartCap(Gdiplus::LineCapRound);
            pen.SetEndCap(Gdiplus::LineCapRound);
            Gdiplus::PointF curve[] = {
                Gdiplus::PointF((float)(cx - m.cell * 0.28), (float)(midY + m.cell * 0.18)),
                Gdiplus::PointF((float)(cx - m.cell * 0.10), (float)(midY - m.cell * 0.18)),
                Gdiplus::PointF((float)(cx + m.cell * 0.10), (float)(midY + m.cell * 0.18)),
                Gdiplus::PointF((float)(cx + m.cell * 0.28), (float)(midY - m.cell * 0.18)),
            };
            graphics.DrawLines(&pen, curve, 4);
        } else {
            Gdiplus::Pen pen(c, (Gdiplus::REAL)2.0f);
            int r = (int)(m.cell * 0.24);
            graphics.DrawRectangle(&pen, cx - r, midY - r, r * 2, r * 2);
        }
    }

    // 分隔线
    int modeEndX = contentLeft + SC_SPOTLIGHT_MODE_COUNT * m.cell
        + (SC_SPOTLIGHT_MODE_COUNT - 1) * cellGap;
    int sepX = modeEndX + m.sepGap;
    Gdiplus::Pen sepPen(Gdiplus::Color(255, 220, 220, 220), 1.0f);
    graphics.DrawLine(&sepPen, sepX, midY - m.sepH / 2, sepX, midY + m.sepH / 2);

    // 笔触半径组：框选模式下置灰但仍可点击，切回笔触立即生效。
    int radiusStartX = sepX + m.sepGap + 1;
    bool radiusEnabled = (modeIdx == 0);
    for (int i = 0; i < SC_MOSAIC_RADIUS_COUNT; i++) {
        int cellLeft = radiusStartX + i * (m.cell + cellGap);
        bool sel = (i == radiusIdx) && radiusEnabled;
        if (sel) DrawPopupCellBg(graphics, m, contentTop, cellLeft,
                                 ScOpaqueColor(SC_THEME_SEL_BG));
        Gdiplus::Color c = cellColor(sel);
        int cx = cellLeft + m.cell / 2;
        int dotD = (int)(SC_MOSAIC_RADIUS[i] * 0.5 * (m.cell / (double)SC_POPUP_CELL) + 0.5);
        if (dotD < 5) dotD = 5;
        if (dotD > m.cell - 4) dotD = m.cell - 4;
        int r = dotD / 2;
        Gdiplus::Color drawC = radiusEnabled ? c
            : Gdiplus::Color(160, c.GetRed(), c.GetGreen(), c.GetBlue());
        Gdiplus::SolidBrush brush(drawC);
        graphics.FillEllipse(&brush, cx - r, midY - r, r * 2, r * 2);
    }
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
