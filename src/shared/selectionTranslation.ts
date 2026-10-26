/**
 * 判断选文是否需要自动翻译，忽略空白、标点和数字，中文占主要文字时跳过。
 * @param text 当前选中的文本。
 * @returns 存在文字且并非以中文为主时返回 true；含假名的日文继续翻译。
 */
export function shouldAutoTranslateSelection(text: string): boolean {
  const letters = text.match(/\p{L}/gu) || []
  if (letters.length === 0) return false
  // 汉字与假名混排通常为日文，不能仅凭汉字占比跳过。
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return true
  const chinese = text.match(/\p{Script=Han}/gu) || []
  return chinese.length / letters.length <= 0.5
}
