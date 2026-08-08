import {
  acceptanceReasonText,
  getOfferErrors,
} from '../../core/tavern/brokerage.ts'
import type { TavernDayState, TavernParty } from '../../core/tavern/types.ts'
import { OBJECTIVE_LABELS } from '../expedition/labels.ts'

export interface BrokeragePanelProps {
  day: TavernDayState
  selectedRequestId: string | null
  selectedPartyId: string | null
  canResolve: boolean
  error?: string | null
  onOffer: () => void
  onResolve: () => void
}

export function BrokeragePanel({
  day,
  selectedRequestId,
  selectedPartyId,
  canResolve,
  error,
  onOffer,
  onResolve,
}: BrokeragePanelProps) {
  const request = selectedRequestId
    ? (day.requests.find((r) => r.id === selectedRequestId) ?? null)
    : null
  const party: TavernParty | null = selectedPartyId
    ? (day.parties.find((p) => p.id === selectedPartyId) ?? null)
    : null

  const offerErrors =
    request && party ? getOfferErrors(day, request.id, party.id) : []
  const canOffer = !!request && !!party && offerErrors.length === 0

  const selectedOffer =
    request && party
      ? day.offers.find(
          (o) => o.requestId === request.id && o.partyId === party.id,
        )
      : undefined

  const offerHistory = request
    ? day.offers.filter((o) => o.requestId === request.id)
    : []

  if (!request) {
    return (
      <div className="dispatch-panel" data-testid="brokerage-panel">
        <p>依頼を選択してください。</p>
      </div>
    )
  }

  return (
    <div className="dispatch-panel" data-testid="brokerage-panel">
      <h3>依頼紹介: {request.title}</h3>
      <div className="dispatch-meta">
        <span>{OBJECTIVE_LABELS[request.objectiveType]}</span>
        <span className={`rank-badge rank-${request.rank}`}>
          {request.rank}
        </span>
        <span>{request.environment}</span>
      </div>

      {party ? (
        <div className="selected-party">
          <h4>《{party.party.name}》</h4>
          <div className="party-leader">
            Leader:{' '}
            {party.party.members.find((m) => m.id === party.party.leaderId)
              ?.name ?? '—'}{' '}
            ({party.party.rank})
          </div>
          <div className="party-members">
            {party.party.members.map((m) => (
              <span key={m.id} className="party-member">
                {m.name} ({m.rank} {m.role})
              </span>
            ))}
          </div>

          {selectedOffer ? (
            <div className="offer-result">
              <p>{acceptanceReasonText(selectedOffer.reason)}</p>
              <p>
                判断: {selectedOffer.decision === 'accepted' ? '受諾' : '辞退'}
              </p>
              <details>
                <summary>判定詳細</summary>
                <ul>
                  <li>依頼Rank: {selectedOffer.evaluation.requestRank}</li>
                  <li>パーティRank: {selectedOffer.evaluation.partyRank}</li>
                  <li>Rank差: {selectedOffer.evaluation.rankGap}</li>
                  <li>
                    関連Role数: {selectedOffer.evaluation.relevantRoleCount}/4
                  </li>
                  <li>
                    リーダー判断力: {selectedOffer.evaluation.leaderJudgment}
                  </li>
                  <li>理由: {selectedOffer.reason}</li>
                </ul>
              </details>
            </div>
          ) : (
            <button onClick={onOffer} disabled={!canOffer}>
              この依頼を紹介する
            </button>
          )}

          {!canOffer && !selectedOffer && offerErrors.length > 0 && (
            <div className="dispatch-warning">{offerErrors[0]}</div>
          )}
        </div>
      ) : (
        <p>紹介するパーティを選択してください。</p>
      )}

      {offerHistory.length > 0 && (
        <div className="offer-history">
          <h4>紹介履歴</h4>
          <ul>
            {offerHistory.map((offer) => {
              const p = day.parties.find((party) => party.id === offer.partyId)
              return (
                <li key={offer.id}>
                  《{p?.party.name ?? offer.partyId}》 →{' '}
                  {offer.decision === 'accepted' ? '受諾' : '辞退'}：
                  {offer.reason}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="resolve-action">
        <button onClick={onResolve} disabled={!canResolve}>
          本日の仲介を確定
        </button>
      </div>

      {error && <div className="dispatch-error">{error}</div>}
    </div>
  )
}
