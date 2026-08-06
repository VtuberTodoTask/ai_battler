import { BattleResult } from '../models/types.ts'
import { ExpeditionInjury, ExpeditionState } from './types.ts'

export function isUnresolvedInjury(injury: ExpeditionInjury): boolean {
  return injury.status === 'active' || injury.status === 'worsened'
}

export function isUnresolvedSeriousInjury(injury: ExpeditionInjury): boolean {
  return injury.type === 'serious' && isUnresolvedInjury(injury)
}

export function treatMember(
  state: ExpeditionState,
  targetId: string,
  critical: boolean,
): void {
  // 通常成功: active -> treated、worsened -> active（重症を安定化）
  // criticalSuccess: active/worsened -> treated
  if (state.partyHp[targetId] <= 0) {
    state.partyHp[targetId] = 1
  }
  state.incapacitated = state.incapacitated.filter((id) => id !== targetId)

  for (const injury of state.injuries) {
    if (injury.adventurerId !== targetId || !isUnresolvedInjury(injury)) {
      continue
    }
    if (critical) {
      injury.status = 'treated'
    } else if (injury.status === 'worsened') {
      injury.status = 'active'
    } else if (injury.status === 'active') {
      injury.status = 'treated'
    }
  }
}

export function convertBattleInjuries(
  result: BattleResult,
  battleId: string,
  state: ExpeditionState,
): ExpeditionInjury[] {
  const injuries: ExpeditionInjury[] = []
  for (let i = 0; i < result.injuries.length; i++) {
    const injury = result.injuries[i]
    if (injury.category === 'dead') continue
    const type: 'light' | 'serious' =
      injury.category === 'light' ? 'light' : 'serious'
    const id = `${battleId}-injury-${injury.adventurerId}-${i}`
    if (
      state.injuries.some(
        (existing) =>
          existing.sourceType === 'battle' &&
          existing.sourceId === battleId &&
          existing.adventurerId === injury.adventurerId &&
          existing.type === type,
      )
    ) {
      continue
    }
    injuries.push({
      id,
      adventurerId: injury.adventurerId,
      type,
      cause: `battle: ${result.outcome}`,
      hpLoss: injury.severity,
      status: 'active',
      sourceType: 'battle',
      sourceId: battleId,
    })
  }
  return injuries
}
