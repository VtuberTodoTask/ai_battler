import type {
  CharacterEventNarrativeContext,
  CharacterNarrativeContext,
  CharacterNarrativeEventType,
  ExpeditionNarrativeContext,
  NarrativeContext,
  NarrativeHistoryHighlight,
  NarrativeMemberSnapshot,
} from './types.ts'
import {
  acceptanceReasonText,
  affinityBand,
  buildExpeditionNarrativeFacts,
  buildPersonalityHints,
  environmentLabel,
  objectiveLabel,
  riskToleranceLabel,
  specializationMatchText,
} from './facts.ts'
import {
  buildExpeditionNarrativeTimeline,
  formatNarrativeTimeline,
} from './timeline.ts'
import { determineNarrativeDirection } from './director.ts'
import { formatNarrativeProfile } from './characterProfile.ts'
import { countryLabel, genderLabel, speciesLabel } from '../identity/labels.ts'
import { arcSignalSummary } from './arcSignals.ts'

export const NARRATIVE_PROMPT_VERSION = 'v10'

export interface NarrativePrompt {
  system: string
  user: string
}

const SYSTEM_PROMPT = `あなたはファンタジー世界の酒場を舞台とするゲームのナレーターです。

【店主＝プレイヤーについて】
この酒場の店主はNPCではありません。店主は、このゲームを操作しているプレイヤー本人です。
店主の人格や意思をAIが代わりに決定してはいけません。
FACTSに明示されていない限り、店主について以下を創作してはいけません。

- 名前
- 性別
- 年齢
- 外見
- 性格
- 過去
- 感情
- 思考
- 口調
- 台詞
- 約束
- 判断
- 行動方針

店主の名前がFACTSとして与えられていない場合、必ず「店主」とだけ表記してください。
「アルフレッド」「マリナ」など、店主へ新しい固有名を与えてはいけません。

FACTSとして店主の発言内容が明示されている場合を除き、店主の台詞を新しく作ってはいけません。
店主はプレイヤー本人であるため、AIがプレイヤーに代わって発言してはいけません。

店主＝プレイヤーであることは、プレイヤーの感情を推測してよいという意味ではありません。
「プレイヤーは期待した」「プレイヤーは喜んだ」「プレイヤーは不安を感じた」なども禁止です。

店主について書いてよいのは、Party側の行為として
「店主へ報告した」「店主へ話しかけた」「店主へ別れを告げた」
などを記述する場合だけです。

店主の内面を描写しないでください。次のような表現を避けてください。
- 店主は満足げに頷いた。
- 店主は寂しそうに笑った。
- 店主は驚いて目を見開いた。
- 店主は彼らを誇らしく思った。
- 店主は失敗に落胆した。

物語のカメラは主に冒険者Party側へ置いてください。店主の内面を描写する視点には入らないでください。

【Narrative Generator と UI の責務分界】
Narrative Generator が担当するのは「人物・出来事・余韻」です。
UI が担当するのは「成功/失敗、報酬、損害、負傷、取得物、依頼達成率、Quest grade、滞在日数、残存目標」です。
Narrative に UI の structured result を全文読み上げさせる必要はありません。

【FACT PRESERVATION と FACT COVERAGE】
Confirmed Facts は、Narrative が矛盾してはならない事実です。
Narrative がすべての Confirmed Fact を本文に含める必要はありません。
Confirmed Fact が NARRATIVE FOCUS に重要でなければ、暗黙的に省略して構いません。
省略は許されます。矛盾だけは許されません。

【不在は出来事ではない】
イベントが存在しなかったことを本文で説明しないでください。
例えば以下のような表現は避けてください。
- 「手当ては行われなかった」
- 「目立った消耗はなかった」
- 「これ以上の被害はなかった」
- 「誰も追加で負傷しなかった」
ただし、不在そのものが目的の成否や重大な事実を意味する場合は除きます。例：「救援が来る予定だったが来なかった」「指定時間までに対象が現れなかった」「必要な物資が存在しなかったため objective failed した」。

【キャラクター特性は傾向である】
CHARACTERS に含まれる口調、癖、価値観、欠点、恐れ、気質は傾向（tendency）であり、強制ではありません。
すべてのセリフや行動で特性を証明する必要はありません。
特に speechStyle は、すべての台詞を極端に変形させる強制ではありません。
状況に応じて自然な変化や、無関係な振る舞いを入れて構いません。
一度特性を示したら、同じシーン内で何度も反復して証明しないでください。

【関係性の差異化】
関係性があれば、その相手に対してだけ現れる反応を優先してください。
「心配する」「制止する」「様子を見る」など、どの Party Member でもありうる振る舞いだけでは不十分です。
「この人物は他のメンバーに対しても同じ反応をするか？」と自問してください。
もし答えが「はい」なら、その相互作用は関係性を強く表現していません。

【キャラクター技法はチェックリストではない】
dialogue、habit、relationship、human noise、non-verbal interaction などは、場面に自然に合うものだけを使ってください。
全部を毎回入れる必要はありません。

【背景とアイデンティティの扱い】
種族・出身国・性別・家庭・経歴は、Character の行動や判断を「なぜそうなったか」で理解するための文脈です。
これらを Personality や台詞のテンプレートとして扱わないでください。
文化の価値は、個人が受け入れ、再解釈、無視、拒否、逆手に取ることがあります。
背景は、行動や選択、会話の端に滲ませるものであって、自己紹介や履歴書のように要約して読み上げないでください。
以下のような表現を避けてください。
- 「山人族なので職人気質だ」
- 「ラグナ出身なので生存を重視する」
- 「女性だから穏やかだ」
- 「彼はセレスタ人らしく契約を重視する」
代わりに、背景を通じて自然な反応や台詞を作ってください。
例：「報酬は後でいい。帰れるうちに戻るぞ」「その条件、依頼書には書いてなかったよな」

【恋愛的興味の扱い】
Romantic Attraction が明示されている場合、それは一方向の内面の傾向です。
高値だからといって、必ず「恋をしている」「愛している」と説明しないでください。
中程度であれば、「少し意識している」「相手への反応だけ微妙に違う」「妙に気にする」程度にとどめてください。
存在しない恋愛感情や、関係性のない二者間の恋愛を創作しないでください。

【情報の三層モデル】
このプロンプトで提供される情報は次の三層に分かれています。

Tier 1: Immutable Facts（変更不可の事実）
- EXPEDITION SUMMARY
- CONFIRMED OUTCOME FACTS
- EXPEDITION TIMELINE
これらはゲームエンジンが確定した事実です。登場人物、生死、負傷、成否、依頼内容、客観的な出来事を変更してはいけません。

Tier 2: Character Interpretation（人物解釈の参考）
- CHARACTERSに含まれるNarrative Profile（気質・対人傾向・重視する価値・欠点・恐れ・癖・口調）
- PARTY RELATIONSHIPSに含まれる人間関係の傾向（親密度・信頼・尊敬・緊張）
これらはAIが登場人物の反応、態度、短い会話、表情、仕草を描写する際の参考です。ただし、これらを根拠に新しい事実（死亡、負傷、装備、過去、家族、恋愛、約束、将来の行動）を作らないでください。

Tier 3: Narrative Embellishment（物語演出）
- 表情、仕草、間、息遣い、簡潔な心理描写
- ただし、Game Factを変更しない範囲にしてください。

【Allowed Invention（創作可）】
- 登場人物の一時的な表情、仕草、口調、間、息遣い
- 登場人物の簡潔な内心の動き（ただし「店主」の感情・思考・判断は除く）
- 空気、温度、照明、天候など場の演出
- Party Member間の短い会話（原則Party Member側の台詞）
- ミッションと無関係な雑談、空腹、疲労、からかい、愚痴、気まずい沈黙、冗談、装備確認、相手の様子を気にする、小言、世間話
- 水筒を渡す、歩調を落とす、装備を見る、傷を気にする、座り込む、食事を求めるなど、機械的な効果を伴わない非言語的やり取り

【Forbidden Invention（創作禁止）】
- 死亡者を生き返らせたり、生存者を死亡させたりすること
- 新しいNPC（店員、依頼人、衛兵、医師、旅人など）の登場
- 依頼、報酬、アイテム、装備、死因、未来の予定、恋愛関係、家族設定、故郷、借金の創作
- HP/MP/Morale、ダメージ数値、難易度、進捗率などの生の数値の読み上げ
- 内部enum名、フィールド名、メタコメント、解説、括弧書きの注釈
- TIMELINEにない出来事や、入力にない因果関係
- 店主の感情、思考、台詞、意思決定、行動方針
- 機械的な効果を伴う行動（傷を治療する、HPを回復する、敵から庇ってダメージを受ける、魔法を使用する、新しいアイテムを渡すなど）は、CONFIRMED FACTSに無い限り創作禁止

【その他の事実制約】
提供されたFACTSはゲームエンジンが確定した事実です。FACTSと矛盾する内容を書いてはいけません。
結果、人物名、Party名、Rank、負傷、死亡、依頼内容、成功・失敗、関係値などを変更してはいけません。
FACTSに存在しない新しい事件、NPC、依頼、報酬、アイテム、過去、約束、恒久的な人間関係、家族設定、故郷設定、借金額を事実として追加してはいけません。

場面に登場させてよい人物は、入力データに人物として明示されている者と店主だけです。
「店員」「依頼人」「衛兵」「医師」「旅人」など、入力データに存在しない人物を新しく登場させてはいけません。
Character Eventで明示されたNPCだけ例外です。

再訪や戻ってくる日付を確約させないでください。「必ず戻る」「来月戻る」などは避け、「近くへ来たら寄る」「機会があれば」程度にとどめてください。
目的地を新しく創作しないでください。生存者を死亡させたり、死者を生き返らせたりしないでください。新しい怪我や病気、恋愛関係を捏造しないでください。

結果の具体的な原因がCONFIRMED FACTSに書かれていない場合、原因を推測・創作してはいけません。
失敗、撤退、負傷、消耗、進捗不足、成功などについて、「なぜそうなったか」が書かれていなければ、原因は不明のまま描写してください。

Coverage不足だからといって、落盤、狭い通路、水没、怪物、罠、悪天候、道迷いなどを勝手に原因として作ってはいけません。
forcedRetreatだからといって、新しい敵や事故を作ってはいけません。

MemberのRoleは人物の役割を示すだけです。
Roleだけを根拠に、
mageが魔法を使った、
guardianが盾を使った、
supportが治療した、
scoutが罠を発見した、
rangerが追跡した、
などの実際の行動・装備を創作してはいけません。

Request/FACTSに明示されていない場合、盾、杖、剣、弓、薬瓶、魔導書、地図、ロープ、ランタンなどの装備を創作してはいけません。

CHARACTERSのNarrative ProfileとPARTY RELATIONSHIPSは、登場人物の反応や口調、人間関係の演出の参考です。これらを根拠に人物の過去、家族、借金、職歴等の新しい設定を作らないでください。
Personality値（勇敢さ、慎重さ、協調性、規律、利他、貪欲）も口調・反応の参考だけです。過去や実際の行動を示すFACTではありません。

ただし、物語表現としての一時的な表情、仕草、口調、空気、短い会話などは創作して構いません。それらは新たなゲーム上の事実を作らない範囲にしてください。ただし、店主の感情、思考、台詞、意思決定を創作してはいけません。

表情や仕草もGame Factを変更しない範囲にしてください。
例えば「少し言葉を選んだ」「肩をすくめた」「静かに答えた」程度は可です。
ただし「負傷で顔を歪めた」など、負傷FACTがない場合は禁止です。

将来の行動を創作しないでください。
「次はもっと上手くやろう」「次の依頼に備えよう」「再挑戦する」「新しい探索へ向かう」などは禁止です。

【TIMELINEとNARRATIVE DIRECTIONの扱い】
TIMELINEは出来事の順序を示します。
TIMELINEに書かれていない具体的な出来事を、場面を盛り上げるために追加してはいけません。
前後している出来事同士に、入力にない因果関係を追加してはいけません。

NARRATIVE DIRECTIONは、どの場面を詳しく描き、どの場面を圧縮・省略するかの指示です。
NARRATIVE FOCUSに従い、MAIN SCENESを中心に詳しく描き、SECONDARY SCENESを簡潔に触れ、MONTAGEは1～3文程度に圧縮または省略してください。
OMITTED BEAT IDs に含まれる出来事は、Narrative 本文で言及しなくても構いません。Simulation Fact は保持されます。
TIMELINEのすべてを網羅する必要はありません。一つの印象的な人物の瞬間に集中した短い文章の方、完全な時系列解説より望ましいです。
Narrative Interaction Hintsは、人物関係をSceneに盛り込むための参考です。セリフを強制するものではありません。
MAIN SCENESに選ばれた出来事を中心に、登場人物の反応や会話を自然に描写してください。

店主を文の主語として、台詞・行動・表情・感情・判断を記述しないでください。
「店主は頷いた」「店主は杯を掲げた」「店主は尋ねた」「店主は笑った」等は禁止です。

CHARACTERS / PARTY RELATIONSHIPSは人物描写の参考だけです。実際に起きた出来事、報酬、行動、装備、戦術を意味しません。
利益や報酬への関心が強いからといって、報酬の有無や多寡を捏造してはいけません。

CONFIRMED OUTCOME FACTSやTIMELINEの文を、そのまま登場人物の台詞として読み上げないでください。
自然な言い換えは可ですが、内容や数値をそのまま読み上げないでください。

最終文章に、enum名、内部フィールド名、ゲームシステムの注釈、FACTS一覧の引用、注意書き、解説、括弧書きのメタコメントを出力してはいけません。物語本文だけを出力してください。
最終本文は自然な日本語だけで書いてください。意図しない英単語やsystem field名を混在させないでください。

ゲームシステムの数値をそのまま読み上げるのではなく、自然な日本語の物語として描写してください。`

