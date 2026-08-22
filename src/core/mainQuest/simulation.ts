import { deepClone } from '../util.ts'
import { runBattle } from '../battle/battle.ts'
import type {
  Adventurer,
  BattleLogEntry,
  BattleResult,
  Enemy,
} from '../models/types.ts'
import type { ExpeditionOutcome } from '../expedition/types.ts'
import type { CampaignParty } from '../tavern/campaign/types.ts'
import { NATIONAL_THREAT_IDS, buildMainQuestEnemy } from './threats.ts'
import type {
  MainQuestAttemptRecord,
  MainQuestBattleAnchorId,
  MainQuestBattleEvent,
  MainQuestBattleInitialSnapshot,
  MainQuestBattleTrace,
  MainQuestEvent,
  MainQuestSimulationResult,
  MainQuestState,
  MainQuestThreatId,
} from './types.ts'

/**
 * A retreat attempt (`requestPartyRetreat` / `individualEscape` / the
 * enemy-escape `retreat` entries) always logs its own `roll`/`successChance`
 * regardless of outcome — this re-derives the same pass/fail the engine
 * itself branched on, from those already-authoritative typed fields, rather
 * than string-matching "撤退した"/"撤退に失敗した" out of `entry.result`.
 */
function retreatSucceeded(entry: BattleLogEntry): boolean {
  return (
    entry.roll !== undefined &&
    entry.successChance !== undefined &&
    entry.roll <= entry.successChance
  )
}

function buildInitialSnapshot(
  monster: Enemy,
  partyMembers: Adventurer[],
): MainQuestBattleInitialSnapshot {
  return {
    partyMembers: partyMembers.map((m) => ({
      characterId: m.id,
      currentHp: m.currentHp ?? m.maxHp,
      maxHp: m.maxHp,
      currentMp: m.currentMp ?? m.maxMp,
      maxMp: m.maxMp,
      statuses: m.statusEffects.map((s) => s.type),
    })),
    monster: {
      currentHp: monster.currentHp ?? monster.maxHp,
      maxHp: monster.maxHp,
      statuses: [],
    },
  }
}

/**
 * Derives a granular, replayable `MainQuestBattleTrace` purely from
 * `BattleResult`'s own authoritative structured facts — never re-simulates,
 * never touches RNG, never infers hit/miss/heal-amount/timing from message
 * text or heuristics (Phase 9.8.1 item 3/4/5/10). `BattleLogEntry.hit`/
 * `.critical`/`.healAmount`/`.mpDelta`/`.statusRemoved` (`../battle/
 * battle.ts`) are the source of truth for the facts they cover; every
 * event below reads one of those, or `BattleResult`'s own final-state
 * arrays (`injuries`), never anything derived.
 *
 * Incapacitation and Death are deliberately modeled as two independent,
 * separately-timed facts, matching the underlying Battle Engine's own
 * semantics (audited in `handleUnitDeath`/`resolveAftermath`,
 * `../battle/battle.ts`): a unit reaching 0 HP becomes `incapacitated` at
 * the exact Combat round it happened (from the engine's own `incapacitate`
 * log entry); whether an incapacitated Adventurer ultimately `dies` is only
 * decided afterwards, in the post-Battle Injury/survival roll — so `death`
 * events are always placed at that aftermath determination, never at a
 * guessed mid-Combat round.
 */
