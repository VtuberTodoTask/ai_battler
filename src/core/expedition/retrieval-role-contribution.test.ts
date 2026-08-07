import { afterAll, describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import * as prettier from 'prettier'
import { runExpedition } from './expedition.ts'
import { initializeExpeditionState } from './state.ts'
import { SeededRng } from '../rng/seededRng.ts'
import { makePairedParty, makeRetrievalRequest } from './test-utils.ts'
import type {
  Adventurer,
  AdventurerRole,
  BattleResult,
  SkillSet,
} from '../models/types.ts'
import type {
  ExpeditionBattleRecord,
  ExpeditionBattleResolvedContext,
  ExpeditionExecutionContext,
  ExpeditionRequest,
  RetrievalObjectiveState,
} from './types.ts'
import {
  getRetrievalObjective,
  initializeRetrievalObjectiveState,
  resolveRetrievalBattleExposure,
} from './objectives/retrieval.ts'
import {
  runSampleCase,
  sampleCases,
} from '../../../scripts/phase3-retrieval-sample.ts'

const TRIALS = 1000

interface RoleReport {
  role: string
  metric: string
  withRole: number
  withoutRole: number
  pairedDelta: number
  trials: number
}

const reports: RoleReport[] = []

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function swapRole(
  roles: AdventurerRole[],
  slot: number,
  newRole: AdventurerRole,
): AdventurerRole[] {
  return roles.map((r, i) => (i === slot ? newRole : r))
}

function retrievalState(
  result: ReturnType<typeof runExpedition>,
): RetrievalObjectiveState {
  return result.state.objectiveState as RetrievalObjectiveState
}

function makeRetrievalContext(
  request: ExpeditionRequest,
  party: Adventurer[],
): ExpeditionExecutionContext {
  const state = initializeExpeditionState(request, party)
  state.metadata = {
    difficulty: request.difficulty,
    requestFeatures: request.features,
    threatFeatures: request.features,
    ...state.metadata,
  }
  state.objectiveState = initializeRetrievalObjectiveState(request)
  return {
    request,
    party,
    state,
    rng: new SeededRng(request.seed),
  }
}

describe('Retrieval paired self-verification', () => {
  it('produces identical outcomes for identical role composition', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'mage',
      'healer',
    ]
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRetrievalRequest(
        `self-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          securingDifficulty: 0,
          extractionDifficulty: 0,
          initialIntegrity: 100,
          minimumAcceptableIntegrity: 80,
        },
        false,
        { features: [] },
      )
      const party = makePairedParty(baseRoles, `self-${i}`, 'C')
      const result1 = runExpedition(request, party)
      const result2 = runExpedition(
        request,
        makePairedParty(baseRoles, `self-${i}`, 'C'),
      )
      expect(result2.outcome).toBe(result1.outcome)
      expect(result2.state.objectiveState).toEqual(result1.state.objectiveState)
      expect(result2.state.logs).toEqual(result1.state.logs)
    }
  })
})

describe('Retrieval role contribution statistics', () => {
  it('Scout improves discovery rate', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'mage',
      'support',
    ]
    const withRoles = swapRole(baseRoles, 3, 'scout')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRetrievalRequest(
        `scout-${i}`,
        'C',
        { locationKnown: false, discoveryDifficulty: 15 },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `scout-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `scout-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(retrievalState(withResult).located ? 1 : 0)
      withoutValues.push(retrievalState(withoutResult).located ? 1 : 0)
    }
    reports.push({
      role: 'Scout',
      metric: '発見率',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeGreaterThan(average(withoutValues))
  })

  it('Ranger improves portable extraction rate', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'mage',
      'support',
    ]
    const withRoles = swapRole(baseRoles, 3, 'ranger')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRetrievalRequest(
        `ranger-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          securingDifficulty: 0,
          extractionDifficulty: 25,
          bulk: 'portable',
        },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `ranger-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `ranger-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(retrievalState(withResult).extracted ? 1 : 0)
      withoutValues.push(retrievalState(withoutResult).extracted ? 1 : 0)
    }
    reports.push({
      role: 'Ranger',
      metric: '搬出率（portable）',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeGreaterThan(average(withoutValues))
  })

  it('Mage improves magical environment access rate', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'ranger',
      'support',
    ]
    const withRoles = swapRole(baseRoles, 3, 'mage')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRetrievalRequest(
        `mage-${i}`,
        'C',
        { locationKnown: true, accessDifficulty: 20 },
        false,
        { environment: 'magical', features: [] },
      )
      const withParty = makePairedParty(withRoles, `mage-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `mage-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(retrievalState(withResult).reached ? 1 : 0)
      withoutValues.push(retrievalState(withoutResult).reached ? 1 : 0)
    }
    reports.push({
      role: 'Mage',
      metric: 'magical環境到達率',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeGreaterThan(average(withoutValues))
  })

  it('Support improves standard securing rate', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'mage',
      'healer',
    ]
    const withRoles = swapRole(baseRoles, 3, 'support')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRetrievalRequest(
        `support-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          securingDifficulty: 25,
          handling: 'standard',
        },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `support-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `support-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(retrievalState(withResult).secured ? 1 : 0)
      withoutValues.push(retrievalState(withoutResult).secured ? 1 : 0)
    }
    reports.push({
      role: 'Support',
      metric: '確保率（standard）',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeGreaterThan(average(withoutValues))
  })

  it('Vanguard improves heavy extraction rate', () => {
    const baseRoles: AdventurerRole[] = ['ranger', 'guardian', 'mage', 'healer']
    const withRoles = swapRole(baseRoles, 3, 'vanguard')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRetrievalRequest(
        `vanguard-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          securingDifficulty: 0,
          extractionDifficulty: 25,
          bulk: 'heavy',
        },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `vanguard-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `vanguard-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(retrievalState(withResult).extracted ? 1 : 0)
      withoutValues.push(retrievalState(withoutResult).extracted ? 1 : 0)
    }
    reports.push({
      role: 'Vanguard',
      metric: '搬出率（heavy）',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeGreaterThan(average(withoutValues))
  })

  it('Guardian reduces battle exposure damage', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'ranger',
      'mage',
      'support',
    ]
    const withRoles = swapRole(baseRoles, 3, 'guardian')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRetrievalRequest(
        `guardian-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          securingDifficulty: 0,
          extractionDifficulty: 0,
          protectionDifficulty: 15,
          fragility: 'standard',
        },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `guardian-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `guardian-${i}`, 'C')

      const withContext = makeRetrievalContext(request, withParty)
      const withObj = getRetrievalObjective(withContext.state)
      withObj.reached = true
      const withResolved: ExpeditionBattleResolvedContext = {
        ...withContext,
        battleId: 'b1',
        battleResult: {
          outcome: 'costlyVictory',
          rounds: 12,
        } as BattleResult,
        battleRecord: { id: 'b1' } as unknown as ExpeditionBattleRecord,
        initialEnemyIds: [],
      }
      resolveRetrievalBattleExposure(withResolved)

      const withoutContext = makeRetrievalContext(request, withoutParty)
      const withoutObj = getRetrievalObjective(withoutContext.state)
      withoutObj.reached = true
      const withoutResolved: ExpeditionBattleResolvedContext = {
        ...withoutContext,
        battleId: 'b1',
        battleResult: {
          outcome: 'costlyVictory',
          rounds: 12,
        } as BattleResult,
        battleRecord: { id: 'b1' } as unknown as ExpeditionBattleRecord,
        initialEnemyIds: [],
      }
      resolveRetrievalBattleExposure(withoutResolved)

      withValues.push(withObj.battleExposureDamage)
      withoutValues.push(withoutObj.battleExposureDamage)
    }
    reports.push({
      role: 'Guardian',
      metric: '戦闘余波ダメージ平均',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeLessThan(average(withoutValues))
  })

  it('Healer has no direct retrieval-specific bonus', () => {
    function makeControlledParty(
      targetRole: AdventurerRole,
      seedBase: string,
    ): Adventurer[] {
      const roles: AdventurerRole[] = [
        'vanguard',
        'guardian',
        'ranger',
        targetRole,
      ]
      const party = makePairedParty(roles, seedBase, 'C')
      const maxStats = {
        str: 100,
        con: 100,
        dex: 100,
        int: 100,
        per: 100,
        wil: 100,
        soc: 100,
      }
      const maxSkills: SkillSet = {
        melee: 100,
        ranged: 100,
        defense: 100,
        tactics: 100,
        attackMagic: 100,
        defenseMagic: 100,
        healing: 100,
        scouting: 100,
        stealth: 100,
        trapDetection: 100,
        trapDisarm: 100,
        survival: 100,
        monsterKnowledge: 100,
        firstAid: 100,
        leadership: 100,
      }
      for (const a of party) {
        a.stats = { ...maxStats }
        a.skills = { ...maxSkills }
        a.maxHp = 1000
        a.currentHp = 1000
        a.maxMp = 1000
        a.currentMp = 1000
        a.morale = 100
      }
      return party
    }

    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const seedBase = `healer-control-${i}`
      const request = makeRetrievalRequest(
        seedBase,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          securingDifficulty: 0,
          extractionDifficulty: 0,
          initialIntegrity: 100,
          minimumAcceptableIntegrity: 80,
        },
        false,
        { features: [] },
      )
      const healerResult = runExpedition(
        request,
        makeControlledParty('healer', seedBase),
      )
      const vanguardResult = runExpedition(
        request,
        makeControlledParty('vanguard', seedBase),
      )
      expect(healerResult.outcome).toBe(vanguardResult.outcome)
      withValues.push(healerResult.outcome === 'completeSuccess' ? 1 : 0)
      withoutValues.push(vanguardResult.outcome === 'completeSuccess' ? 1 : 0)
    }
    reports.push({
      role: 'Healer',
      metric: 'completeSuccess率（Healer vs 中性Vanguard 直接対照）',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
  })
})