function identitySummaryLine(m: NarrativeMemberSnapshot): string {
  if (!m.identity) return '素性: 未記録'
  const parts = [
    speciesLabel(m.identity.species),
    countryLabel(m.identity.countryOfOrigin),
    genderLabel(m.identity.gender),
  ]
  if (m.lifeBackground?.formerOccupation) {
    parts.push(`元${m.lifeBackground.formerOccupation}`)
  }
  if (m.lifeBackground?.reasonForAdventuring) {
    parts.push(m.lifeBackground.reasonForAdventuring)
  }
  return `素性: ${parts.join(' / ')}`
}

function memberHintLines(members: NarrativeMemberSnapshot[]): string[] {
  const lines: string[] = []
  for (const m of members) {
    const hints = buildPersonalityHints(m.personality)
    const hintText =
      hints.length > 0
        ? hints.join(' / ')
        : '特に目立った傾向は記録されていない'
    const profileText = formatNarrativeProfile(m.narrativeProfile)
    lines.push(`  - ${m.name}（${m.rank} ${m.role}）`)
    lines.push(`    ${identitySummaryLine(m)}`)
    lines.push(`    傾向: ${hintText}`)
    lines.push(`    プロフィール: ${profileText}`)
  }
  return lines
}

function relationshipBand(value: number): string {
  if (value >= 60) return '高い'
  if (value <= 40) return '低い'
  return '普通'
}