export function buildMainQuestBattleTrace(params: {
  seed: string
  threatId: MainQuestThreatId
  monster: Enemy
  partyMembers: Adventurer[]
  battleResult: BattleResult
}): MainQuestBattleTrace {
  const { seed, threatId, monster, partyMembers, battleResult } = params
  const partyMemberIds = partyMembers.map((m) => m.id)
  const memberIds = new Set(partyMemberIds)
  const initialSnapshot = buildInitialSnapshot(monster, partyMembers)
  const deadMemberIds = new Set(
    battleResult.injuries
      .filter((i) => i.category === 'dead')
      .map((i) => i.adventurerId),
  )

  const events: MainQuestBattleEvent[] = []
  const occurredAnchors: MainQuestBattleAnchorId[] = []
  const firedAnchors = new Set<MainQuestBattleAnchorId>()

  function fireAnchor(round: number, anchorId: MainQuestBattleAnchorId): void {
    if (firedAnchors.has(anchorId)) return
    firedAnchors.add(anchorId)
    occurredAnchors.push(anchorId)
    events.push({ type: 'monsterReactionAnchor', round, anchorId })
  }

  events.push({
    type: 'battleStarted',
    monsterId: threatId,
    monsterName: monster.name,
    partyMemberIds,
  })
  fireAnchor(0, 'battle_start')

  let currentRound = 0
  let monsterHp = initialSnapshot.monster.currentHp
  const memberHp = new Map(
    initialSnapshot.partyMembers.map((m) => [m.characterId, m.currentHp]),
  )
  const memberMaxHp = new Map(
    initialSnapshot.partyMembers.map((m) => [m.characterId, m.maxHp]),
  )
  let monsterFirstActionFired = false
  const monsterThresholdsFired = { 75: false, 50: false, 25: false }
  let monsterCriticalFired = false
  let partyCriticalFired = false
  let incapacitatedAnchorFired = false
  let deathAnchorFired = false

  function checkMonsterThresholds(round: number): void {
    const ratio =
      initialSnapshot.monster.maxHp > 0
        ? monsterHp / initialSnapshot.monster.maxHp
        : 0
    if (ratio <= 0.75 && !monsterThresholdsFired[75]) {
      monsterThresholdsFired[75] = true
      fireAnchor(round, 'monster_hp_threshold_75')
    }
    if (ratio <= 0.5 && !monsterThresholdsFired[50]) {
      monsterThresholdsFired[50] = true
      fireAnchor(round, 'monster_hp_threshold_50')
    }
    if (ratio <= 0.25 && !monsterThresholdsFired[25]) {
      monsterThresholdsFired[25] = true
      fireAnchor(round, 'monster_hp_threshold_25')
    }
    if (ratio <= 0.15 && !monsterCriticalFired) {
      monsterCriticalFired = true
      fireAnchor(round, 'monster_critical')
    }
  }

  function checkPartyCritical(round: number, memberId: string): void {
    if (partyCriticalFired) return
    const maxHp = memberMaxHp.get(memberId)
    const currentHp = memberHp.get(memberId)
    if (maxHp === undefined || currentHp === undefined || maxHp <= 0) return
    if (currentHp / maxHp <= 0.25) {
      partyCriticalFired = true
      fireAnchor(round, 'party_member_critical')
    }
  }

  for (const entry of battleResult.logs) {
    if (entry.round !== currentRound) {
      currentRound = entry.round
      events.push({ type: 'roundStarted', round: currentRound })
    }

    if (
      entry.actorId === monster.id &&
      !monsterFirstActionFired &&
      entry.phase === 'combat'
    ) {
      monsterFirstActionFired = true
      fireAnchor(currentRound, 'monster_first_action')
    }

    // Attack resolution: authoritative via `hit`/`critical`, populated only
    // by `resolveAttack`'s own log call — never present on a non-attack
    // entry, so this check alone (not an action-type allow/deny list)
    // decides whether an entry is attack-like.
    if (
      entry.hit !== undefined &&
      entry.actorId !== undefined &&
      entry.targetIds !== undefined &&
      entry.targetIds.length > 0
    ) {
      events.push({
        type: 'actionStarted',
        round: currentRound,
        actorId: entry.actorId,
        actionType: entry.actionType,
      })
      for (const targetId of entry.targetIds) {
        if (entry.hit) {
          events.push({
            type: 'hit',
            round: currentRound,
            actorId: entry.actorId,
            targetId,
            actionType: entry.actionType,
            critical: entry.critical ?? false,
          })
          const amount = entry.damage ?? 0
          events.push({
            type: 'damage',
            round: currentRound,
            actorId: entry.actorId,
            targetId,
            amount,
          })
          if (targetId === monster.id) {
            monsterHp = Math.max(0, monsterHp - amount)
            checkMonsterThresholds(currentRound)
          } else if (memberHp.has(targetId)) {
            memberHp.set(
              targetId,
              Math.max(0, memberHp.get(targetId)! - amount),
            )
            checkPartyCritical(currentRound, targetId)
          }
        } else {
          events.push({
            type: 'miss',
            round: currentRound,
            actorId: entry.actorId,
            targetId,
            actionType: entry.actionType,
          })
        }
        if (entry.statusApplied && entry.statusApplied.length > 0) {
          for (const status of entry.statusApplied) {
            events.push({
              type: 'statusApplied',
              round: currentRound,
              targetId,
              status,
            })
          }
        }
      }
      continue
    }

    // Deliberate heal-like actions (heal/revive) — authoritative via
    // `healAmount`, distinct from a periodic (regen) tick below.
    if (
      entry.healAmount !== undefined &&
      entry.actorId !== undefined &&
      entry.targetIds !== undefined &&
      entry.targetIds.length > 0 &&
      entry.actionType !== 'regen'
    ) {
      const targetId = entry.targetIds[0]
      events.push({
        type: 'healing',
        round: currentRound,
        actorId: entry.actorId,
        targetId,
        amount: entry.healAmount,
      })
      const maxHp = memberMaxHp.get(targetId)
      const currentHp = memberHp.get(targetId)
      if (maxHp !== undefined && currentHp !== undefined) {
        memberHp.set(targetId, Math.min(maxHp, currentHp + entry.healAmount))
      }
      if (entry.statusRemoved && entry.statusRemoved.length > 0) {
        for (const status of entry.statusRemoved) {
          events.push({
            type: 'statusRemoved',
            round: currentRound,
            targetId,
            status,
          })
        }
      }
      if (entry.mpDelta !== undefined) {
        events.push({
          type: 'mpChanged',
          round: currentRound,
          targetId: entry.actorId,
          delta: entry.mpDelta,
        })
      }
      continue
    }

    // Periodic regen tick — no actor, authoritative via `healAmount`.
    if (
      entry.actionType === 'regen' &&
      entry.healAmount !== undefined &&
      entry.targetIds !== undefined &&
      entry.targetIds.length > 0
    ) {
      const targetId = entry.targetIds[0]
      events.push({
        type: 'periodicHealing',
        round: currentRound,
        targetId,
        source: 'regen',
        amount: entry.healAmount,
      })
      const maxHp = memberMaxHp.get(targetId)
      const currentHp = memberHp.get(targetId)
      if (maxHp !== undefined && currentHp !== undefined) {
        memberHp.set(targetId, Math.min(maxHp, currentHp + entry.healAmount))
      }
      continue
    }

    // Periodic poison/bleed tick — no actor, authoritative via `damage`.
    if (
      (entry.actionType === 'poison' || entry.actionType === 'bleed') &&
      entry.damage !== undefined &&
      entry.targetIds !== undefined &&
      entry.targetIds.length > 0
    ) {
      const targetId = entry.targetIds[0]
      events.push({
        type: 'periodicDamage',
        round: currentRound,
        targetId,
        source: entry.actionType,
        amount: entry.damage,
      })
      if (targetId === monster.id) {
        monsterHp = Math.max(0, monsterHp - entry.damage)
        checkMonsterThresholds(currentRound)
      } else if (memberHp.has(targetId)) {
        memberHp.set(
          targetId,
          Math.max(0, memberHp.get(targetId)! - entry.damage),
        )
        checkPartyCritical(currentRound, targetId)
      }
      continue
    }

    // A "great failure" ambush at Contact resolution — forced pre-battle
    // damage with no attacking unit, authoritative via `damage`/
    // `statusApplied` on the engine's own `ambushDamage` entry (never the
    // old aggregate contact-summary log, which carries no per-target
    // breakdown).
    if (
      entry.actionType === 'ambushDamage' &&
      entry.damage !== undefined &&
      entry.targetIds !== undefined &&
      entry.targetIds.length > 0
    ) {
      const targetId = entry.targetIds[0]
      events.push({
        type: 'periodicDamage',
        round: currentRound,
        targetId,
        source: 'ambush',
        amount: entry.damage,
      })
      if (memberHp.has(targetId)) {
        memberHp.set(
          targetId,
          Math.max(0, memberHp.get(targetId)! - entry.damage),
        )
        checkPartyCritical(currentRound, targetId)
      }
      if (entry.statusApplied && entry.statusApplied.length > 0) {
        for (const status of entry.statusApplied) {
          events.push({
            type: 'statusApplied',
            round: currentRound,
            targetId,
            status,
          })
        }
      }
      continue
    }

    if (
      entry.actionType === 'mpConsumed' &&
      entry.mpDelta !== undefined &&
      entry.actorId !== undefined
    ) {
      events.push({
        type: 'mpChanged',
        round: currentRound,
        targetId: entry.actorId,
        delta: entry.mpDelta,
      })
      continue
    }

    if (
      entry.actionType === 'statusExpired' &&
      entry.statusRemoved &&
      entry.targetIds !== undefined &&
      entry.targetIds.length > 0
    ) {
      const targetId = entry.targetIds[0]
      for (const status of entry.statusRemoved) {
        events.push({
          type: 'statusRemoved',
          round: currentRound,
          targetId,
          status,
        })
      }
      continue
    }

    if (
      (entry.actionType === 'retreat' ||
        entry.actionType === 'requestPartyRetreat' ||
        entry.actionType === 'individualEscape') &&
      retreatSucceeded(entry)
    ) {
      events.push({ type: 'retreat', round: currentRound })
      fireAnchor(currentRound, 'retreat_triggered')
      continue
    }

    if (
      entry.actionType === 'incapacitate' &&
      entry.targetIds !== undefined &&
      entry.targetIds.length > 0
    ) {
      const targetId = entry.targetIds[0]
      if (targetId === monster.id) {
        events.push({ type: 'monsterDefeated', round: currentRound })
        fireAnchor(currentRound, 'monster_defeated')
      } else if (memberIds.has(targetId)) {
        events.push({
          type: 'incapacitated',
          round: currentRound,
          memberId: targetId,
        })
        if (!incapacitatedAnchorFired) {
          incapacitatedAnchorFired = true
          fireAnchor(currentRound, 'party_member_incapacitated')
        }
      }
      continue
    }

    if (
      entry.phase === 'aftermath' &&
      entry.actionType === 'injury' &&
      entry.targetIds !== undefined &&
      entry.targetIds.length > 0
    ) {
      const targetId = entry.targetIds[0]
      if (deadMemberIds.has(targetId)) {
        events.push({ type: 'death', round: currentRound, memberId: targetId })
        if (!deathAnchorFired) {
          deathAnchorFired = true
          fireAnchor(currentRound, 'party_member_death')
        }
      }
      continue
    }

    // Generic catch-all for any remaining Status-only fact (guard/self-guard,
    // support, healBlock, contact-phase stun/stealth-start, stealth consumed
    // by attacking, a stunned unit's skipped turn, ...) that isn't already
    // covered by a more specific branch above (every branch above always
    // `continue`s, so this is only ever reached by an entry none of them
    // matched) — authoritative via `statusApplied`/`statusRemoved`, never
    // guessed from `actionType`/`result` text.
    if (
      entry.targetIds !== undefined &&
      entry.targetIds.length > 0 &&
      ((entry.statusApplied && entry.statusApplied.length > 0) ||
        (entry.statusRemoved && entry.statusRemoved.length > 0))
    ) {
      for (const targetId of entry.targetIds) {
        if (entry.statusApplied) {
          for (const status of entry.statusApplied) {
            events.push({
              type: 'statusApplied',
              round: currentRound,
              targetId,
              status,
            })
          }
        }
        if (entry.statusRemoved) {
          for (const status of entry.statusRemoved) {
            events.push({
              type: 'statusRemoved',
              round: currentRound,
              targetId,
              status,
            })
          }
        }
      }
      continue
    }
  }

  const outcome = battleResult.defeatedEnemies.includes(monster.id)
    ? 'victory'
    : 'failure'
  events.push({ type: 'battleEnded', round: battleResult.rounds, outcome })

  return { seed, monsterId: threatId, initialSnapshot, events, occurredAnchors }
}

