# Phase 7.2.1 Narrative UI Flow E2E レポート

## 概要

`devin/phase7-2-1-narrative-quality`（PR #29）の `酒場キャンペーン` 内 AI 文章候補 / 物語生成フローを、`npm run dev` で `http://localhost:5173/` を起動し、Playwright ヘッドフルブラウザで seed `tavern-005` を使って end-to-end テストしました。

## 静的検証

| コマンド            | 結果                             |
| ------------------- | -------------------------------- |
| `npm run typecheck` | PASS                             |
| `npm run lint`      | PASS（test-plan フォーマット後） |
| `npm run test`      | 839 tests PASS                   |

## 実行環境

- リポジトリ: `/home/ubuntu/repos/ai_battler`
- ブランチ: `devin/phase7-2-1-narrative-quality`
- サーバー: `npm run dev` → `http://localhost:5173/`
- Playwright: `/tmp/pw-e2e/e2e.mjs`
- Seed: `tavern-005`

## E2E 結果

1. **遠征の通常実行**: 依頼 → パーティ → `この依頼を紹介する` → `本日の仲介を確定` が正常に通りました。
2. **Narrative Candidate 生成**: 遠征結果から `遠征レポート：旧坑道東部の測量` が `未生成` 状態で 1 件追加されました。
3. **Fake Provider 生成**: `開発用 Fake Provider を使う` → `遠征物語を生成` で `【Fake生成 #1】` が表示され、`model: fake-model | provider: fake | tokens: 1753` がレンダリングされました。
4. **Prompt v6 / NarrativeDirection 表示**: `AIへ送る内容` 詳細内の User Prompt に `=== NARRATIVE DIRECTION ===`、`Focus:`、`Main Scenes:`、`Secondary Scenes:`、`Montage Beat IDs:`、`Narrative Interaction Hints:` が含まれています。Raw Narrative Context 内の JSON に `"direction"`、`"mainScenes"`、`"secondaryScenes"`、`"montageBeatIds"`、`"focus"`、`"interactionHints"` が含まれています。
5. **フォールバック / Provider エラー**: `http://localhost:5173/invalid` を HTTP Provider エンドポイントに設定して生成すると、`AI文章の生成に失敗しました。HTTP 404:` と表示され、AI 呼び出しカウントは増加しませんでした。その後 `開発用 Fake Provider を使う` に切り替えて `翌日へ` をクリックし、次の日に進行できました。
6. **ゼロコール経路**: Provider 未接続状態で `本日の仲介を確定` しても `AI呼び出し: 0回` / `状態: AI未接続` のまま、候補は `未生成` で保持されました。
7. **Console エラー**: `error` / `pageerror` / unhandled rejection はありませんでした。`Failed to load resource: 404` は Provider エラーテストで意図的に発生させたネットワークエラーです。

## スクリーンショット

| 項目                        | 画像                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Provider 未接続・空のキュー | ![empty-queue](https://app.devin.ai/attachments/acde487e-f285-47f0-b3e5-f619b81214f8/phase7-2-1-empty-queue.png)                 |
| 遠征確定後の Candidate 生成 | ![expedition-resolved](https://app.devin.ai/attachments/45c8318f-25a9-473e-823c-ecd3e209301d/phase7-2-1-expedition-resolved.png) |
| Fake Provider 接続          | ![fake-provider](https://app.devin.ai/attachments/478d17f1-46a3-4858-8fa2-520a312ff435/phase7-2-1-fake-provider.png)             |
| 生成済み結果                | ![generated](https://app.devin.ai/attachments/4e35bfb8-a6c0-4082-8077-1905479ae865/phase7-2-1-generated.png)                     |
| HTTP Provider エラー        | ![provider-error](https://app.devin.ai/attachments/dfe59a17-e209-4905-8e2d-45ad84d27287/phase7-2-1-provider-error.png)           |
| Prompt v6 詳細              | ![prompt-details](https://app.devin.ai/attachments/fbb2158f-f24e-4ba2-9dc6-2acfe7a8ab98/phase7-2-1-prompt-details.png)           |
| Raw Narrative Context       | ![raw-context](https://app.devin.ai/attachments/cd29b44b-c25a-4590-a579-06756f24261d/phase7-2-1-raw-context.png)                 |
| 翌日へ進行                  | ![next-day](https://app.devin.ai/attachments/b4342a4d-34ed-44f2-b200-ee0dc53ab499/phase7-2-1-next-day.png)                       |

## コンソールログ

- `/home/ubuntu/screenshots/phase7-2-1-console.log`

## 結果

すべての受け入れ条件を満たし、console エラー / unhandled rejection は検出されませんでした（Provider エラーテストの意図的 404 を除く）。
