# Phase 8.6 レポート：Title Screen, Save/Load & Campaign Seed System

## 概要

Phase 8.6 では、Canvas 版ゲーム起動時のタイトル画面、セーブ/ロードシーン、新規キャンペーンのランダム Seed 生成、および Save/Load 完全決定論システムを実装しました。

- `TitleScene`：タイトル背景・ロゴ、ニューゲーム/ロードゲーム/Legacy UI ボタン、バージョン表示
- `SaveLoadScene`：autosave / slot-1/2/3 一覧、互換性のないセーブの無効化、上書き確認
- `SeededRng` の完全内部状態シリアライズ/復元
- IndexedDB ベース `SaveRepository` + インメモリテスト実装
- `TavernSimulator` へのオートセーブ/手動セーブ統合
- ゲームバージョン・セーブフォーマットバージョンの厳格な一致チェック（マイグレーションなし）

## 主な実装

- `src/version.ts`: `GAME_VERSION = '0.0.0'`, `SAVE_FORMAT_VERSION = '1'`
- `src/core/rng/seededRng.ts`: `serialize()` / `restore()` 追加
- `src/core/save/`: `types.ts`, `serializer.ts`, `validation.ts`, `seed.ts`, `inMemorySaveRepository.ts`, `indexedDbSaveRepository.ts`
- `src/ui/canvas/scenes/title/TitleScene.ts`: PixiJS タイトル画面
- `src/ui/canvas/scenes/saveLoad/SaveLoadScene.ts`: セーブ/ロード UI
- `src/ui/canvas/CanvasGame.ts`: シーン登録、タイトル→酒場遷移
- `src/ui/canvas/GameCanvasHost.tsx`: セーブ関連アクションを CanvasGame へ配線
- `src/ui/tavern/TavernSimulator.tsx`: 新規/ロード/保存/削除/一覧、オートセーブ

## 検証

| 項目                                                     | 結果                        |
| -------------------------------------------------------- | --------------------------- |
| `npm run typecheck`                                      | pass                        |
| `npm run lint`                                           | pass                        |
| `npm run test`                                           | 106 files / 1139 tests pass |
| `npm run test:coverage`                                  | pass（Statements 89.43%）   |
| `npm run build`                                          | pass                        |
| `npm run test:expedition-regression`                     | 22/22 pass                  |
| 30-day progression smoke                                 | pass                        |
| compression / timeline audit                             | pass                        |
| Phase 8.0–8.3 smokes                                     | all pass                    |
| Phase 8.6 smoke (`src/core/save/smoke-phase8-6.test.ts`) | pass                        |

## 設計上の決定

- `TavernSimulator` はテスト時のみ `uiMode=legacy` を初期値にし、Canvas スモークテストとユニットテストを分離して実行します。ブラウザ実行時は `uiMode=canvas`（タイトル画面）が初期値です。
- 新規キャンペーンは `crypto.getRandomValues` を用いて Seed を生成し、通常プレイ時の固定 Seed は廃止しました。テストでは引き続き `createTavernCampaign(seed)` に明示的 Seed を渡します。
- ロードはアトミックに行います。メタデータ・バージョン・フォーマット・キャンペーン構造を検証してから `setCampaign` を呼び出し、失敗時は既存のキャンペーンを変更しません。
- オートセーブは `handleFinishDay`（DayResults → 翌日 TavernScene 遷移時）に実行されます。`handleResolve` 中や narrative 生成中には実行しません。
