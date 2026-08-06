# AI Battler

シード再現性付きの自動戦闘シミュレータ（Dungeon Tavern Game MVP）。
同じシードを指定すれば、冒険者・敵・遭遇・戦闘結果が再現されます。

## 環境

- Node.js 20+（Vite 8 の推奨バージョンは 20.19+ ですが、20.18 でも動作します）
- npm

## セットアップ

```bash
npm install
```

Vite 8 / rolldown のネイティブバインディングが解決しない場合は以下を追加してください。

```bash
npm install -D @rolldown/binding-linux-x64-gnu@1.2.3
```

## コマンド

```bash
npm run dev          # 開発サーバー起動（http://localhost:5173）
npm run build        # 本番ビルド
npm run typecheck    # TypeScript 型検査
npm run lint         # ESLint + Prettier 確認
npm run lint:fix     # 自動修正
npm run format       # Prettier 整形
npm run test         # テスト実行
npm run test:coverage # カバレッジ付きテスト
```

## 使い方

### 1. コア機能のインポート

```typescript
import { generateAdventurer } from './src/core/generators/adventurerGenerator.ts'
import { generateEnemy } from './src/core/generators/enemyGenerator.ts'
import {
  generateEncounter,
  calculatePartyThreat,
} from './src/core/generators/encounterGenerator.ts'
import { runBattle } from './src/core/battle/battle.ts'

const adventurer = generateAdventurer({
  seed: 'hero-001',
  rank: 'C',
  role: 'vanguard',
})
const enemy = generateEnemy('goblin-001', {
  rank: 'E',
  species: 'humanoid',
  tier: 'minion',
})
```

### 2. パーティと遭遇の生成

```typescript
const party = [
  generateAdventurer({ seed: 'p-1', rank: 'C', role: 'vanguard' }),
  generateAdventurer({ seed: 'p-2', rank: 'C', role: 'ranger' }),
  generateAdventurer({ seed: 'p-3', rank: 'C', role: 'mage' }),
  generateAdventurer({ seed: 'p-4', rank: 'C', role: 'healer' }),
]
const partyThreat = calculatePartyThreat(party)
const enemies = generateEncounter({
  seed: 'enc-001',
  partyThreat,
  difficulty: 'normal',
})
```

### 3. 自動戦闘

```typescript
const result = runBattle('battle-001', party, enemies)
console.log(result.outcome) // 'victory' | 'costlyVictory' | 'retreat' | 'defeat' | ...
console.log(result.rounds)
console.log(result.logs)
```

## シード再現性

- `SeededRng` は cyrb128 + sfc32 による決定論的疑似乱数生成器です。
- すべての生成器と `runBattle` は `seed` 文字列を受け取り、同じ入力から同じ出力を返します。
- UI の各機能にも「シード」入力欄があり、値を変えずに「生成」「戦闘実行」を押すと同一結果が得られます。

## 戦闘システム概要

1. **接敵フェーズ**: 隠密・知覚・知識ロールで先制判定
2. **交戦フェーズ**: 最大 20 ラウンドのラウンド制戦闘
3. **撤退フェーズ**: 士気・負傷状況に基づき撤退判定
4. **戦後処理**: 重傷・戦死判定、負傷テーブル出力

## データ拡張

### ロール / 特性 / 装備

- `src/data/roles.ts` … ロールのステータス相性、スキル相性、装備ID
- `src/data/traits.ts` … 特性とその効果
- `src/data/equipment.ts` … 武器・防具

### 敵データ

- `src/data/enemyData.ts` … 敵アーキタイプ、種族、特殊能力、弱点

各ファイルはデータオブジェクトとして追加するだけで、生成器・戦闘エンジンが自動的に利用します。

## UI 機能

- **冒険者生成**: 等級・役割・シードを指定して個別生成
- **パーティ生成**: 4 人一組をシードで生成
- **敵生成**: 等級・種族・ティア・シードを指定
- **遭遇生成**: 脅威点・難易度から敵編成を生成
- **自動戦闘**: 生成したパーティと遭遇を戦闘
- **シミュレーション**: 指定回数（最大 1000）の戦闘を一括実行し勝率を表示

## Phase 1 最終定数

Phase 1 最終状態として採用した定数です（`src/core/balance/constants.ts` から抜粋）。

### ADVENTURER_THREAT

```ts
{
  E: 2.97,
  D: 3.90,
  C: 4.61,
  B: 6.11,
  A: 6.13,
  S: 7.24,
}
```

### ABILITY_THREAT_COST

```ts
{
  flight: 2.414,
  poisonAttack: 0.05,     // provisional (low confidence)
  bleedAttack: 0.05,      // provisional (low confidence)
  areaAttack: 0.117,
  revive: 0.432,
  regeneration: 2.687,
  frontDefense: 0.626,
  magicResist: 1.867,
  physicalResist: 0.789,
  darknessBoost: 0.100,
  corpseExplosion: 0.05,  // provisional (low confidence)
  summon: 3.227,
  taunt: 0.05,            // provisional (low confidence)
  fear: 3.884,
  healBlock: 0.05,        // provisional (low confidence)
  counter: 0.065,
  stealthStart: 0.05,     // provisional (low confidence)
  swarmCoordination: 1.408,
}
```

Provisional マークの能力は、Phase 1.7A の ablation で信頼区間が 0 をまたいだか有効シナリオが少なく、暫定値を維持しています。

### 評価シード

- `phase1-7-ability-cost-validation-v1`（能力コスト反映後 validation）
- `phase1-7b-calibration-v1`（等級較正 calibration）
- `phase1-7b-validation-v1`（等級較正 validation）
- `phase1-final-difficulty-validation-v1`（最終難易度別ベンチマーク）

詳細は `PHASE1.7_REPORT.md` を参照してください。

---

## 既知の制限

- 戦闘AIはルールベースであり、最適解ではなく役割別の行動優先度です。
- 敵のティア「DISASTER」は戦闘エンジン内部で「boss」と同じ扱いになります。
- 状態異常の種類は `poison` / `bleed` / `stun` / `fear` / `healBlock` の簡易実装です。
- シミュレーション回数を 1000 にした場合、ブラウザのメインスレッドを短時間占有します。

## 今後の展望

- 戦闘ログの可視化（ラウンドごとのHP推移グラフ）
- 装備ドロップと戦利品テーブル
- ダンジョン階層の遭遇連鎖シミュレーション
- Web Worker を使った非同期シミュレーション

## ライセンス

MIT
