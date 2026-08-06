import { Adventurer } from '../models/types.ts'
import {
  ExpeditionOutcome,
  ExpeditionRequest,
  ExpeditionState,
} from './types.ts'
import { determineEliminationOutcome } from './objectives/elimination.ts'
import { determineInvestigationOutcome } from './objectives/investigation.ts'

export function determineOutcome(
  request: ExpeditionRequest,
  state: ExpeditionState,
  party: Adventurer[],
): ExpeditionOutcome {
  if (request.objectiveType === 'elimination') {
    return determineEliminationOutcome(request, state, party)
  }
  return determineInvestigationOutcome(request, state, party)
}
