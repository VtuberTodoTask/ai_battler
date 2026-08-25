import type { TutorialScript } from '../../ui/canvas/tutorial/types.ts'

/**
 * Phase 10.3 `tavern_functions` Tutorial — hand-authored, non-AI script
 * for the same 妖精 as `basic_request_assignment`/`day_results`. Closes
 * out the first-time introductory Tutorial sequence with a light,
 * one-way walkthrough of the Tavern Header's 8 navigation buttons: what
 * each one is for, never how to operate it — every step here is a
 * `message` with no `target` (no `wait_for_action` steps at all in this
 * script), so Game UI interaction stays fully blocked throughout, and the
 * Player never actually opens any of the described Scenes during this
 * Tutorial (Phase 10.3 review items 7-8).
 *
 * Every factual line below was checked against the actual authoritative
 * Core implementation before being written (Phase 10.3 review items 17,
 * 20, 24, 26-28) — see the per-section comments for what was verified and
 * where:
 *  - 資料室 (library/World Encyclopedia): confirmed pure lore content —
 *    `buildWorldEncyclopediaViewModel` only reads static lore entries,
 *    never touches `TavernCampaignState`.
 *  - 設備 (facilities/upgrades): confirmed 依頼掲示板 increases the day's
 *    Quest Board request count (`getDailyRequestBonus`,
 *    `core/tavern/campaign/upgrades.ts`) and 療養室 shortens new recovery
 *    periods (`getRecoveryDayReduction`) — the two effects item 20
 *    requires exist before this script's line can be used.
 *  - 世界情勢 (World Events): confirmed an active World Event guarantees
 *    a specific, event-tied request on that day's board
 *    (`buildWorldEventRequestForDay` / `collectDueEventRequest`,
 *    `core/tavern/campaign/worldEvents.ts`) — described here as
 *    "related requests appearing", matching the real mechanic more
 *    precisely than a vague "tendency" would.
 *  - 主依頼 (Main Quest): confirmed via `evaluateMainQuestDispatch`
 *    (`core/mainQuest/dispatch.ts`) that eligibility gates on Party
 *    Rank, that specific Party's own Affinity (bond) with the tavern —
 *    NOT the tavern-wide Reputation stat `day_results` already
 *    introduced — and tavern Funds. The script below says 【絆】
 *    (bond with that Party), deliberately not 【信頼】/reputation, to
 *    avoid contradicting the real, separate mechanic.
 *
 * This is a Runtime-interpreted step graph (addressed by id), like every
 * other Tutorial script, but deliberately a straight line — no branches,
 * no `wait_for_action` steps, no resume marker (item 36: nothing here
 * ever pushes another Scene, so there is nothing to resume through).
 * Reaching the final step (no `next`) completes the Tutorial via the
 * Runtime's existing generic "no `next` -> completeActiveTutorial()"
 * fallback — no script-specific completion logic was needed.
 */
const SPEAKER = '妖精'