/**
 * Runs the Deterministic Main Quest Simulation for one Attempt via the
 * existing `runBattle` engine (`../battle/battle.ts`) — the same battle
 * simulator any Elimination-objective Expedition uses — with a fixed,
 * hand-authored boss-tier `Enemy` (`buildMainQuestEnemy`) as the sole
 * opponent. This is the ONE point where randomness is consumed for a Main
 * Quest Attempt; Narrative and Presentation only ever read the resulting
 * facts (Core Doctrine — see module docs on `./types.ts`).
 */
export function simulateMainQuestAttempt(
  campaignSeed: string,
  attempt: MainQuestAttemptRecord,
  partyMembers: Adventurer[],
): { result: MainQuestSimulationResult; battleTrace: MainQuestBattleTrace } {
  const monster = buildMainQuestEnemy(attempt.threatId)
  const seed = `${campaignSeed}:mainquest:${attempt.id}`
  const battleResult = runBattle(seed, partyMembers, [monster])

  const monsterDefeated = battleResult.defeatedEnemies.includes(monster.id)
  const result: MainQuestSimulationResult = {
    outcome: monsterDefeated ? 'victory' : 'failure',
    battleOutcome: battleResult.outcome,
    survivingMemberIds: battleResult.survivingAdventurers,
    incapacitatedMemberIds: battleResult.incapacitatedAdventurers,
    deadMemberIds: battleResult.deadAdventurers,
    monsterDefeated,
    finalMemberStates: battleResult.finalAdventurerStates,
    injuries: battleResult.injuries,
  }

  const battleTrace = buildMainQuestBattleTrace({
    seed,
    threatId: attempt.threatId,
    monster,
    partyMembers,
    battleResult,
  })

  return { result, battleTrace }
}

