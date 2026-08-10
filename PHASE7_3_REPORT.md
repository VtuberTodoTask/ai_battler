# Phase 7.3 レポート：Character Identity & Life History（Gender / Romantic Context 追加）

## 概要

Phase 7.3 では、冒険者に以下を追加した。

- **CharacterIdentity**: 種族、性別、出身国、出身地域、社会的出自、家庭背景
- **CharacterLifeBackground**: 幼少期、教育、前職、形成経験、冒険者になった理由
- **CulturalInfluence**: 出身国・種族を源泉とする価値観と、個人がそれを受容・再解釈・拒否・逆手に取る態度
- **PersonalityContradiction**: 一見矛盾する複数の性質を持つキャラクター表現
- **CharacterRomanticProfile**: 恋愛対象、恋愛態度、交際状況、過去の恋愛履歴
- **CharacterRelationship.romanticAttraction**: 方向性を持つ恋愛的興味（affinity とは独立）

すべて `SeededRng` のサブシードにより決定的に生成し、既存の stat/personality/equipment 生成には影響を与えていない。

## 重要原則

- **Gender は Personality を決定しない**: `narrativeProfile` は `personality`・`role`・`traits`・`background`・`culturalInfluences` から導出され、gender 由来の固定テンプレートを使わない。
- **種族・出身国は文脈であって性格テンプレートではない**: Prompt v8 に「山人族だから職人気質」「女性だから穏やか」等を禁じる stereotype guard を追加。
- **恋愛感情は方向性を持ち、affinity や gender から自動決定しない**: `romanticAttraction` は一方向のみを保持し、親密度 50 でも恋愛対象外、恋愛興味 80 でも相手からは無関心、という関係を表現可能。
- **Romance は Scene relevance にのみ投影**: 通常の遠征では `characterContexts` からロマンスヒントを省略し、関係する二者が同じシーンに関与する場合のみ投影。

## サンプルキャラクター

### サンプル 1: シエラ アイヴィー

```
生成シード: phase7-3-seed-1 (C / vanguard)
種族: 小鬼族 | 出身国: ラグナ辺境侯国 | 性別: 女性
出身地域: 辺境砦町
家庭: 貧民街
幼少期: 幼い頃から働かされた
教育: 家業で働きながら学んだ
元職: 石工
形成経験:
  - 家業が傾いた時期があった → 失敗は個人の責任ではないと割り切っている
冒険者になった理由: 自分の名前で認められたい
文化的影響:
  - 生存: おおむね受け入れている
  - 現場判断: 強く受け入れている
恋愛傾向: opposite_gender / 開放度 23 / single
性格: 楽観的で柔軟 / 独立独歩 / 自己保存を重視
```

### サンプル 2: ゴウ スカイ

```
生成シード: phase7-3-seed-2 (C / guardian)
種族: 牙人族 | 出身国: ハルマ草原諸国 | 性別: 女性
出身地域: 草原の交易町
家庭: 職人家庭
幼少期: 自由に過ごせる環境で育った
教育: 兵隊式の訓練を受けた
元職: 書記
形成経験:
  - 大きな災害に遭った → 危険は早めに避けるべきだ
冒険者になった理由: 故郷から離れたい
文化的影響:
  - 客人保護: 強く受け入れている
  - 分かち合い: おおむね受け入れている
恋愛傾向: multiple_genders / 開放度 48 / partnered
性格: 慎重だが決断力がある / チームを重んじる / 仲間の安全を重視
```

### サンプル 3: エルナ リバー

```
生成シード: phase7-3-seed-3 (C / healer)
種族: 鰭人族 | 出身国: ヴェルガ自治連邦 | 性別: その他
出身地域: 自治都市
家庭: 軍属家庭
幼少期: 厳格な親のもとで育った
教育: 独学で知識を積んだ
元職: 漁師
形成経験:
  - 家業が傾いた時期があった → 安定より機会を重視するようになった
  - 幼少期に移住した → 新しい環境への適応力がある
冒険者になった理由: 誰かに復讐したい
文化的影響:
  - 対等: おおむね受け入れている
  - 合議: どちらとも言えない
恋愛傾向: any_gender / 開放度 91 / partnered
性格: 大胆だが計画的 / 気安く世話焼き / 報酬と評価を重視
```

