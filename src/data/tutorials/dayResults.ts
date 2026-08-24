import { TAVERN_ECONOMY_CONFIG } from '../../core/economy/economyConfig.ts'
import type {
  DayResultsTutorialOutcome,
  TutorialScript,
} from '../../ui/canvas/tutorial/types.ts'

/**
 * Phase 10.2 `day_results` Tutorial — hand-authored, non-AI script for the
 * same 妖精 as `basic_request_assignment`. Covers exactly the Day Results
 * screen: 重要な出来事 -> 次へ -> 依頼結果（reaction branches on the
 * overall outcome）-> 本日の収支・評判 -> 帰還したパーティ一覧・詳細 ->
 * 「物語として読む」/「翌日へ」（同時に選べる最後の一手）.
 *
 * Like `basicRequestAssignment.ts`, this is a Runtime-interpreted step
 * graph addressed by id, not a flat sequence — `tutorialRuntime.ts` never
 * embeds any of this dialogue text inline, and never re-derives the
 * outcome/finance/reputation/narrative facts it reacts to; every branch
 * below reads only from `DayResultsScene`'s own authoritative ViewModel
 * (via `TutorialRuntime.syncDayResultsContext`) or from
 * `TAVERN_ECONOMY_CONFIG` directly (the `本日の営業費${...}` line below,
 * never a duplicated hardcoded `10`).
 */
const SPEAKER = '妖精'

/** `outcome_*` group ids, one per `DayResultsTutorialOutcome` — referenced
 * by `tutorialRuntime.ts`'s `DAY_RESULTS_OUTCOME_START_STEP_ID` map. Kept
 * here as the single source of truth for those literal step ids so the
 * two files can never silently drift apart. */
export const DAY_RESULTS_OUTCOME_STEP_IDS: Record<
  DayResultsTutorialOutcome,
  string
> = {
  all_success: 'outcome_all_success_1',
  mixed: 'outcome_mixed_1',
  all_failure: 'outcome_all_failure_1',
  no_results: 'outcome_no_results_1',
}