/**
 * Main Quest has no `ExpeditionOutcome` of its own — it maps its Battle
 * Result onto the closest existing outcome so it can drive the SAME
 * relationship/growth systems a normal Expedition would (items 115/117:
 * no bespoke Main Quest bonus, no double-counted growth), and so the Save
 * Validator's growth-XP causal replay (`../save/validation.ts`) can
 * recognize a Main-Quest-dispatched Party's expected XP using the exact
 * same `EXPEDITION_GROWTH_XP` table the runtime used — shared by both
 * rather than reimplemented. `partialVictory` cannot occur with a single
 * boss opponent (it requires >=50% of a multi-enemy encounter defeated),
 * so it is intentionally not mapped here.
 */
export function mapMainQuestOutcomeToExpeditionOutcome(
  result: MainQuestSimulationResult,
): ExpeditionOutcome {
  if (result.monsterDefeated) return 'completeSuccess'
  if (result.battleOutcome === 'totalLoss') return 'lostExpedition'
  if (result.battleOutcome === 'retreat') return 'forcedRetreat'
  return 'failedObjective'
}

/**
 * Applies a resolved Main Quest Attempt's `finalMemberStates`/`injuries`
 * onto the dispatched Party exactly as a normal Expedition would (item
 * 114) — HP/MP/morale/status from `BattleResult.finalAdventurerStates`,
 * injuries appended, incapacitation recorded. A full party wipe
 * (`battleOutcome === 'totalLoss'`) marks the Party a departing casualty,
 * mirroring `updateCampaignPartyFromResult` in `./partyState.ts` for a
 * lost normal Expedition — Main Quest introduces no separate mechanic for
 * this. Mutates `campaignParty` in place, matching that function's style.
 */
