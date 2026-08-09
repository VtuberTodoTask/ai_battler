import {
  acceptanceReasonText,
  getOfferErrors,
} from '../../core/tavern/brokerage.ts'
import {
  getAffinityTier,
  getFinancialPressureTier,
} from '../../core/tavern/campaign/relationship.ts'
import { getMissionSpecializationMatch } from '../../core/tavern/specialization.ts'
import type { TavernDayState, TavernParty } from '../../core/tavern/types.ts'
import { OBJECTIVE_LABELS } from '../expedition/labels.ts'

export interface BrokeragePanelProps {
  day: TavernDayState
  selectedRequestId: string | null
  selectedPartyId: string | null
  canResolve: boolean
  canAdvance: boolean
  error?: string | null
  onOffer: () => void
  onResolve: () => void
  onAdvance?: () => void
}

export function BrokeragePanel({
  day,
  selectedRequestId,
  selectedPartyId,
  canResolve,
  canAdvance,
  error,
  onOffer,
  onResolve,
  onAdvance,
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

          {request && (
            <div className="party-specialization-match">
              依頼適性：
              {(() => {
                const match = getMissionSpecializationMatch(
                  party.party.missionSpecialization,
                  request.objectiveType,
                )
                if (match === 'strong')
                  return `得意（${OBJECTIVE_LABELS[request.objectiveType]}）`
                if (match === 'weak')
                  return `苦手（${OBJECTIVE_LABELS[request.objectiveType]}）`
                return '通常'
              })()}
            </div>
          )}

          {selectedOffer ? (
            <div className="offer-result">
              <p>{acceptanceReasonText(selectedOffer.reason)}</p>
              <p>
                判断: {selectedOffer.decision === 'accepted' ? '受諾' : '辞退'}{' '}
                （{selectedOffer.evaluation.acceptanceScore} /
                {selectedOffer.evaluation.acceptanceThreshold}）
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
                  <li>
                    お気に入り: {selectedOffer.evaluation.affinity} （
                    {getAffinityTier(selectedOffer.evaluation.affinity)}）
                  </li>
                  <li>
                    懐事情: {selectedOffer.evaluation.financialPressure} （
                    {getFinancialPressureTier(
                      selectedOffer.evaluation.financialPressure,
                    )}
                    ）
                  </li>
                  <li>
                    危険志向:{' '}
                    {selectedOffer.evaluation.riskTolerance === 'cautious'
                      ? '慎重'
                      : selectedOffer.evaluation.riskTolerance === 'bold'
                        ? '大胆'
                        : '標準'}
                  </li>
                  <li>理由: {selectedOffer.reason}</li>
                </ul>
                <p>Score breakdown:</p>
                <ul>
                  <li>ベース: {selectedOffer.evaluation.modifiers.base}</li>
                  <li>適性: {selectedOffer.evaluation.modifiers.roleFit}</li>
                  <li>
                    リーダー判断:{' '}
                    {selectedOffer.evaluation.modifiers.leaderJudgment}
                  </li>
                  <li>
                    実力認識:{' '}
                    {selectedOffer.evaluation.modifiers.relevantCapability}
                  </li>
                  <li>成長: {selectedOffer.evaluation.modifiers.growth}</li>
                  <li>信頼: {selectedOffer.evaluation.modifiers.affinity}</li>
                  <li>
                    懐事情:{' '}
                    {selectedOffer.evaluation.modifiers.financialPressure}
                  </li>
                  <li>危険志向: {selectedOffer.evaluation.modifiers.risk}</li>
                  <li>
                    専門分野:{' '}
                    {selectedOffer.evaluation.modifiers.specialization}
                  </li>
                  <li>
                    HP状態: {selectedOffer.evaluation.modifiers.hpReadiness}
                  </li>
                  <li>
                    Morale状態:{' '}
                    {selectedOffer.evaluation.modifiers.moraleReadiness}
                  </li>
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
                  {offer.reason} ({offer.evaluation.acceptanceScore}/
                  {offer.evaluation.acceptanceThreshold})
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="resolve-action">
        {day.status === 'planning' ? (
          <button onClick={onResolve} disabled={!canResolve}>
            本日の仲介を確定
          </button>
        ) : (
          <button onClick={onAdvance} disabled={!canAdvance}>
            翌日へ
          </button>
        )}
      </div>

      {error && <div className="dispatch-error">{error}</div>}
    </div>
  )
}