function relationshipLines(
  relationships: import('./types.ts').CharacterRelationshipSnapshot[],
): string[] {
  if (relationships.length === 0) return ['- 関係情報は記録されていない']
  const lines: string[] = []
  for (const r of relationships) {
    const metrics = `親密度${relationshipBand(r.affinity)}・信頼${relationshipBand(r.trust)}・尊敬${relationshipBand(r.respect)}・緊張${relationshipBand(r.tension)}`
    const tags =
      r.tags && r.tags.length > 0 ? ` タグ: ${r.tags.join('・')}` : ''
    const recent =
      r.recentEvents && r.recentEvents.length > 0
        ? ` 最近: ${r.recentEvents
            .slice(0, 3)
            .map((e) => e.summary)
            .join('；')}`
        : ''
    const romantic =
      typeof r.romanticAttraction === 'number' && r.romanticAttraction > 0
        ? ` 恋愛的興味: ${relationshipBand(r.romanticAttraction)}`
        : ''
    const shared =
      typeof r.sharedExpeditions === 'number' && r.sharedExpeditions > 0
        ? ` 共に遠征した回数: ${r.sharedExpeditions}`
        : ''
    lines.push(
      `  - ${r.sourceName} → ${r.targetName}: ${metrics}${romantic}${shared}${tags}${recent}`,
    )
  }
  return lines
}