## 実装ポイント

### 1. 新規モジュール

- `src/core/identity/types.ts`: 9 種族 / 7 国 / 性別 / 文化態度 / 恋愛態度 / 交際状況 / 恋愛指向の型定義
- `src/core/identity/worldData.ts`: 種族・国の日本語ラベル、身体的特徴、文化的価値、ステレタイプ警告
- `src/core/identity/labels.ts`: UI / Prompt 用の日本語変換
- `src/core/identity/generator.ts`: 決定的な identity / background / cultural / romantic / narrative profile 生成
- `src/core/identity/characterContext.ts`: 遠征シーンに関連する背景のみを選ぶ `projectCharacterContextForNarrative`

### 2. 既存モジュールの更新

- `src/core/models/types.ts`: `Adventurer` に `identity` / `lifeBackground` / `culturalInfluences` / `romanticProfile` / `contradiction` を追加
- `src/core/generators/adventurerGenerator.ts`: `generateAdventurer` 終了時に identity/background/romance を生成、`narrativeProfile` を導出。メイン `SeededRng` には影響しないサブシード `seed:identity` を使用
- `src/core/narrative/characterProfile.ts`: `formatNarrativeProfile` に `beliefs` / `attitudes` / `contradictions` を追加
- `src/core/narrative/characterRelationships.ts`: `CharacterRelationship` に `romanticAttraction` を追加。初期化時に方向性を考慮して決定的に生成
- `src/core/narrative/types.ts`: `NarrativeMemberSnapshot` / `CharacterRelationship` / `CharacterRelationshipSnapshot` / `ExpeditionNarrativeContext` を拡張
- `src/core/narrative/context.ts`: `buildExpeditionNarrativeContext` で `characterContexts` を生成
- `src/core/narrative/prompt.ts`: `NARRATIVE_PROMPT_VERSION` を `v8` に更新。`CHARACTER BACKGROUND` セクション、背景・性別・恋愛に関する stereotype guard を追加
- `src/ui/tavern/PartyCard.tsx`: 酒場カードに種族 / 出身国 / 性別 / 出身地域 / 元職 / 冒険理由を最小表示

### 3. テスト・検証

- `src/core/identity/worldData.test.ts`: 9 種族 / 7 国 / 異相族判定
- `src/core/identity/generator.test.ts`: シード決定性、gender/personality 分離、恋愛対象の多様性、片思い/友情の可能性、文化態度の多様性
- `src/core/identity/characterContext.test.ts`: ロマンス省略、シーン関連背景抽出、高恋愛的興味の投影
- `scripts/phase7-3-character-generation-smoke.ts`: 決定性、種族多様性、国の Personality 非決定、gender/romance 独立、方向性、異種族恋愛、文化態度

## 検証結果

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run test`: PASS (860 tests)
- `npm run build`: PASS
- `npm run test:expedition-regression`: PASS (22/22)
- 30-day zero-call audit: 69 candidates / 0 AI calls
- compression audit: PASS
- timeline audit: 0 leakage
- Phase 7.2 / 7.2.1 / 7.2.2 smokes: PASS
- Phase 7.3 generation smoke: PASS

## 注意点

- 本 Phase では告白、交際、結婚、嫉妬、恋愛戦闘補正等の進行システムは実装していない。
- 恋愛情報は `CharacterRomanticProfile` と `CharacterRelationship.romanticAttraction` に保持されるが、Narrative への投影は scene relevance フィルタを通す。
- `CharacterNarrativeProfile` に `beliefs`/`attitudes`/`contradictions` を追加したが、既存の `temperament` / `socialStyle` / `values` / `flaws` / `fears` / `habits` / `speechStyle` は維持される。
