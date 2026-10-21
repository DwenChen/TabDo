/**
 * 指令相关纯函数工具
 * 提取自 commandDataStore.ts，便于单元测试
 */

import { getCommandId as _getCommandId, type CommandIdLike } from '@shared/commandShared'

interface MatchInfo {
  indices: Array<[number, number]>
  value: string
  key: string
}

interface CommandLike extends CommandIdLike {
  path: string
  subType?: string
  [key: string]: any
}

/**
 * 生成指令唯一标识（与设置插件保持一致）
 * 格式: pluginName:featureCode:cmdName:cmdType
 */
export function getCommandId(cmd: CommandIdLike): string {
  return _getCommandId(cmd)
}

/**
 * 应用特殊指令配置
 * @param command 原始指令
 * @param specialCommands 特殊指令配置表
 * @returns 应用了特殊配置的指令
 */
export function applySpecialConfig<T extends CommandLike>(
  command: T,
  specialCommands: Record<string, Partial<T>>
): T {
  // 1. 优先通过 path 精确匹配
  const pathConfig = specialCommands[command.path]
  if (pathConfig) {
    return { ...command, ...pathConfig }
  }

  // 2. 通过 subType 匹配
  if (command.subType) {
    const subTypeKey = `subType:${command.subType}`
    const subTypeConfig = specialCommands[subTypeKey]
    if (subTypeConfig) {
      return { ...command, ...subTypeConfig }
    }
  }

  return command
}

/**
 * 生成指令使用统计的查找键。
 *
 * 插件按路径与功能码识别，显示别名不能使同一功能丢失统计；普通应用仍区分路径与名称。
 *
 * @param command 指令对象。
 * @returns 使用统计查找键。
 */
export function getUsageStatsKey(command: {
  path: string
  featureCode?: string | null
  name?: string
}): string {
  return command.featureCode
    ? `${command.path}|${command.featureCode}`
    : `${command.path}||${command.name || ''}`
}

/**
 * 把当前候选中上一次使用的指令固定在首位，其余按真实频次降序排列。
 * @param commands 当前已匹配的候选，不包含不适用的历史指令。
 * @param stats 按稳定指令身份索引的历史统计。
 * @returns 新排序数组；同频次按最近时间，再保持原有顺序。
 */
export function sortCommandsByUsage<T extends CommandLike>(
  commands: T[],
  stats: Record<string, { useCount?: number; lastUsed?: number }>
): T[] {
  const ranked = commands.map((command, index) => {
    const usage = stats[getUsageStatsKey(command)]
    return {
      command,
      index,
      count: Math.max(0, Number(usage?.useCount) || 0),
      lastUsed: Math.max(0, Number(usage?.lastUsed) || 0)
    }
  })
  // 首位是明确的最近一项，频次不封顶，也不通过权重或时间衰减竞争首位。
  let latestIndex = -1
  let latestTime = 0
  for (const item of ranked) {
    if (item.lastUsed > latestTime) {
      latestIndex = item.index
      latestTime = item.lastUsed
    }
  }
  return ranked
    .sort(
      (a, b) =>
        Number(b.index === latestIndex) - Number(a.index === latestIndex) ||
        b.count - a.count ||
        b.lastUsed - a.lastUsed ||
        a.index - b.index
    )
    .map((item) => item.command)
}

/** 频次加分上限对应的使用次数。 */
const USAGE_FREQUENCY_FULL_COUNT = 10
/** 频次加分最大值。 */
const USAGE_FREQUENCY_MAX_BONUS = 120
/** 最近使用加分最大值。 */
const USAGE_RECENCY_MAX_BONUS = 180
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 计算指令的使用热度加分（使用频次 + 最近使用）。
 *
 * 文本匹配分是绝对主项（完全匹配 10000、前缀 5000、连续命中 2000），
 * 这里把加分压在同一量级内（不超过 300），只用来在匹配相近时把常用与刚用过的指令提前，
 * 不会盖过更好的文本匹配。
 *
 * @param stats 该指令的历史使用统计，缺省表示从未使用。
 * @param now 当前时间戳，便于测试注入。
 * @returns 0 到 300 之间的使用热度加分。
 */
export function calculateUsageBoost(
  stats?: { useCount?: number; lastUsed?: number },
  now: number = Date.now()
): number {
  if (!stats) return 0
  const count = Math.min(USAGE_FREQUENCY_FULL_COUNT, Math.max(0, Number(stats.useCount) || 0))
  const frequency = (count / USAGE_FREQUENCY_FULL_COUNT) * USAGE_FREQUENCY_MAX_BONUS
  const lastUsed = Number(stats.lastUsed) || 0
  if (!lastUsed) return frequency
  const age = Math.max(0, now - lastUsed)
  // 从最后一次使用开始连续衰减；同一天内也能区分刚使用与较早使用的指令。
  const recency = USAGE_RECENCY_MAX_BONUS * Math.max(0, 1 - age / (7 * DAY_MS))
  return frequency + recency
}

/**
 * 计算搜索匹配分数
 * @param text 被搜索的文本
 * @param query 搜索关键词
 * @param matches 匹配信息
 * @param command 指令对象（可选，用于类型加权）
 * @returns 分数（越高越好）
 */
export function calculateMatchScore(
  text: string,
  query: string,
  matches?: MatchInfo[],
  command?: CommandLike
): number {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  // 1. 完全匹配（最高优先级，不区分类型）
  if (lowerText === lowerQuery) {
    return 10000
  }

  // 如果没有匹配信息，返回 0
  if (!matches || matches.length === 0) {
    return 0
  }

  let score = 0

  // 2. 前缀匹配（次高优先级）
  if (lowerText.startsWith(lowerQuery)) {
    score += 5000
  }

  // 3. 连续匹配检测
  const consecutiveMatch = lowerText.includes(lowerQuery)
  if (consecutiveMatch) {
    score += 2000
    // 连续匹配位置越靠前，分数越高
    const position = lowerText.indexOf(lowerQuery)
    score += Math.max(0, 500 - position * 10)
  }

  // 4. 匹配长度占比（匹配越多，分数越高）
  const matchRatio = query.length / text.length
  score += matchRatio * 100

  // 5. 匹配位置（越靠前越好）
  if (matches.length > 0 && matches[0].indices && matches[0].indices.length > 0) {
    const firstMatchPosition = matches[0].indices[0][0]
    score += Math.max(0, 100 - firstMatchPosition)
  }

  // 6. 类型权重：系统应用权重略高于其他类型（仅在非完全匹配时生效）
  if (command && command.type === 'direct' && command.subType === 'app') {
    score += 300
  }

  return score
}