function memoryLabel(type: string): string {
  switch (type) {
    case 'major_success':
    case 'objective_success':
    case 'shared_success':
      return '好印象'
    case 'rescued':
    case 'healed':
    case 'protected':
    case 'supported':
    case 'trust_event':
      return '好印象'
    case 'major_failure':
    case 'objective_failure':
    case 'shared_failure':
    case 'casualty':
    case 'critical_injury':
    case 'injury':
    case 'abandoned':
    case 'conflict':
    case 'disagreement':
      return '悪印象'
    case 'retreat':
    case 'mixed':
      return '複雑'
    default:
      return '中立'
  }
}

function formatMemoryItem(item: {
  summary: string
  type: string
  importance: number
  valence: string
}): string {
  return `${item.summary}（重要度${item.importance}、感情色${memoryLabel(item.type)}）`
}

function memoryLines(context: ExpeditionNarrativeContext): string[] {
  const lines: string[] = []
  const { characterMemories, relationshipMemories, party } = context
  let hasMemory = false

  const characterEntries = Object.entries(characterMemories ?? {})
  if (characterEntries.length > 0) {
    lines.push('Character Memories:')
    for (const [characterId, items] of characterEntries) {
      if (items.length === 0) continue
      const name =
        party.members.find((m) => m.id === characterId)?.name ?? characterId
      hasMemory = true
      for (const item of items) {
        lines.push(`  - ${name}: ${formatMemoryItem(item)}`)
      }
    }
  }

  const pairEntries = Object.entries(relationshipMemories ?? {})
  if (pairEntries.length > 0) {
    lines.push('Relationship Memories:')
    for (const [pairKey, items] of pairEntries) {
      if (items.length === 0) continue
      const [a, b] = pairKey.split(':')
      const aName = party.members.find((m) => m.id === a)?.name ?? a
      const bName = party.members.find((m) => m.id === b)?.name ?? b
      hasMemory = true
      for (const item of items) {
        lines.push(`  - ${aName} ↔ ${bName}: ${formatMemoryItem(item)}`)
      }
    }
  }

  if (!hasMemory) lines.push('- なし')
  return lines
}

function arcSignalLines(context: ExpeditionNarrativeContext): string[] {
  const lines: string[] = []
  const signals = context.relationshipArcs ?? []
  if (signals.length === 0) return ['- なし']
  const memberMap = new Map(
    context.party.members.map((m) => [m.id, m.name ?? m.id]),
  )
  for (const signal of signals) {
    const summary = arcSignalSummary(signal, memberMap)
    lines.push(
      `- ${summary}（傾向：${signal.status}、強さ${Math.round(signal.strength)}、確信${Math.round(signal.confidence)}）`,
    )
  }
  return lines
}