afterAll(async () => {
  const table = reports
    .map(
      (r) =>
        `| ${r.role} | ${r.metric} | ${r.withRole.toFixed(3)} | ${r.withoutRole.toFixed(3)} | ${r.pairedDelta >= 0 ? '+' : ''}${r.pairedDelta.toFixed(3)} | ${r.trials} |`,
    )
    .join('\n')

  const sampleSummary = sampleCases
    .map((c) => {
      const { result, objective } = runSampleCase(c)
      return `### ${c.id}: ${c.description}\n- outcome: ${result.outcome}\n- targetId: ${objective.targetId}\n- currentIntegrity: ${objective.currentIntegrity}/${objective.initialIntegrity}\n- minimumAcceptableIntegrity: ${objective.minimumAcceptableIntegrity}\n- located: ${objective.located}\n- reached: ${objective.reached}\n- secured: ${objective.secured}\n- extracted: ${objective.extracted}\n- returned: ${objective.returned}\n- carrierIds: ${JSON.stringify(objective.carrierIds)}\n- battleExposureDamage: ${objective.battleExposureDamage}\n- securingDamage: ${objective.securingDamage}\n- extractionDamage: ${objective.extractionDamage}`
    })
    .join('\n\n')

  const report = `# Phase 3.5 Report

## Implemented types

- \`RetrievalObjectiveConfig\`
- \`RetrievalObjectiveState\`
- \`RetrievalObjectiveHandler\` (\`retrieval\`)

## State transition

1. assigned\n2. located (search success)\n3. reached (access success)\n4. secured (securing success)\n5. protectedForTransport / protectorId assigned (when battle enabled)\n6. extracted (carriers assigned, extraction success)\n7. returned (return success)\n
## Integrity accounting

\`\`\`\ninitialIntegrity\n- battleExposureDamage\n- securingDamage\n- extractionDamage\n= currentIntegrity\n\`\`\`\n
The target is considered destroyed when currentIntegrity reaches 0.

## Search / Access

- \`runInitialRetrievalSearch\` resolves the discovery skill check.
- \`runRetrievalAccess\` resolves the access skill check.
- Both use the preferred role (Scout for discovery, Mage for magical environments, etc.) and the party's skill bonuses.

## Battle exposure

When a battle occurs and the target has been reached, a protector is assigned. After battle resolution, \`resolveRetrievalBattleExposure\` performs an abstract protection check and records actual damage to the target using the battle outcome. The fact text describes the protection assignment and observed damage without asserting that the protector physically blocked specific attacks.

## Securing

\`runRetrievalSecuring\` resolves the securing skill check. The difficulty modifier is:

\`\`\`\nsecuringDifficulty + retrievalFragilityModifier(fragility) - supportBonus(...) - toolsBonus\n\`\`\`\n
where toolsBonus is +10 when \`supplies.tools\` is available, and supportBonus is the retrieval-specific support bonus (+5 for standard and delicate, 0 for arcane).

## Carrier assignment

Carriers are selected from active party members after securing and when battle exposure is resolved. A \`retrievalCarriersAssigned\` structured log is emitted with \`carrierIds\` and \`requiredCarrierCount\` metadata. If there are not enough active members, an insufficient-carrier log with the same schema (carrierIds=[], carrierCount=0, requiredCarrierCount=N) is emitted.

## Extraction

\`runRetrievalExtraction\` resolves the extraction skill check using carrier count, bulk and handling modifiers. If successful, \`extracted\` becomes true.

## Return semantics

\`runRetrievalReturn\` resolves the return transit check. On success, \`returned\` becomes true. If the party is wiped out or abandons, the target may be abandoned or lost.

## Samples

${sampleSummary}

## Role contribution

| role | metric | withRole | withoutRole | paired delta | trials |
|---|---|---|---|---|---|
${table}

## Healer negative control

Direct retrieval bonus: none.
The Healer row uses a max-stats controlled party and compares Healer against a neutral Vanguard baseline on the same seed. Since the only difference is the fourth role, a paired delta of exactly 0 confirms Healer provides no retrieval-specific bonus in search, access, securing, extraction, battle protection, or integrity preservation. Any non-zero completeSuccess rate in the table is observational only.

## Regression

- Existing baselines: 14 (investigation 3, elimination 4, rescue 3, escort 4)
- Existing baseline diff: 0
- Retrieval baselines: 4 (completeSuccess, success, partialSuccess, failedObjective)

## Verification

- \`npm run typecheck\`: passed
- \`npm test\`: passed
- \`npm run lint\`: passed
- \`npm run build\`: passed
- \`npm run update:expedition-regression\`: passed
- CI: green

## Known issues

None.
`
  const formatted = await prettier.format(report, { parser: 'markdown' })
  writeFileSync('PHASE3_5_REPORT.md', formatted)
})