export const TAVERN_FUNCTIONS_SCRIPT: TutorialScript = {
  startStepId: 'intro_1',
  steps: {
    // --- 導入 ---------------------------------------------------------
    intro_1: {
      type: 'message',
      id: 'intro_1',
      speaker: SPEAKER,
      text: '基本的なお仕事の流れはこれだけです！　シンプルでしょ？',
      next: 'intro_2',
    },
    intro_2: {
      type: 'message',
      id: 'intro_2',
      speaker: SPEAKER,
      text: 'では最後に、ほかの機能についても教えておきますね',
      next: 'save_1',
    },

    // --- セーブ ---------------------------------------------------------
    save_1: {
      type: 'message',
      id: 'save_1',
      speaker: SPEAKER,
      text: 'これは「セーブ」。文字通り、今の状態をセーブデータとして保存します',
      next: 'save_2',
      highlightTarget: 'tavern_save_button',
    },
    save_2: {
      type: 'message',
      id: 'save_2',
      speaker: SPEAKER,
      text: 'お仕事を再開するためにも、こまめに保存しておきましょうね！',
      next: 'library_1',
      highlightTarget: 'tavern_save_button',
    },

    // --- 資料室 ---------------------------------------------------------
    library_1: {
      type: 'message',
      id: 'library_1',
      speaker: SPEAKER,
      text: 'これは「資料室」。この世界についての資料をまとめてあります',
      next: 'library_2',
      highlightTarget: 'tavern_library_button',
    },
    library_2: {
      type: 'message',
      id: 'library_2',
      speaker: SPEAKER,
      text: 'お仕事に直接関係してくるものではないので……お仕事に疲れた時の読み物としてでも、読んでみてください',
      next: 'ledger_1',
      highlightTarget: 'tavern_library_button',
    },

    // --- 帳簿 ---------------------------------------------------------
    ledger_1: {
      type: 'message',
      id: 'ledger_1',
      speaker: SPEAKER,
      text: 'これは「帳簿」。これまでの酒場のお金の動きを確認できますよ',
      next: 'ledger_2',
      highlightTarget: 'tavern_ledger_button',
    },
    ledger_2: {
      type: 'message',
      id: 'ledger_2',
      speaker: SPEAKER,
      text: '何にお金を使って、どれくらい稼いだのか気になった時は、ここを見てください！',
      next: 'facilities_1',
      highlightTarget: 'tavern_ledger_button',
    },

    // --- 設備 ---------------------------------------------------------
    facilities_1: {
      type: 'message',
      id: 'facilities_1',
      speaker: SPEAKER,
      text: 'これは「設備」。酒場のお金を使って、いろんな設備を増やせます！',
      next: 'facilities_2',
      highlightTarget: 'tavern_facilities_button',
    },
    facilities_2: {
      type: 'message',
      id: 'facilities_2',
      speaker: SPEAKER,
      text: '扱える依頼を増やしたり、冒険者さんたちが療養しやすくなったり……設備によって色んな効果がありますよ',
      next: 'facilities_3',
      highlightTarget: 'tavern_facilities_button',
    },
    facilities_3: {
      type: 'message',
      id: 'facilities_3',
      speaker: SPEAKER,
      text: 'お金に余裕ができたら、覗いてみてください！',
      next: 'visitors_1',
      highlightTarget: 'tavern_facilities_button',
    },

    // --- 来訪者台帳 -------------------------------------------------------
    visitors_1: {
      type: 'message',
      id: 'visitors_1',
      speaker: SPEAKER,
      text: 'これは「来訪者台帳」。これまでこの酒場に来たことがあるパーティーを確認できます',
      next: 'visitors_2',
      highlightTarget: 'tavern_visitors_button',
    },
    visitors_2: {
      type: 'message',
      id: 'visitors_2',
      speaker: SPEAKER,
      text: '「あの人たち、どんなパーティーだったっけ？」なんて時にどうぞ！',
      next: 'request_history_1',
      highlightTarget: 'tavern_visitors_button',
    },

    // --- 依頼記録 ---------------------------------------------------------
    request_history_1: {
      type: 'message',
      id: 'request_history_1',
      speaker: SPEAKER,
      text: 'これは「依頼記録」。これまで発生した連続依頼の記録を確認できます',
      next: 'request_history_2',
      highlightTarget: 'tavern_request_history_button',
    },
    request_history_2: {
      type: 'message',
      id: 'request_history_2',
      speaker: SPEAKER,
      text: '何日かにわたって続く依頼が、今どこまで進んでいるのか。過去にどうなったのかを振り返りたい時に使ってください！',
      next: 'world_state_1',
      highlightTarget: 'tavern_request_history_button',
    },

    // --- 世界情勢 ---------------------------------------------------------
    world_state_1: {
      type: 'message',
      id: 'world_state_1',
      speaker: SPEAKER,
      text: 'これは「世界情勢」。今、この世界で何が起きているのかを確認できます',
      next: 'world_state_2',
      highlightTarget: 'tavern_world_state_button',
    },
    world_state_2: {
      type: 'message',
      id: 'world_state_2',
      speaker: SPEAKER,
      text: '世の中では色んなことが起こります。何か大きなことが起きている間は、それに関連した依頼が届くこともありますよ',
      next: 'world_state_3',
      highlightTarget: 'tavern_world_state_button',
    },
    world_state_3: {
      type: 'message',
      id: 'world_state_3',
      speaker: SPEAKER,
      text: '最近なんだか同じような依頼が多いな～、なんて思った時は確認してみるといいですよ！',
      next: 'main_quest_1',
      highlightTarget: 'tavern_world_state_button',
    },

    // --- 主依頼 ---------------------------------------------------------
    main_quest_1: {
      type: 'message',
      id: 'main_quest_1',
      speaker: SPEAKER,
      text: 'そして、これは「主依頼」',
      next: 'main_quest_2',
      highlightTarget: 'tavern_main_quest_button',
    },
    main_quest_2: {
      type: 'message',
      id: 'main_quest_2',
      speaker: SPEAKER,
      text: '店主さんが目指すべき、世界の脅威――そして、ノスフェラトゥの討伐をお願いするなら、ここからです',
      next: 'main_quest_3',
      highlightTarget: 'tavern_main_quest_button',
    },
    main_quest_3: {
      type: 'message',
      id: 'main_quest_3',
      speaker: SPEAKER,
      text: 'もちろん、誰にでもお願いできるわけではありません',
      next: 'main_quest_4',
      highlightTarget: 'tavern_main_quest_button',
    },
    main_quest_4: {
      type: 'message',
      id: 'main_quest_4',
      speaker: SPEAKER,
      text: '挑むパーティーの【実力】、そのパーティーとの【絆】、そして挑戦を支える【酒場の資金】',
      next: 'main_quest_5',
      highlightTarget: 'tavern_main_quest_button',
    },
    main_quest_5: {
      type: 'message',
      id: 'main_quest_5',
      speaker: SPEAKER,
      text: 'この3つが十分に整って、はじめて大きな戦いを任せられるようになります',
      next: 'main_quest_6',
      highlightTarget: 'tavern_main_quest_button',
    },
    main_quest_6: {
      type: 'message',
      id: 'main_quest_6',
      speaker: SPEAKER,
      text: 'これを誰かにお願いできるよう、お仕事頑張りましょうね！',
      next: 'ending_1',
      highlightTarget: 'tavern_main_quest_button',
    },

    // --- 締め ---------------------------------------------------------
    // No `highlightTarget` from here on — the Spotlight is deliberately
    // cleared, back to the plain Tutorial dim overlay (item 30).
    ending_1: {
      type: 'message',
      id: 'ending_1',
      speaker: SPEAKER,
      text: '……とまあ、こんな感じです！',
      next: 'ending_2',
    },
    ending_2: {
      type: 'message',
      id: 'ending_2',
      speaker: SPEAKER,
      text: 'あとは実際に触りながら覚えていけば大丈夫ですよ',
      next: 'ending_3',
    },
    ending_3: {
      type: 'message',
      id: 'ending_3',
      speaker: SPEAKER,
      text: '分からなくても、とりあえずやってみる！　何でも当たって砕けろです！',
      next: 'ending_4',
    },
    ending_4: {
      type: 'message',
      id: 'ending_4',
      speaker: SPEAKER,
      text: 'それじゃあ店主さん、頑張っていきましょう！',
      next: 'ending_5',
    },
    // No static `next` — reaching this step (via `advanceMessage()`) hits
    // the Runtime's generic "no `next` -> completeActiveTutorial()"
    // fallback, committing `completeTutorial('tavern_functions')` and
    // closing the Overlay (item 31).
    ending_5: {
      type: 'message',
      id: 'ending_5',
      speaker: SPEAKER,
      text: '打倒ノスフェラトゥ！！',
    },
  },
}