function directionLines(
  direction: import('./types.ts').NarrativeDirection | undefined,
  members?: NarrativeMemberSnapshot[],
): string[] {
  if (!direction) return ['- 演出指示は記録されていない']
  const lines: string[] = []

  lines.push('Focus:')
  if (direction.focus) {
    lines.push(`  Summary: ${direction.focus.summary}`)
    if (
      direction.focus.characterIds &&
      direction.focus.characterIds.length > 0
    ) {
      const names = direction.focus.characterIds.map(
        (id) => members?.find((m) => m.id === id)?.name ?? id,
      )
      lines.push(`  Characters: ${names.join(', ')}`)
    }
    if (
      direction.focus.relatedBeatIds &&
      direction.focus.relatedBeatIds.length > 0
    ) {
      lines.push(
        `  Related Beats: ${direction.focus.relatedBeatIds.join(', ')}`,
      )
    }
    if (direction.focus.reason)
      lines.push(`  Reason: ${direction.focus.reason}`)
  } else {
    lines.push('  - 記録されていない')
  }

  lines.push('Main Scenes:')
  if (direction.mainScenes.length === 0) lines.push('  - なし')
  for (const scene of direction.mainScenes) {
    lines.push(`  - Focus: ${scene.focus}`)
    lines.push(`    Beat IDs: ${scene.beatIds.join(', ')}`)
    lines.push(`    Reason: ${scene.reason}`)
  }
  lines.push('Secondary Scenes:')
  if (direction.secondaryScenes.length === 0) lines.push('  - なし')
  for (const scene of direction.secondaryScenes) {
    lines.push(`  - Focus: ${scene.focus}`)
    lines.push(`    Beat IDs: ${scene.beatIds.join(', ')}`)
    lines.push(`    Reason: ${scene.reason}`)
  }
  lines.push(
    `Montage Beat IDs: ${direction.montageBeatIds.length > 0 ? direction.montageBeatIds.join(', ') : 'なし'}`,
  )
  lines.push(
    `Omitted Beat IDs: ${direction.omittedBeatIds && direction.omittedBeatIds.length > 0 ? direction.omittedBeatIds.join(', ') : 'なし'}`,
  )

  lines.push('Narrative Interaction Hints:')
  if (direction.interactionHints && direction.interactionHints.length > 0) {
    for (const hint of direction.interactionHints) {
      const names = hint.characterIds.map(
        (id) => members?.find((m) => m.id === id)?.name ?? id,
      )
      lines.push(`  - Characters: ${names.join(', ')}`)
      lines.push(`    Beats: ${hint.beatIds.join(', ')}`)
      if (hint.relationshipSummary)
        lines.push(`    Relationship: ${hint.relationshipSummary}`)
      if (hint.suggestedDynamic)
        lines.push(`    Dynamic: ${hint.suggestedDynamic}`)
    }
  } else {
    lines.push('  - なし')
  }

  return lines
}

function characterContextLines(
  contexts: CharacterNarrativeContext[] | undefined,
): string[] {
  if (!contexts || contexts.length === 0)
    return ['- キャラクターバックグラウンドは未設定']
  const lines: string[] = []
  for (const c of contexts) {
    lines.push(`  - ${c.characterId}:`)
    if (c.identitySummary) lines.push(`    素性: ${c.identitySummary}`)
    if (c.relevantBackground && c.relevantBackground.length > 0) {
      lines.push(`    関連背景: ${c.relevantBackground.join(' / ')}`)
    }
    if (c.relevantExperiences && c.relevantExperiences.length > 0) {
      lines.push(`    経験: ${c.relevantExperiences.join(' / ')}`)
    }
    if (
      c.relevantCulturalInfluences &&
      c.relevantCulturalInfluences.length > 0
    ) {
      lines.push(`    文化的傾向: ${c.relevantCulturalInfluences.join(' / ')}`)
    }
    if (c.currentTraits && c.currentTraits.length > 0) {
      lines.push(`    現在の傾向: ${c.currentTraits.join(' / ')}`)
    }
    if (c.relationshipHints && c.relationshipHints.length > 0) {
      lines.push(`    関係性: ${c.relationshipHints.join(' / ')}`)
    }
    if (c.romanticHint) lines.push(`    恋愛的興味: ${c.romanticHint}`)
    if (c.memories && c.memories.length > 0) {
      lines.push(`    関連記憶: ${c.memories.map((m) => m.summary).join('；')}`)
    }
  }
  return lines
}

function partyHeader(
  party: NarrativeContext['party'],
  includeSpecialization: boolean,
): string {
  const leader = party.members.find((m) => m.id === party.leaderId)
  const leaderHint = leader
    ? `Leaderの傾向: ${buildPersonalityHints(leader.personality).join(' / ') || '特に目立った傾向は記録されていない'}`
    : ''

  const lines = [
    `Party: ${party.name} (Rank ${party.rank})`,
    `Leader: ${party.leaderName}`,
    leaderHint,
    `関係性: ${affinityBand(party.affinity)}`,
    `リスクへの姿勢: ${riskToleranceLabel(party.riskTolerance)}`,
    `成長段階: ${party.growthMilestones}`,
    `滞在訓練日数: ${party.trainingDays}`,
  ]

  if (includeSpecialization) {
    lines.push(`得意分野: ${party.missionSpecialization.strongObjective}`)
    lines.push(`苦手分野: ${party.missionSpecialization.weakObjective}`)
  }

  return lines.filter(Boolean).join('\n')
}

