import type {
  EscortObjectiveState,
  ExpeditionObjectiveState,
  InvestigationObjectiveState,
  RescueObjectiveState,
  RetrievalObjectiveState,
  SurveyObjectiveState,
  SurveySectorState,
} from '../../core/expedition/types.ts'
import { EliminationObjectiveState } from '../../core/expedition/types.ts'

interface ExpeditionObjectivePanelProps {
  objective?: ExpeditionObjectiveState
}

function ProgressBar({
  value,
  completed,
}: {
  value: number
  completed: boolean
}) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className={`progress-bar ${completed ? '' : 'incomplete'}`}>
      <div style={{ width: `${clamped}%` }} />
    </div>
  )
}

function renderInvestigation(obj: InvestigationObjectiveState) {
  return (
    <div className="objective-panel">
      <p>Type: {obj.type}</p>
      <p>Objective完成は情報発見に依存します。</p>
    </div>
  )
}

function renderElimination(obj: EliminationObjectiveState) {
  return (
    <div className="objective-panel">
      <table>
        <tbody>
          <tr>
            <th>対象数</th>
            <td>{obj.requiredTargetIds.length}</td>
          </tr>
          <tr>
            <th>撃破</th>
            <td>{obj.defeatedTargetIds.join(', ') || 'なし'}</td>
          </tr>
          <tr>
            <th>逃走</th>
            <td>{obj.escapedTargetIds.join(', ') || 'なし'}</td>
          </tr>
          <tr>
            <th>生存</th>
            <td>{obj.survivingTargetIds.join(', ') || 'なし'}</td>
          </tr>
          <tr>
            <th>未確認</th>
            <td>{obj.unknownTargetIds.join(', ') || 'なし'}</td>
          </tr>
          <tr>
            <th>確認済み</th>
            <td>{obj.confirmedTargetIds.join(', ') || 'なし'}</td>
          </tr>
          <tr>
            <th>Progress</th>
            <td>{obj.progress}%</td>
          </tr>
          <tr>
            <th>Completed</th>
            <td>{obj.completed ? 'はい' : 'いいえ'}</td>
          </tr>
        </tbody>
      </table>
      <ProgressBar value={obj.progress} completed={obj.completed} />
    </div>
  )
}

