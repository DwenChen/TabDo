/**
 * 生成与原生诊断客户端一致的31ms相位编码短音，区别于任意非静音背景。
 * @param index 短音内的采样序号。
 * @param sampleRate 每秒采样数。
 * @param phase 载波相位，缺省为实际发射的正弦；匹配器另用正交分量。
 * @returns 当前有符号浮点PCM采样，短音范围之外为零。
 */
export function diagnosticToneSample(index: number, sampleRate: number, phase = 0): number {
  const seconds = index / sampleRate
  const chip = Math.floor(seconds * 1000)
  if (index < 0 || chip >= 31) return 0
  const sign = (0x6d2b79f5 >>> chip) & 1 ? 1 : -1
  return 0.35 * sign * Math.sin(2 * Math.PI * 3000 * seconds + phase)
}

/**
 * 通过归一化相关匹配定位专用短音，背景响度和搜索窗口起点不能冒充参考脉冲。
 * @param samples 单声道浮点PCM。
 * @param sampleRate PCM采样率。
 * @param first 首个待搜索的短音起点，单位采样。
 * @param last 搜索起点的排他上界，模板仍须完整落在PCM内。
 * @returns 匹配起点与相关度；没有可靠匹配时为空。
 * @throws {Error} 采样率不是有限正数时抛出。
 */
export function findDiagnosticTone(
  samples: Float32Array,
  sampleRate: number,
  first = 0,
  last = samples.length
): { sample: number; correlation: number } | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('Invalid PCM sample rate')
  const length = Math.ceil(sampleRate * 0.031)
  // 对输入与模板应用同一差分，抑制低频背景和直流，不移动匹配的原始采样位置。
  const filtered = Float32Array.from(
    samples,
    (value, index) => value - (index ? samples[index - 1] : 0)
  )
  const template = Float64Array.from(
    { length },
    (_, index) =>
      diagnosticToneSample(index, sampleRate) - diagnosticToneSample(index - 1, sampleRate)
  )
  const quadrature = Float64Array.from(
    { length },
    (_, index) =>
      diagnosticToneSample(index, sampleRate, Math.PI / 2) -
      diagnosticToneSample(index - 1, sampleRate, Math.PI / 2)
  )
  const blocks: {
    first: number
    last: number
    aa: number
    bb: number
    ab: number
    determinant: number
  }[] = []
  const blockLength = Math.max(1, Math.round(sampleRate * 0.004))
  for (let first = 0; first < length; first += blockLength) {
    const last = Math.min(length, first + blockLength)
    let aa = 0,
      bb = 0,
      ab = 0
    for (let index = first; index < last; index++) {
      aa += template[index] * template[index]
      bb += quadrature[index] * quadrature[index]
      ab += template[index] * quadrature[index]
    }
    blocks.push({ first, last, aa, bb, ab, determinant: aa * bb - ab * ab })
  }
  const begin = Math.max(0, Math.floor(first))
  const end = Math.min(Math.ceil(last), samples.length - length + 1)
  let best: { sample: number; correlation: number } | null = null
  // 比较整段编码波形；只有能量阈值而没有波形相关时必须拒绝。
  for (let start = begin; start < end; start++) {
    let energy = 0
    let projected = 0
    let coveredBlocks = 0
    // 每段仍须匹配同一相位编码；正交投影允许包间载波相位变化而不相消。
    for (const block of blocks) {
      let a = 0,
        b = 0
      let blockEnergy = 0
      for (let index = block.first; index < block.last; index++) {
        const value = filtered[start + index]
        a += value * template[index]
        b += value * quadrature[index]
        energy += value * value
        blockEnergy += value * value
      }
      if (block.determinant > 1e-12) {
        const contribution = Math.max(
          0,
          (block.bb * a * a + block.aa * b * b - 2 * block.ab * a * b) / block.determinant
        )
        projected += contribution
        if (blockEnergy > (block.last - block.first) * 1e-8 && contribution >= blockEnergy * 0.36)
          coveredBlocks++
      }
    }
    const correlation = energy > length * 1e-8 ? Math.min(1, Math.sqrt(projected / energy)) : 0
    // 至少四分之三编码分段都须匹配，防止半段短音因其余窗口安静而取得虚高分数。
    if (
      coveredBlocks >= Math.ceil(blocks.length * 0.75) &&
      correlation >= 0.75 &&
      (!best || correlation > best.correlation)
    )
      best = { sample: start, correlation }
  }
  return best
}