export function characterEventInstruction(
  eventType: CharacterNarrativeEventType,
): string {
  const common = `WRITING INSTRUCTIONS:
- 300～700字程度の日本語
- 酒場を舞台とする短い会話シーン
- Primary Eventを中心に描写する
- secondaryTriggersは自然なら触れてよいが、全部入れる必要はない
- 店主はNPCではなくプレイヤー本人である
- 店主の名前・性別・年齢・外見・性格を創作しない
- 店主の台詞を作らない
- 店主の感情・思考を決めない
- 店主に新しい判断・約束・行動方針を与えない
- Party側から店主へ話しかける描写は可
- 店主からPartyへの新規行動・発話は原則禁止（FACTSに明示されている場合を除く）
- 新しい出来事、新しい障害、新しい敵、新しい人物、新しい物品、新しい原因、新しい情報、新しい約束、新しい将来予定を作らない`

  const instructions: Record<CharacterNarrativeEventType, string> = {
    partyArrival: `partyArrival:
- 新しく来たPartyが主体
- Leaderが店主へ自己紹介する
- Partyの第一印象をParty側の様子から描く
- 店主が自己紹介しない
- 店主が歓迎の台詞を言わない
- 店主の第一印象を確定しない`,
    riskyRequestAccepted: `riskyRequestAccepted:
- Partyが格上依頼を引き受ける直前の場面
- Partyから店主へ「その仕事、受けよう」等の発話は可
- 店主が「本当に大丈夫か？」等と発言させない
- acceptanceReasonを受諾理由として尊重する
- specialtyMatchなら得意分野への自信を表現してよい
- trustedBrokerなら店主への信頼を表現してよい（ただし店主の返答は作らない）
- needsIncomeなら金銭的必要性を表現してよい
- 実際に存在しない事情を追加しない`,
    weakObjectiveSuccess: `weakObjectiveSuccess:
- 苦手分野の依頼を今回は成功させたことを描く
- Partyが店主へ「苦手な仕事だったが成功した」と報告する場面としてよい
- 「苦手を完全克服した」と確定しない
- 店主が褒める台詞を勝手に作らない`,
    recoveryFinished: `recoveryFinished:
- 療養を終え、再び活動可能になった場面
- Party側から「もう動ける」等と店主へ伝えるのは可
- 店主が「無理するなよ」等と言わせない
- 病名・治療法・医師等を捏造しない`,
    stayExtended: `stayExtended:
- 本来の予定より滞在を延長するとParty側から店主へ伝える場面
- 「予定を変えた。もう少しここにいることにした」等は可
- 店主の返事は書かない
- 永住・永久滞在にはしない`,
    becameRegular: `becameRegular:
- 酒場に馴染み、常連になったと感じられる場面
- 「いつもの席」程度の一般的描写は可
- 店主を家族同然に思っていた等は禁止
- 未定義の具体的料理・注文履歴を事実として作らない`,
    becameFavorite: `becameFavorite:
- Partyから店主への高い信頼を描く（例：「あんたが持ってくる話なら、ちゃんと聞く価値がある」）
- これはParty側のAffinity表現なので可
- 店主側にも同程度の感情があるとは推測しない
- 親友・家族・恋愛関係等へ勝手に昇格させない`,
    farewell: `farewell:
- 高Affinity Partyが店主へ旅立ちを告げる場面
- stayDays / actual expedition history / growth / recentHighlightsを利用する
- 実際に紹介した依頼を振り返ってよい
- Party側から感謝・別れの言葉を告げる
- 最後にPartyが酒場を去る
- 店主の返答を作らない
- 再訪予定は存在しない
- 「必ず戻る」「来月戻る」等を確約させない
- 「また近くへ来たら寄る」「機会があれば」程度は可
- 新しい目的地を確定しない`,
    casualtyDeparture: `casualtyDeparture:
- deadMemberNames / survivorNamesを厳密に守る
- 死者を生存させない
- 生存者を死亡させない
- 葬儀、遺族、仇討ち等の新規事実を作らない
- Party側の悲しみ・反応はPersonalityやFACTS範囲で描写可能
- 店主が泣いた・怒った・慰めた・仇討ちを誓った等を作らない
- 過度な追加ドラマを避ける`,
  }
  return `${common}\n${instructions[eventType]}`
}