function renderRescue(obj: RescueObjectiveState) {
  const hpPercent = Math.round((obj.currentHp / obj.maxHp) * 100)
  return (
    <div className="objective-panel">
      <table>
        <tbody>
          <tr>
            <th>対象</th>
            <td>{obj.targetName}</td>
          </tr>
          <tr>
            <th>HP</th>
            <td>
              {obj.currentHp} / {obj.maxHp} ({hpPercent}%)
            </td>
          </tr>
          <tr>
            <th>移動性</th>
            <td>{obj.mobility}</td>
          </tr>
          <tr>
            <th>発見</th>
            <td>{obj.located ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>到達</th>
            <td>{obj.reached ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>安定化</th>
            <td>{obj.stabilized ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>保護者</th>
            <td>{obj.protectorId || 'なし'}</td>
          </tr>
          <tr>
            <th>戦闘損傷</th>
            <td>{obj.battleExposureDamage}</td>
          </tr>
          <tr>
            <th>帰還損傷</th>
            <td>{obj.returnDamage}</td>
          </tr>
          <tr>
            <th>避難</th>
            <td>{obj.evacuated ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>帰還</th>
            <td>{obj.returned ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>放棄</th>
            <td>{obj.abandoned ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>Progress</th>
            <td>{obj.progress}%</td>
          </tr>
          <tr>
            <th>Completed</th>
            <td>{obj.completed ? 'はい' : 'いいえ'}</td>
          </tr>
        </tbody>
      </table>
      <ProgressBar value={obj.progress} completed={obj.completed} />
    </div>
  )
}

function renderEscort(obj: EscortObjectiveState) {
  const hpPercent = Math.round((obj.currentHp / obj.maxHp) * 100)
  return (
    <div className="objective-panel">
      <table>
        <tbody>
          <tr>
            <th>対象</th>
            <td>{obj.targetName}</td>
          </tr>
          <tr>
            <th>目的地</th>
            <td>{obj.destinationName}</td>
          </tr>
          <tr>
            <th>HP</th>
            <td>
              {obj.currentHp} / {obj.maxHp} ({hpPercent}%)
            </td>
          </tr>
          <tr>
            <th>Stress</th>
            <td>{obj.travelStress}</td>
          </tr>
          <tr>
            <th>移動性</th>
            <td>{obj.mobility}</td>
          </tr>
          <tr>
            <th>出発</th>
            <td>{obj.departed ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>連携</th>
            <td>{obj.coordinated ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>保護者</th>
            <td>{obj.protectorId || 'なし'}</td>
          </tr>
          <tr>
            <th>移動損傷</th>
            <td>{obj.travelDamage}</td>
          </tr>
          <tr>
            <th>戦闘損傷</th>
            <td>{obj.battleExposureDamage}</td>
          </tr>
          <tr>
            <th>治療回復</th>
            <td>{obj.careHealing}</td>
          </tr>
          <tr>
            <th>治療損傷</th>
            <td>{obj.careDamage}</td>
          </tr>
          <tr>
            <th>到達</th>
            <td>{obj.destinationReached ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>引渡し</th>
            <td>{obj.handoffStatus}</td>
          </tr>
          <tr>
            <th>引渡し完了</th>
            <td>{obj.delivered ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>Origin戻り</th>
            <td>{obj.returnedToOrigin ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>置き去り</th>
            <td>{obj.stranded ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>Progress</th>
            <td>{obj.progress}%</td>
          </tr>
          <tr>
            <th>Completed</th>
            <td>{obj.completed ? 'はい' : 'いいえ'}</td>
          </tr>
        </tbody>
      </table>
      <ProgressBar value={obj.progress} completed={obj.completed} />
    </div>
  )
}

function renderRetrieval(obj: RetrievalObjectiveState) {
  const integrityPercent = Math.round(
    (obj.currentIntegrity / obj.initialIntegrity) * 100,
  )
  return (
    <div className="objective-panel">
      <table>
        <tbody>
          <tr>
            <th>対象</th>
            <td>{obj.targetName}</td>
          </tr>
          <tr>
            <th>Integrity</th>
            <td>
              {obj.currentIntegrity} / {obj.initialIntegrity} (
              {integrityPercent}%)
            </td>
          </tr>
          <tr>
            <th>最低Integrity</th>
            <td>{obj.minimumAcceptableIntegrity}</td>
          </tr>
          <tr>
            <th>bulk</th>
            <td>{obj.bulk}</td>
          </tr>
          <tr>
            <th>handling</th>
            <td>{obj.handling}</td>
          </tr>
          <tr>
            <th>fragility</th>
            <td>{obj.fragility}</td>
          </tr>
          <tr>
            <th>発見</th>
            <td>{obj.located ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>到達</th>
            <td>{obj.reached ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>確保</th>
            <td>{obj.secured ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>保護</th>
            <td>{obj.protectedForTransport ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>保護者</th>
            <td>{obj.protectorId || 'なし'}</td>
          </tr>
          <tr>
            <th>運搬者</th>
            <td>{obj.carrierIds.join(', ') || 'なし'}</td>
          </tr>
          <tr>
            <th>戦闘損傷</th>
            <td>{obj.battleExposureDamage}</td>
          </tr>
          <tr>
            <th>確保損傷</th>
            <td>{obj.securingDamage}</td>
          </tr>
          <tr>
            <th>回収損傷</th>
            <td>{obj.extractionDamage}</td>
          </tr>
          <tr>
            <th>回収済</th>
            <td>{obj.extracted ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>帰還</th>
            <td>{obj.returned ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>放棄</th>
            <td>{obj.abandoned ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>帰還中喪失</th>
            <td>{obj.lostDuringReturn ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>Progress</th>
            <td>{obj.progress}%</td>
          </tr>
          <tr>
            <th>Completed</th>
            <td>{obj.completed ? 'はい' : 'いいえ'}</td>
          </tr>
        </tbody>
      </table>
      <ProgressBar value={obj.currentIntegrity} completed={obj.completed} />
    </div>
  )
}

function renderSector(sector: SurveySectorState) {
  return (
    <div key={sector.id} className="sector-card">
      <strong>{sector.name}</strong>
      <p>focus: {sector.focus}</p>
      <p>attempted: {sector.attempted ? 'はい' : 'いいえ'}</p>
      <p>surveyed: {sector.surveyed ? 'はい' : 'いいえ'}</p>
      {sector.result && <p>result: {sector.result}</p>}
      <p>quality: {sector.quality}</p>
      <p>担当: {sector.responsibleMemberIds.join(', ') || 'なし'}</p>
    </div>
  )
}

function renderSurvey(obj: SurveyObjectiveState) {
  return (
    <div className="objective-panel">
      <table>
        <tbody>
          <tr>
            <th>Area</th>
            <td>{obj.areaName}</td>
          </tr>
          <tr>
            <th>最低品質</th>
            <td>{obj.minimumAcceptableQuality}</td>
          </tr>
          <tr>
            <th>Coverage</th>
            <td>{obj.coveragePercent}%</td>
          </tr>
          <tr>
            <th>平均品質</th>
            <td>{obj.averageQuality.toFixed(1)}</td>
          </tr>
          <tr>
            <th>報告書作成</th>
            <td>{obj.reportPrepared ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>報告書帰還</th>
            <td>{obj.reportReturned ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>帰還中喪失</th>
            <td>{obj.reportLostDuringReturn ? 'はい' : 'いいえ'}</td>
          </tr>
          <tr>
            <th>Progress</th>
            <td>{obj.progress}%</td>
          </tr>
          <tr>
            <th>Completed</th>
            <td>{obj.completed ? 'はい' : 'いいえ'}</td>
          </tr>
        </tbody>
      </table>
      <ProgressBar value={obj.progress} completed={obj.completed} />
      <div className="sector-cards">{obj.sectors.map(renderSector)}</div>
    </div>
  )
}

export function ExpeditionObjectivePanel({
  objective,
}: ExpeditionObjectivePanelProps) {
  if (!objective) return <p className="card">Objective状態がありません</p>

  switch (objective.type) {
    case 'investigation':
      return renderInvestigation(objective)
    case 'elimination':
      return renderElimination(objective)
    case 'rescue':
      return renderRescue(objective)
    case 'escort':
      return renderEscort(objective)
    case 'retrieval':
      return renderRetrieval(objective)
    case 'survey':
      return renderSurvey(objective)
    default:
      return <p className="card">未知のObjective typeです</p>
  }
}