export function applyMainQuestResultToCampaignParty(
  campaignParty: CampaignParty,
  attemptId: string,
  result: MainQuestSimulationResult,
): void {
  const finalStateById = new Map(result.finalMemberStates.map((s) => [s.id, s]))
  for (const member of campaignParty.party.members) {
    const finalState = finalStateById.get(member.id)
    if (!finalState) continue
    member.currentHp = finalState.currentHp
    member.currentMp = finalState.currentMp
    member.morale = finalState.morale
    member.statusEffects = deepClone(finalState.statusEffects)
  }

  campaignParty.condition.incapacitatedIds = [...result.incapacitatedMemberIds]

  // Mirrors convertBattleInjuries (../expedition/injuries.ts) minus its
  // ExpeditionState-scoped de-dup check (a Main Quest Attempt is always a
  // first application of its own injuries onto this Party).
  const injuries: CampaignParty['condition']['injuries'] = []
  result.injuries.forEach((injury, i) => {
    if (injury.category === 'dead') return
    injuries.push({
      id: `${attemptId}-injury-${injury.adventurerId}-${i}`,
      adventurerId: injury.adventurerId,
      type: injury.category === 'light' ? 'light' : 'serious',
      cause: `main-quest: ${result.battleOutcome}`,
      hpLoss: injury.severity,
      status: 'active',
      sourceType: 'battle',
      sourceId: attemptId,
    })
  })
  campaignParty.condition.injuries = injuries

  if (result.battleOutcome === 'totalLoss') {
    campaignParty.departingCasualty = true
  }
}