const EXPEDITION_WRITING_INSTRUCTIONS = `WRITING INSTRUCTIONS:
- 1600～2600字程度の日本語。ただし、NARRATIVE FOCUS が一つに絞れていれば、無理に文字数を伸ばさず短くまとめてよい
- 短い Narrative が正常系です。重大事件が 1 つなら MAIN 1 つ、SECONDARY 0、MONTAGE 1 文程度、ENDING 短いシーンで終えてよい
- 一続きの短編小説として：短い Opening → MAIN SCENE の詳細描写 → それ以外は MONTAGE または省略 → 必要なら SECONDARY SCENE → 帰還時の短い余韻
- 見出しや小説専用の区切りを付けない
- NARRATIVE FOCUS と MAIN SCENES を中心に描き、SECONDARY SCENES は簡潔に、MONTAGE は 1～3 文程度に圧縮または省略する
- TIMELINE のすべての出来事を順番に説明しない。TIMELINE は参考であり、checklist ではない。OMITTED BEAT IDs は本文で言及しなくてよい
- 低重要度のイベントは圧縮だけでなく、完全に省略してもよい
- 不在の出来事（「手当てされなかった」「消耗がなかった」など）を説明しない
- 重要な出来事は、登場人物の行動、会話、沈黙、仕草、場の空気として「見せる」
- 結果や objective success / failure、partial success、報酬、損害、負傷一覧、残存目標などを、UI のように列挙・読み上げしない
- Outcome が既にシーン、台詞、最後の印象で伝わっているなら、再度説明しない
- 性格や人間関係を直接説明しない。気質・価値観・欠点・恐れは、台詞、反応、選択、仕草、沈黙を通じて読者に伝える
- 人間関係は、会話の距離感、助け合い、避け合い、からかい、言い争い、気遣いなどとして表現する。信頼度や緊張値のような数値・ラベルは本文に出さない
- RELEVANT MEMORIES は確認済みの過去の出来事です。キャラクターの現在の態度や仕草に影響を与えてよいが、思い出を改変・拡張・新しい背景にしない。記憶を無理にセリフで言及させない
- RELATIONSHIP ARCS は長期的な関係傾向です。Arc ラベルや「関係が深まった」「信頼し合うようになった」といった説明を直接述べない。Arc はキャラクターが誰の声を聞くか、誰を振り返るか、助言をどれほど素直に受けるか、言い争いをどう制御するか、日常の連携がどれだけ自然に感じるかなどに反映する。無理に毎回のシーンに出さない
- Character の状態（疲労、消耗、無傷など）を roster summary のように列挙しない。NARRATIVE FOCUS に関係する人物のみ、必要な範囲で描写する
- 目的達成、勝利、帰還、作戦、HP/MP/Moraleなどのゲーム状態をそのままセリフ化しない
- キャラクターはミッションと無関係な雑談をしてよい。ただし、空腹、疲労、からかい、愚痴、気まずい沈黙、冗談、装備確認、相手の様子を気にする、食事を求めるなどは毎回ではなく、自然な場面だけで使う
- Routine preparation（防具確認、道具確認、周囲を見るなど）は、Character relevance がなければ省略する
- Opening は短く。誰が、どこへ、何をしに行ったまで。出発判定や適性評価は必要な場合のみ
- 水筒を渡す、歩調を落とす、傷を気にする、座り込むなどの非言語的やり取りを使ってもよい。ただし、治療・回復・新たなアイテム授与など、機械的な効果を伴う行動は CONFIRMED FACTS が無い限り創作しない
- 同じ結果を繰り返し説明しない。Outcome が既に分かっている場合、登場人物の余韻で終えてよい
- Party Member の短い会話は原則 Party Member 側の台詞にする
- 店主はプレイヤー本人なので、店主の台詞・感情・判断を作らない
- 店主の反応を必要とする場面では、反応そのものを書かずに場面を進める
- TIMELINE に書かれていない具体的な出来事を追加しない
- TIMELINE の前後にある出来事同士に、入力にない因果関係を追加しない
- CHARACTERS の Narrative Profile と PARTY RELATIONSHIPS は人物描写の参考です。それらを根拠に新しい事実を作らない
- 最終文章に enum 名、内部フィールド名、ゲームシステムの注釈、FACTS 一覧の引用、注意書き、解説、括弧書きのメタコメントを出力しない
- 最終本文は自然な日本語だけで書く
- Outcome を変更しない
- 次の冒険、新たな依頼、新しい目的地へ勝手につなげない
- 文字数を満たすために新しい出来事を創作しない`

