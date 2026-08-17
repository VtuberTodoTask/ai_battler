export function projectAbilityToRadarRatio(
  value: number,
  min: number,
  max: number,
): number {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(min) ||
    !Number.isFinite(max)
  ) {
    return 0
  }
  const range = max - min
  if (range <= 0) return 0
  return Math.max(0, Math.min(1, (value - min) / range))
}

export interface RadarPoint {
  x: number
  y: number
  value: number
  label: string
}

export function buildRadarPoints(
  values: { name: string; value: number }[],
  centerX: number,
  centerY: number,
  radius: number,
  min: number,
  max: number,
): RadarPoint[] {
  const count = values.length
  return values.map((stat, index) => {
    const ratio = projectAbilityToRadarRatio(stat.value, min, max)
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(1, count)
    return {
      x: centerX + Math.cos(angle) * radius * ratio,
      y: centerY + Math.sin(angle) * radius * ratio,
      value: stat.value,
      label: stat.name,
    }
  })
}
