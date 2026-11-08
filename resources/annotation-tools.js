/* Shared with the native screenshot build. Original line icons follow the screenshot's 1.5px style. */
;((scope) => {
  const tools = [
    [
      'rect',
      'Rect',
      '矩形',
      'R',
      'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
    ],
    ['ellipse', 'Circle', '椭圆', 'O', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
    ['arrow', 'Arrow', '箭头', 'A', 'M5 19 19 5M8 5h11v11'],
    ['pen', 'Brush', '画笔', 'B', 'M4 20h4L18.5 9.5a2.828 2.828 0 1 0-4-4L4 16zm9.5-13.5 4 4'],
    [
      'highlighter',
      'Highlighter',
      '荧光笔',
      'H',
      'm8 15 7-10a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3l-10 7zm0 0-3 5h5l1-3M3 22h18M13 8l5 5'
    ],
    [
      'mosaic',
      'Mosaic',
      '马赛克',
      'M',
      'M3 3h6v6H3zM15 3h6v6h-6zM9 9h6v6H9zM3 15h6v6H3zM15 15h6v6h-6z'
    ],
    ['text', 'Text', '文字', 'T', 'M4 6V4h16v2M12 4v16M8 20h8'],
    [
      'number',
      'Number',
      '序号圆圈',
      'N',
      'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M10 9l2-1v8M10 16h4'
    ],
    [
      'spotlight',
      'Spotlight',
      '聚光灯',
      'S',
      'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0'
    ]
  ].map(([id, native, label, key, path]) => ({ id, native, label, key, path }))
  const actions = {
    undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12',
    redo: 'm15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12',
    clear: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
    eraser:
      'm4 14 9-10a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3L10 21H7l-3-4a2 2 0 0 1 0-3zm4-5 8 8M10 21h11'
  }
  /**
   * Produce the same scalable line icon for the web toolbar and native rasterizer.
   * @param {string} path Trusted path from this local catalogue.
   * @returns {string} Standalone SVG markup.
   */
  function svg(path) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="${path}"/></svg>`
  }
  const catalogue = { tools, actions, svg }
  if (typeof module !== 'undefined') module.exports = catalogue
  else scope.annotationTools = catalogue
})(globalThis)