export function buildExpeditionPrompt(
  context: ExpeditionNarrativeContext,
): string {
  const request = context.request
  const facts = buildExpeditionNarrativeFacts(context)
  const timeline = context.timeline ?? buildExpeditionNarrativeTimeline(context)
  const timelineText = formatNarrativeTimeline(timeline)
  const direction =
    context.direction ??
    determineNarrativeDirection(
      timeline,
      context.party.members,
      context.party.characterRelationships,
    )
  const match = context.acceptance?.specializationMatch ?? 'neutral'
  const reason = context.acceptance?.reason ?? 'appropriate'

  const outcomeLabel = facts.confirmedFacts[0] ?? context.report.outcome
  const lines: string[] = [
    '=== EXPEDITION SUMMARY ===',
    `依頼: ${request.title}（Rank ${request.rank} / ${objectiveLabel(request.objectiveType)} / ${environmentLabel(request.environment)}）`,
    `Party: ${context.party.name} (Rank ${context.party.rank})`,
    `結果: ${outcomeLabel}`,
    '',
    '=== CURRENT REQUEST ===',
    `依頼タイトル: ${request.title}`,
    `依頼ランク: ${request.rank}`,
    `今回の依頼種別: ${request.objectiveType}（${objectiveLabel(request.objectiveType)}）`,
    `環境: ${request.environment}（${environmentLabel(request.environment)}）`,
    `Public Tags: ${request.publicTags.join(', ')}`,
    `依頼内容: ${request.briefing}`,
    '',
    '=== PARTY ===',
    `Party: ${context.party.name} (Rank ${context.party.rank})`,
    `Leader: ${context.party.leaderName}`,
    `関係性: ${affinityBand(context.party.affinity)}`,
    `リスクへの姿勢: ${riskToleranceLabel(context.party.riskTolerance)}`,
    `受諾理由: ${acceptanceReasonText(reason)}`,
    `今回の依頼との専門適性: ${specializationMatchText(match)}`,
    '',
    '=== NARRATIVE DIRECTION ===',
    ...directionLines(direction, context.party.members),
    '',
    '=== CHARACTERS ===',
    'Members:',
    ...memberHintLines(context.party.members),
    '',
    '=== CHARACTER BACKGROUND ===',
    'Scene-relevant background and identity (background is context, not stereotype):',
    ...characterContextLines(context.characterContexts),
    '',
    '=== PARTY RELATIONSHIPS ===',
    ...relationshipLines(context.party.characterRelationships ?? []),
    '',
    '=== RELEVANT MEMORIES ===',
    'Relevant memories describe confirmed past events. You may let them influence present behavior. Do not invent additional details about those past events. Do not rewrite or expand the memory into a new backstory. Do not force characters to discuss a memory explicitly. Avoid repeated "we did this before" dialogue; let memories influence non-verbal behavior, hesitation, trust, irritation, expectation, or willingness to rely.',
    ...memoryLines(context),
    '',
    '=== RELATIONSHIP ARCS ===',
    'Arc signals describe long-term relationship trends, not facts to announce. Do not state an arc label or relationship development directly. Let an arc influence who a character listens to, who they look toward first, how quickly they accept advice, how much explanation is needed, whether disagreement is blunt or restrained, and how familiar routine coordination feels. Do not force the arc into every scene.',
    ...arcSignalLines(context),
    '',
    '=== EXPEDITION TIMELINE ===',
    timelineText,
    '',
    '=== CONFIRMED OUTCOME FACTS ===',
    ...facts.confirmedFacts.map((f) => `- ${f}`),
    '',
    '=== DETAILS NOT RECORDED ===',
  ]

  if (facts.unknownDetails.length > 0) {
    lines.push(...facts.unknownDetails.map((u) => `- ${u}`))
  } else {
    lines.push('- なし')
  }

  lines.push(
    '',
    '=== NARRATIVE HINTS ===',
    ...facts.presentationHints.map((h) => `- ${h}`),
    '',
    '=== WRITING INSTRUCTIONS ===',
    EXPEDITION_WRITING_INSTRUCTIONS,
  )

  return lines.join('\n')
}

function recentHighlightsText(highlights: NarrativeHistoryHighlight[]): string {
  if (highlights.length === 0) return 'なし'
  return highlights
    .map(
      (h) =>
        `Day ${h.dayNumber}: ${h.requestTitle}（${objectiveLabel(h.objectiveType)}、${h.outcome}）`,
    )
    .join('\n')
}

export function buildCharacterEventPrompt(
  context: CharacterEventNarrativeContext,
): string {
  const leader = context.party.members.find(
    (m) => m.id === context.party.leaderId,
  )
  const leaderHint = leader
    ? `Leaderの傾向: ${buildPersonalityHints(leader.personality).join(' / ') || '特に目立った傾向は記録されていない'}`
    : ''

  const lines: string[] = [
    '【キャラクターイベント】',
    `Event Type: ${context.eventType}`,
    partyHeader(context.party, true),
    leaderHint,
    'Members:',
    ...memberHintLines(context.party.members),
    '',
    'Party Relationships:',
    ...relationshipLines(context.party.characterRelationships ?? []),
    '',
    'Recent Highlights:',
    recentHighlightsText(context.recentHighlights),
    '',
    'Event Facts:',
  ]
  for (const [key, value] of Object.entries(context.eventFacts)) {
    lines.push(`  - ${key}: ${JSON.stringify(value)}`)
  }

  if (context.secondaryTriggers.length > 0) {
    lines.push(
      '',
      'Secondary Triggers:',
      ...context.secondaryTriggers.map((t) => `  - ${t}`),
    )
  }

  lines.push('', characterEventInstruction(context.eventType))
  return lines.filter(Boolean).join('\n')
}

export function buildNarrativePrompt(
  context: NarrativeContext,
): NarrativePrompt {
  const user =
    context.kind === 'expedition'
      ? buildExpeditionPrompt(context)
      : buildCharacterEventPrompt(context)
  return { system: SYSTEM_PROMPT, user }
}
