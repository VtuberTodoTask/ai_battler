import type { ExpeditionResult } from '../expedition/types.ts'
import { deepClone } from '../util.ts'
import type {
  DispatchObjectiveSummary,
  DispatchPartyResult,
  DispatchReport,
} from './types.ts'

function buildPartyResult(result: ExpeditionResult): DispatchPartyResult[] {
  const casualties = new Set(result.state.casualties)
  const incapacitated = new Set(result.state.incapacitated)

  return result.party.map((a) => ({
    adventurerId: a.id,
    name: a.name,
    role: a.role,
    rank: a.rank,
    finalHp: a.currentHp,
    maxHp: a.maxHp,
    finalMp: a.currentMp,
    maxMp: a.maxMp,
    finalMorale: a.morale,
    incapacitated: incapacitated.has(a.id),
    dead: casualties.has(a.id),
  }))
}

function buildObjectiveSummary(
  result: ExpeditionResult,
): DispatchObjectiveSummary {
  const objectiveState = result.state.objectiveState
  if (!objectiveState) {
    throw new Error('Objective state is missing')
  }

  switch (objectiveState.type) {
    case 'investigation': {
      const information = result.state.information
      return {
        type: 'investigation',
        progress: result.state.objectiveProgress,
        completed: result.state.objectiveCompleted,
        discoveredInformationCount: information.length,
        completeInformationCount: information.filter(
          (i) => i.completeness === 'complete',
        ).length,
        battleIntelCount: information.filter((i) => i.battleIntel).length,
      }
    }
    case 'elimination':
      return {
        type: 'elimination',
        requiredTargetCount: objectiveState.requiredTargetIds.length,
        defeatedCount: objectiveState.defeatedTargetIds.length,
        escapedCount: objectiveState.escapedTargetIds.length,
        survivingCount: objectiveState.survivingTargetIds.length,
        unknownCount: objectiveState.unknownTargetIds.length,
        confirmedCount: objectiveState.confirmedTargetIds.length,
        progress: objectiveState.progress,
        completed: objectiveState.completed,
      }
    case 'rescue':
      return {
        type: 'rescue',
        targetName: objectiveState.targetName,
        finalHp: objectiveState.currentHp,
        maxHp: objectiveState.maxHp,
        located: objectiveState.located,
        reached: objectiveState.reached,
        stabilized: objectiveState.stabilized,
        evacuated: objectiveState.evacuated,
        returned: objectiveState.returned,
        abandoned: objectiveState.abandoned,
        completed: objectiveState.completed,
      }
    case 'escort':
      return {
        type: 'escort',
        targetName: objectiveState.targetName,
        finalHp: objectiveState.currentHp,
        maxHp: objectiveState.maxHp,
        stress: objectiveState.travelStress,
        routeProgress: objectiveState.routeProgress,
        destinationReached: objectiveState.destinationReached,
        handoffStatus: objectiveState.handoffStatus,
        delivered: objectiveState.delivered,
        returnedToOrigin: objectiveState.returnedToOrigin,
        stranded: objectiveState.stranded,
        completed: objectiveState.completed,
      }
    case 'retrieval':
      return {
        type: 'retrieval',
        targetName: objectiveState.targetName,
        finalIntegrity: objectiveState.currentIntegrity,
        minimumAcceptableIntegrity: objectiveState.minimumAcceptableIntegrity,
        secured: objectiveState.secured,
        extracted: objectiveState.extracted,
        returned: objectiveState.returned,
        completed: objectiveState.completed,
      }
    case 'survey':
      return {
        type: 'survey',
        areaName: objectiveState.areaName,
        coveragePercent: objectiveState.coveragePercent,
        averageQuality: objectiveState.averageQuality,
        minimumAcceptableQuality: objectiveState.minimumAcceptableQuality,
        reportReturned: objectiveState.reportReturned,
        surveyedSectorCount: objectiveState.sectors.filter((s) => s.surveyed)
          .length,
        completed: objectiveState.completed,
      }
    default:
      throw new Error(
        `Unsupported objective type: ${(objectiveState as { type: string }).type}`,
      )
  }
}

function buildKeyFacts(result: ExpeditionResult): string[] {
  const facts: string[] = []
  facts.push(`依頼結果: ${result.outcome}`)
  if (result.state.battleOutcome) {
    facts.push(`戦闘結果: ${result.state.battleOutcome}`)
  }
  facts.push(`Objective進行: ${result.state.objectiveProgress}%`)
  facts.push(`経過時間: ${result.state.elapsedTime}`)

  const objectiveState = result.state.objectiveState
  if (objectiveState) {
    switch (objectiveState.type) {
      case 'rescue':
        facts.push(
          `対象HP: ${objectiveState.currentHp}/${objectiveState.maxHp}`,
        )
        break
      case 'escort':
        facts.push(
          `対象HP: ${objectiveState.currentHp}/${objectiveState.maxHp}`,
        )
        facts.push(`ルート進行: ${objectiveState.routeProgress}%`)
        break
      case 'retrieval':
        facts.push(
          `対象Integrity: ${objectiveState.currentIntegrity}/${objectiveState.minimumAcceptableIntegrity}`,
        )
        break
      case 'survey':
        facts.push(`Coverage: ${objectiveState.coveragePercent}%`)
        facts.push(`AverageQuality: ${objectiveState.averageQuality}`)
        break
      case 'elimination':
        facts.push(`撃破: ${objectiveState.defeatedTargetIds.length}`)
        facts.push(`残存: ${objectiveState.survivingTargetIds.length}`)
        break
      case 'investigation':
        facts.push(`発見情報: ${result.state.information.length}`)
        break
    }
  }

  return facts
}

export function buildDispatchReport(
  requestId: string,
  result: ExpeditionResult,
): DispatchReport {
  return {
    requestId,
    objectiveType: result.request.objectiveType,
    outcome: result.outcome,
    objectiveCompleted: result.state.objectiveCompleted,
    objectiveProgress: result.state.objectiveProgress,
    elapsedTime: result.state.elapsedTime,
    battleOutcome: result.state.battleOutcome,
    party: buildPartyResult(result),
    casualties: deepClone(result.state.casualties),
    incapacitated: deepClone(result.state.incapacitated),
    keyFacts: buildKeyFacts(result),
    objective: buildObjectiveSummary(result),
  }
}