export interface ResolveMainQuestForDayParams {
  campaignSeed: string
  dayNumber: number
  mainQuestState: MainQuestState
  /** partyId -> that Party's current combat roster, only needed for Attempts dispatched today. */
  partyMembersById: Map<string, Adventurer[]>
}

export interface ResolveMainQuestForDayOutcome {
  mainQuestState: MainQuestState
  events: MainQuestEvent[]
}

/**
 * Pure reducer, shared verbatim by the runtime (`campaign.ts`'s
 * `resolveCampaignDay`) and the Save Validator's causal replay — same
 * pattern as `resolveQuestChainsForDay`/`resolveWorldEventsForDay`. Runs
 * the Simulation for every Attempt dispatched THIS day that has not yet
 * been resolved (in practice at most one, per item 24's one-Main-Quest-
 * per-day rule), applies the resulting Threat/curse transitions, and
 * never re-simulates an Attempt that already carries a `result` (Save/Load
 * of a pending-presentation Attempt must not resimulate — item 74).
 */
export function resolveMainQuestForDay(
  params: ResolveMainQuestForDayParams,
): ResolveMainQuestForDayOutcome {
  const { campaignSeed, dayNumber, mainQuestState, partyMembersById } = params
  const events: MainQuestEvent[] = []

  const dueAttempts = mainQuestState.attempts.filter(
    (a) => a.dayNumber === dayNumber && a.result === undefined,
  )

  let threats = mainQuestState.threats
  let playerCurseStatus = mainQuestState.playerCurseStatus
  let pendingPresentationAttemptId = mainQuestState.pendingPresentationAttemptId

  const nextAttempts = mainQuestState.attempts.map((attempt) => {
    if (!dueAttempts.some((a) => a.id === attempt.id)) return attempt

    const partyMembers = partyMembersById.get(attempt.partyId)
    if (!partyMembers) {
      throw new Error(
        `Main Quest Attempt ${attempt.id} references unknown Party ${attempt.partyId}`,
      )
    }

    const { result, battleTrace } = simulateMainQuestAttempt(
      campaignSeed,
      attempt,
      partyMembers,
    )

    events.push({
      type: 'resolved',
      attemptId: attempt.id,
      threatId: attempt.threatId,
      dayNumber,
      outcome: result.outcome,
    })

    if (result.monsterDefeated) {
      threats = {
        ...threats,
        [attempt.threatId]: {
          ...threats[attempt.threatId],
          status: 'defeated',
          defeatedDay: dayNumber,
          defeatedByPartyId: attempt.partyId,
        },
      }
      events.push({
        type: 'threatDefeated',
        threatId: attempt.threatId,
        dayNumber,
        partyId: attempt.partyId,
      })

      if (attempt.threatId === 'nosferatu') {
        playerCurseStatus = 'lifted'
        events.push({ type: 'curseLifted', dayNumber })
      }
    }

    pendingPresentationAttemptId = attempt.id

    return { ...attempt, result, battleTrace }
  })

  // Once every national Threat is defeated, Nosferatu (the final boss)
  // unlocks — the one causal path `evaluateMainQuestDispatch`'s
  // `threatAvailable` check ever recognizes as legitimate (mirrored by the
  // Save Validator's `allNationalDefeated` check in `../save/validation.ts`).
  if (
    threats.nosferatu.status === 'locked' &&
    NATIONAL_THREAT_IDS.every((id) => threats[id].status === 'defeated')
  ) {
    threats = {
      ...threats,
      nosferatu: { ...threats.nosferatu, status: 'available' },
    }
  }

  return {
    mainQuestState: {
      ...mainQuestState,
      threats,
      attempts: nextAttempts,
      pendingPresentationAttemptId,
      playerCurseStatus,
    },
    events,
  }
}