export const DAY_RESULTS_SCRIPT: TutorialScript = {
  startStepId: 'intro_1',
  steps: {
    // --- 重要な出来事 -----------------------------------------------
    intro_1: {
      type: 'message',
      id: 'intro_1',
      speaker: SPEAKER,
      text: 'はい、今日も一日お疲れ様でした！',
      next: 'intro_2',
    },
    intro_2: {
      type: 'message',
      id: 'intro_2',
      speaker: SPEAKER,
      text: '今表示されている「重要な出来事」は、文字通り今日起きた出来事をまとめてくれています',
      next: 'intro_3',
      highlightTarget: 'day_results_important_events',
    },
    intro_3: {
      type: 'message',
      id: 'intro_3',
      speaker: SPEAKER,
      text: '色々書かれてますね～。あ、これ全部私が書いたんですよ？　すごいでしょ',
      next: 'intro_4',
      highlightTarget: 'day_results_important_events',
    },
    intro_4: {
      type: 'message',
      id: 'intro_4',
      speaker: SPEAKER,
      text: 'パーティーが強くなったり、新しいパーティーが来たり、パーティーが療養したり……その日に起きた色んなことがここに書かれます',
      next: 'intro_5',
      highlightTarget: 'day_results_important_events',
    },
    intro_5: {
      type: 'message',
      id: 'intro_5',
      speaker: SPEAKER,
      text: '全部細かく覚える必要はありませんよ。気になることがあった時に確認するくらいで大丈夫です！',
      next: 'intro_6',
      highlightTarget: 'day_results_important_events',
    },
    intro_6: {
      type: 'message',
      id: 'intro_6',
      speaker: SPEAKER,
      text: 'それでは、右下の「次へ」を押して、冒険者さんたちの依頼結果を見てみましょう！',
      next: 'wait_next',
      highlightTarget: 'day_results_next_button',
    },
    wait_next: {
      type: 'wait_for_action',
      id: 'wait_next',
      wait: 'day_results_next_pressed',
      target: 'day_results_next_button',
    },

    // --- 依頼結果：outcome分岐 ---------------------------------------
    // Reached only via `TutorialRuntime.dispatch({type:'day_results_next_pressed'})`,
    // which routes to exactly one of these four groups based on
    // `syncDayResultsContext`'s authoritative outcome classification —
    // never a Tutorial-side re-derivation of raw Expedition results.
    outcome_all_success_1: {
      type: 'message',
      id: 'outcome_all_success_1',
      speaker: SPEAKER,
      text: 'おお、これはすごい！　今日出発したパーティーが、全員無事に依頼を達成してくれたようですよ！',
      next: 'outcome_all_success_2',
      highlightTarget: 'day_results_results_area',
    },
    outcome_all_success_2: {
      type: 'message',
      id: 'outcome_all_success_2',
      speaker: SPEAKER,
      text: '店主さんの人選が良かったのかもしれませんね。詳しくは、この後の一覧で確認できますよ',
      next: 'finance_intro_1',
      highlightTarget: 'day_results_results_area',
    },
    outcome_mixed_1: {
      type: 'message',
      id: 'outcome_mixed_1',
      speaker: SPEAKER,
      text: 'ふむふむ、今日は依頼によって結果が分かれたようですね',
      next: 'outcome_mixed_2',
      highlightTarget: 'day_results_results_area',
    },
    outcome_mixed_2: {
      type: 'message',
      id: 'outcome_mixed_2',
      speaker: SPEAKER,
      text: 'うまくいった依頼もあれば、そうでなかった依頼もある。冒険者稼業では珍しいことではありません',
      next: 'outcome_mixed_3',
      highlightTarget: 'day_results_results_area',
    },
    outcome_mixed_3: {
      type: 'message',
      id: 'outcome_mixed_3',
      speaker: SPEAKER,
      text: 'ひとつずつ、どんな結果だったのか見ていきましょう',
      next: 'finance_intro_1',
      highlightTarget: 'day_results_results_area',
    },
    outcome_all_failure_1: {
      type: 'message',
      id: 'outcome_all_failure_1',
      speaker: SPEAKER,
      text: 'うーん……残念ながら、今日は厳しい結果になってしまったようです',
      next: 'outcome_all_failure_2',
      highlightTarget: 'day_results_results_area',
    },
    outcome_all_failure_2: {
      type: 'message',
      id: 'outcome_all_failure_2',
      speaker: SPEAKER,
      text: 'でも、気を落とさないでくださいね。依頼やパーティーの組み合わせを変えれば、明日はきっとうまくいきます',
      next: 'outcome_all_failure_3',
      highlightTarget: 'day_results_results_area',
    },
    outcome_all_failure_3: {
      type: 'message',
      id: 'outcome_all_failure_3',
      speaker: SPEAKER,
      text: 'まずは何が起きたのか、詳しく確認してみましょう',
      next: 'finance_intro_1',
      highlightTarget: 'day_results_results_area',
    },
    outcome_no_results_1: {
      type: 'message',
      id: 'outcome_no_results_1',
      speaker: SPEAKER,
      text: '今日はまだ、帰還したパーティーはいないようですね',
      next: 'outcome_no_results_2',
      highlightTarget: 'day_results_results_area',
    },
    outcome_no_results_2: {
      type: 'message',
      id: 'outcome_no_results_2',
      speaker: SPEAKER,
      text: '依頼をお願いしなかった日や、まだ遠征中のパーティーだけの日は、こういうこともありますよ',
      next: 'finance_intro_1',
      highlightTarget: 'day_results_results_area',
    },

    // --- 本日の収支・評判 --------------------------------------------
    finance_intro_1: {
      type: 'message',
      id: 'finance_intro_1',
      speaker: SPEAKER,
      text: 'さて、上の方に表示されているこちらが「本日の収支・評判」です',
      next: 'finance_intro_2',
      highlightTarget: 'day_results_finance',
    },
    finance_intro_2: {
      type: 'message',
      id: 'finance_intro_2',
      speaker: SPEAKER,
      text: '「依頼仲介収入」は、依頼を無事に達成してもらえたときに入ってくる、酒場の仲介料です',
      next: 'finance_intro_3',
      highlightTarget: 'day_results_finance',
    },
    finance_intro_3: {
      type: 'message',
      id: 'finance_intro_3',
      speaker: SPEAKER,
      text: 'そこから「本日収支」「現在資金」まで、一日の締め処理として表示されています',
      next: 'finance_cost_1',
      highlightTarget: 'day_results_finance',
    },
    finance_cost_1: {
      type: 'message',
      id: 'finance_cost_1',
      speaker: SPEAKER,
      text: `「営業費」は、依頼の結果に関係なく毎日かかる酒場の維持費です。今のところ一日あたり${TAVERN_ECONOMY_CONFIG.dailyOperatingCost}枚ですね`,
      next: 'finance_debt_1',
      highlightTarget: 'day_results_finance',
    },
    finance_debt_1: {
      type: 'message',
      id: 'finance_debt_1',
      speaker: SPEAKER,
      text: '収入より営業費の方が多い日は、「本日収支」がマイナスになることもあります',
      next: 'finance_debt_2',
      highlightTarget: 'day_results_finance',
    },
    finance_debt_2: {
      type: 'message',
      id: 'finance_debt_2',
      speaker: SPEAKER,
      text: 'ただ、ご安心を。マイナスになったからといって借金を背負うような特別なペナルティがあるわけではありません。ただの記録として残るだけですよ',
      next: 'reputation_1',
      highlightTarget: 'day_results_finance',
    },
    reputation_1: {
      type: 'message',
      id: 'reputation_1',
      speaker: SPEAKER,
      text: 'その下にあるのが「評判」です。依頼の結果に応じて、日々少しずつ変動します',
      next: 'reputation_2',
      highlightTarget: 'day_results_finance',
    },
    reputation_2: {
      type: 'message',
      id: 'reputation_2',
      speaker: SPEAKER,
      text: '依頼をしっかり達成できれば評判は上がりますし、うまくいかない日が続けば下がってしまうこともあります',
      next: 'reputation_3',
      highlightTarget: 'day_results_finance',
    },
    reputation_3: {
      type: 'message',
      id: 'reputation_3',
      speaker: SPEAKER,
      text: '評判が上がって酒場のランクが上がっていくと、腕の立つ冒険者さんも訪ねてきてくれやすくなりますよ',
      next: 'reputation_summary_1',
      highlightTarget: 'day_results_finance',
    },
    reputation_summary_1: {
      type: 'message',
      id: 'reputation_summary_1',
      speaker: SPEAKER,
      text: 'この画面の「評判 ○○ → ○○」という表示で、今日一日の変化を確認できます',
      next: 'results_area_1',
      highlightTarget: 'day_results_finance',
    },

    // --- 帰還したパーティ一覧・詳細 -----------------------------------
    // PR #63 review item 22-26: describes the results list/detail area
    // WITHOUT instructing the Player to actually select a result — this
    // whole chain is `message` steps, so Game UI interaction stays
    // blocked throughout (item 23: result-selection is deliberately never
    // a required Tutorial Action, no `WAIT result_selected` exists).
    // Telling the Player to "選んでみてください" here would contradict
    // that blocked state; every line below only ever describes what the
    // panel shows and how selecting works, in case they naturally look
    // there once the Tutorial ends.
    results_area_1: {
      type: 'message',
      id: 'results_area_1',
      speaker: SPEAKER,
      text: 'そして、その下には、それぞれのパーティーがどんな結果になったのかが表示されています',
      next: 'results_area_2',
      highlightTarget: 'day_results_results_area',
    },
    results_area_2: {
      type: 'message',
      id: 'results_area_2',
      speaker: SPEAKER,
      text: '左側には、帰ってきたパーティーの結果が並んでいます',
      next: 'results_area_3',
      highlightTarget: 'day_results_results_area',
    },
    results_area_3: {
      type: 'message',
      id: 'results_area_3',
      speaker: SPEAKER,
      text: '確認したい結果を選ぶと、その詳しい内容が右側に表示されますよ',
      next: 'results_area_4',
      highlightTarget: 'day_results_results_area',
    },
    results_area_4: {
      type: 'message',
      id: 'results_area_4',
      speaker: SPEAKER,
      text: '誰がどの依頼へ行って、成功したのか失敗したのか。それから、どんなことが起きたのかもここで確認できます',
      next: 'results_area_5',
      highlightTarget: 'day_results_results_area',
    },
    results_area_5: {
      type: 'message',
      id: 'results_area_5',
      speaker: SPEAKER,
      text: '……まあ、その、ぶっちゃけた話',
      next: 'results_area_6',
      highlightTarget: 'day_results_results_area',
    },
    results_area_6: {
      type: 'message',
      id: 'results_area_6',
      speaker: SPEAKER,
      text: '明日の仕事を振り分けるだけなら、ここを全部じっくり読む必要はないんですけどね',
      next: 'results_area_7',
      highlightTarget: 'day_results_results_area',
    },
    results_area_7: {
      type: 'message',
      id: 'results_area_7',
      speaker: SPEAKER,
      text: 'でも店主さんの目標は、ただ酒場を経営することじゃありません',
      next: 'results_area_8',
      highlightTarget: 'day_results_results_area',
    },
    results_area_8: {
      type: 'message',
      id: 'results_area_8',
      speaker: SPEAKER,
      text: '打倒ノスフェラトゥ！',
      next: 'results_area_9',
      highlightTarget: 'day_results_results_area',
    },
    results_area_9: {
      type: 'message',
      id: 'results_area_9',
      speaker: SPEAKER,
      text: 'そのためにも、どんな冒険者さんたちがいて、どんな戦いをしているのか知っておくことは大事ですよ',
      next: 'results_area_10',
      highlightTarget: 'day_results_results_area',
    },
    results_area_10: {
      type: 'message',
      id: 'results_area_10',
      speaker: SPEAKER,
      text: '「前の結果」「次の結果」のボタンで、他の結果に切り替えることもできますよ',
      next: 'results_area_11',
      highlightTarget: 'day_results_results_area',
    },
    results_area_11: {
      type: 'message',
      id: 'results_area_11',
      speaker: SPEAKER,
      text: '未読の結果には目印がついています。すべて見ておくと、酒場の様子がよく分かりますよ',
      next: 'results_area_12',
      highlightTarget: 'day_results_results_area',
    },
    results_area_12: {
      type: 'message',
      id: 'results_area_12',
      speaker: SPEAKER,
      text: 'それと、結果によっては右側の詳細に「物語として読む」というボタンが出てくることがあります',
      next: 'results_area_narrative_check',
      highlightTarget: 'day_results_results_area',
    },
    // No static `next` — `TutorialRuntime.advanceMessage()` special-cases
    // this exact step id: it reads the Scene's own `_narrativeAvailable`
    // (set via `syncDayResultsContext`, from `ExpeditionReportViewModel`'s
    // `generatedText`/`canGenerateNarrative`), and branches to
    // `narrative_intro_1` when a Narrative is genuinely available for the
    // currently-selected result, or to `no_narrative_1` otherwise. The
    // Tutorial never forces the Player to pick a different, Narrative-
    // capable result just to satisfy this step (item 41's explicit escape
    // hatch). Named descriptively rather than by position in the
    // `results_area_*` chain, so the chain's own length can change
    // (as it just did for the PR #63 P2 wording fix) without this
    // branch's identity ever silently shifting.
    results_area_narrative_check: {
      type: 'message',
      id: 'results_area_narrative_check',
      speaker: SPEAKER,
      text: 'これを押すと、その依頼の顛末を、ちょっとした物語として読むことができます',
      highlightTarget: 'day_results_results_area',
    },

    // --- 「物語として読む」が選べる場合 --------------------------------
    narrative_intro_1: {
      type: 'message',
      id: 'narrative_intro_1',
      speaker: SPEAKER,
      text: 'そしてここでもうひとつ、私の神の使いパワー！',
      next: 'narrative_intro_2',
      highlightTarget: 'day_results_narrative_button',
    },
    narrative_intro_2: {
      type: 'message',
      id: 'narrative_intro_2',
      speaker: SPEAKER,
      text: '「物語として読む」というボタンがありますね？',
      next: 'narrative_intro_3',
      highlightTarget: 'day_results_narrative_button',
    },
    narrative_intro_3: {
      type: 'message',
      id: 'narrative_intro_3',
      speaker: SPEAKER,
      text: 'これを押すと、そのパーティーがお仕事をしていた時の様子を、私の神の使いパワーでお見せできます！',
      next: 'narrative_intro_4',
      highlightTarget: 'day_results_narrative_button',
    },
    narrative_intro_4: {
      type: 'message',
      id: 'narrative_intro_4',
      speaker: SPEAKER,
      text: 'どうやって依頼をこなしたのか、どんなことが起きていたのか。気になった時に覗いてみてください！',
      next: 'narrative_intro_5',
      highlightTarget: 'day_results_narrative_button',
    },
    narrative_intro_5: {
      type: 'message',
      id: 'narrative_intro_5',
      speaker: SPEAKER,
      text: '読まなくても、店主さんのお仕事に支障はありませんよ',
      next: 'narrative_intro_6',
      highlightTarget: 'day_results_narrative_button',
    },
    narrative_intro_6: {
      type: 'message',
      id: 'narrative_intro_6',
      speaker: SPEAKER,
      text: 'さて、それでは最後に、この画面の締めくくり方をお伝えしますね',
      next: 'final_choice_1',
      highlightTarget: 'day_results_narrative_button',
    },
    final_choice_1: {
      type: 'message',
      id: 'final_choice_1',
      speaker: SPEAKER,
      text: 'ここから先は、「物語として読む」を押して先ほどの物語を読みに行くか――',
      next: 'final_choice_2',
      highlightTarget: [
        'day_results_narrative_button',
        'day_results_next_day_button',
      ],
    },
    final_choice_2: {
      type: 'message',
      id: 'final_choice_2',
      speaker: SPEAKER,
      text: 'そのまま右下の「翌日へ」を押して、この画面を締めくくるか。店主さんの好きな方を選んでください',
      next: 'wait_final_choice',
      highlightTarget: [
        'day_results_narrative_button',
        'day_results_next_day_button',
      ],
    },
    // The Multi-target closing step (item 10 of the Day Results review):
    // BOTH the Narrative button and 翌日へ are simultaneously valid real
    // next actions. No static `next` on this step:
    //  - `day_results_story_opened` is special-cased in `dispatch()` and
    //    goes to `after_story_1` WITHOUT completing the Tutorial — reading
    //    the Narrative doesn't close Day Results.
    //  - `day_results_closed` falls through to the generic "no `next` ->
    //    completeActiveTutorial()" path, since it's what actually closes
    //    Day Results (item 51).
    wait_final_choice: {
      type: 'wait_for_action',
      id: 'wait_final_choice',
      wait: ['day_results_story_opened', 'day_results_closed'],
      target: ['day_results_narrative_button', 'day_results_next_day_button'],
    },
    // Reached after the Player reads the Narrative and the SoundNovel
    // Scene pops back to Day Results — the `TutorialResumeState` marker
    // (set right before the Scene pushed SoundNovel) lands the Runtime
    // back exactly here, never at `startStepId`.
    after_story_1: {
      type: 'message',
      id: 'after_story_1',
      speaker: SPEAKER,
      text: 'お帰りなさい、店主さん！　物語はいかがでしたか？',
      next: 'after_story_2',
      highlightTarget: 'day_results_next_day_button',
    },
    after_story_2: {
      type: 'message',
      id: 'after_story_2',
      speaker: SPEAKER,
      text: '他の結果にも、それぞれの物語がありますから、気が向いたときにまた読んでみてくださいね',
      next: 'after_story_3',
      highlightTarget: 'day_results_next_day_button',
    },
    after_story_3: {
      type: 'message',
      id: 'after_story_3',
      speaker: SPEAKER,
      text: 'それでは、右下の「翌日へ」を押して、今日という日を締めくくりましょう！',
      next: 'wait_after_story_close',
      highlightTarget: 'day_results_next_day_button',
    },
    wait_after_story_close: {
      type: 'wait_for_action',
      id: 'wait_after_story_close',
      wait: 'day_results_closed',
      target: 'day_results_next_day_button',
    },

    // --- 「物語として読む」が選べない場合 -------------------------------
    no_narrative_1: {
      type: 'message',
      id: 'no_narrative_1',
      speaker: SPEAKER,
      text: '今選んでいる結果には、まだ「物語」は用意されていないようですね',
      next: 'no_narrative_2',
      highlightTarget: 'day_results_next_day_button',
    },
    no_narrative_2: {
      type: 'message',
      id: 'no_narrative_2',
      speaker: SPEAKER,
      text: 'それでは、右下の「翌日へ」を押して、今日という日を締めくくりましょう！',
      next: 'wait_final_no_narrative',
      highlightTarget: 'day_results_next_day_button',
    },
    wait_final_no_narrative: {
      type: 'wait_for_action',
      id: 'wait_final_no_narrative',
      wait: 'day_results_closed',
      target: 'day_results_next_day_button',
    },
  },
}
