export interface StatusGaugeProjection {
  ratio: number
  display: string
  percent: string
}

export function projectStatusGauge(
  current: number,
  max: number,
): StatusGaugeProjection {
  if (!Number.isFinite(current) || !Number.isFinite(max)) {
    return { ratio: 0, display: '—', percent: '—' }
  }
  const ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0
  const display = max > 0 ? `${Math.round(current)} / ${Math.round(max)}` : '—'
  const percent = max > 0 ? `${Math.round(ratio * 100)}%` : '—'
  return { ratio, display, percent }
}
