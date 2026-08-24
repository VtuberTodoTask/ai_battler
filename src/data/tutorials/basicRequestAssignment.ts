import type { TutorialScript } from '../../ui/canvas/tutorial/types.ts'

/**
 * Phase 10.1 `basic_request_assignment` Tutorial — hand-authored, non-AI
 * script for the 妖精 ("神の使い" fairy from the Opening). Covers exactly
 * one flow: look at a request -> pick a Party -> read the predicted
 * success rate -> offer the request -> see it accepted or declined.
 *
 * This is the PR #62 review's canonical script — the fairy narrates the
 * actual screen in front of the Player (continuing straight out of the
 * Opening) rather than reading like generic help text. Do not shorten or
 * re-paraphrase it without an explicit follow-up review requesting that.
 *
 * This is a Runtime-interpreted step graph, not a flat sequence, so the
 * `accepted_1` / `declined_1` branch can reconverge onto a shared
 * `common_1` closing block. `tutorialRuntime.ts` never embeds any of this
 * dialogue text inline — it only interprets step `type` / `wait` / `next`.
 */
const SPEAKER = '妖精'

export const BASIC_REQUEST_ASSIGNMENT_SCRIPT: TutorialScript = {
  startStepId: 'intro_1',
  steps: {
    intro_1: {
      type: 'message',
      id: 'intro_1',
      speaker: SPEAKER,
      text: '了解です！　では私にお任せください！',
      next: 'intro_2',
    },
    intro_2: {
      type: 'message',
      id: 'intro_2',
      speaker: SPEAKER,
      text: 'さて、店主さん！',
      next: 'intro_3',
    },
    intro_3: {
      type: 'message',
      id: 'intro_3',
      speaker: SPEAKER,
      text: 'あれからしばらく、色んなところに広めたおかげもあり、無事何組かパーティーも来てくださっているようです！',
      next: 'intro_4',
    },
    intro_4: {
      type: 'message',
      id: 'intro_4',
      speaker: SPEAKER,
      text: 'そして依頼の方も……ふむふむ、さっそく色々来てますね',
      next: 'intro_5',
    },
    intro_5: {
      type: 'message',
      id: 'intro_5',
      speaker: SPEAKER,
      text: 'では条件は揃いました！　今日から本格的に冒険者の酒場として働いていきましょう！',
      next: 'intro_6',
    },
    intro_6: {
      type: 'message',
      id: 'intro_6',
      speaker: SPEAKER,
      text: 'といっても、やることはシンプルです、店主さん',
      next: 'intro_7',
    },
    intro_7: {
      type: 'message',
      id: 'intro_7',
      speaker: SPEAKER,
      text: 'まずは右側の依頼をひとつ選んでみてください！',
      next: 'wait_quest_selected',
    },
    wait_quest_selected: {
      type: 'wait_for_action',
      id: 'wait_quest_selected',
      wait: 'quest_selected',
      target: 'quest_list',
      next: 'post_quest_1',
    },
    post_quest_1: {
      type: 'message',
      id: 'post_quest_1',
      speaker: SPEAKER,
      text: '選べましたね！　さっそく、こんな依頼が来ているようです',
      next: 'post_quest_2',
    },
    post_quest_2: {
      type: 'message',
      id: 'post_quest_2',
      speaker: SPEAKER,
      text: '中央には、今選んだ依頼の詳しい内容が表示されています',
      next: 'post_quest_3',
    },
    post_quest_3: {
      type: 'message',
      id: 'post_quest_3',
      speaker: SPEAKER,
      text: 'どんな仕事なのか、どれくらい危険そうなのか。まずはそのあたりを見てみてください',
      next: 'post_quest_4',
    },
    post_quest_4: {
      type: 'message',
      id: 'post_quest_4',
      speaker: SPEAKER,
      text: 'では次に、左側から、この依頼に適任だと思うパーティーを選んでみてください！',
      next: 'wait_party_selected',
    },
    wait_party_selected: {
      type: 'wait_for_action',
      id: 'wait_party_selected',
      wait: 'party_selected',
      target: 'party_list',
      next: 'wait_prediction_ready',
    },
    wait_prediction_ready: {
      type: 'wait_for_action',
      id: 'wait_prediction_ready',
      wait: 'prediction_ready',
      target: 'none',
      next: 'pred_1',
      onError: 'pred_error_1',
    },
    /** Recovery path when the async prediction fetch fails — never used
     * by the Runtime's normal `next` chain, only reached via
     * `TutorialRuntime.handlePredictionError()` while waiting on
     * `wait_prediction_ready`. Sends the Player back to Party selection
     * rather than leaving the Tutorial stuck forever. `TavernScene` also
     * resets `DecisionPanel`'s own fetch cache at the same time (see
     * `handleTutorialPredictionError`), so re-selecting even the very
     * same Party here genuinely re-requests a prediction. */
    pred_error_1: {
      type: 'message',
      id: 'pred_error_1',
      speaker: SPEAKER,
      text: 'うーん、予測がうまく取得できませんでした。もう一度パーティーを選び直してみてください',
      next: 'wait_party_selected',
    },
    pred_1: {
      type: 'message',
      id: 'pred_1',
      speaker: SPEAKER,
      text: 'さて、どうでしょう？',
      next: 'pred_2',
    },
    pred_2: {
      type: 'message',
      id: 'pred_2',
      speaker: SPEAKER,
      text: '推定依頼達成率、というのが出てきましたね？',
      next: 'pred_3',
    },
    pred_3: {
      type: 'message',
      id: 'pred_3',
      speaker: SPEAKER,
      text: 'これは私が神の使いパワーで、このパーティーがこの依頼を達成できそうな確率をお調べしたものです！',
      next: 'pred_4',
    },
    pred_4: {
      type: 'message',
      id: 'pred_4',
      speaker: SPEAKER,
      text: '名前の通り、高いほど依頼を達成しやすいということです',
      next: 'pred_5',
    },
    pred_5: {
      type: 'message',
      id: 'pred_5',
      speaker: SPEAKER,
      text: 'もちろん確率なので、高くても失敗することはありますし、低くても上手くいくことはありますが……',
      next: 'pred_6',
    },
    pred_6: {
      type: 'message',
      id: 'pred_6',
      speaker: SPEAKER,
      text: 'まあ、その時は神の思し召しということで。受け入れましょう',
      next: 'pred_7',
    },
    pred_7: {
      type: 'message',
      id: 'pred_7',
      speaker: SPEAKER,
      text: '依頼やパーティーを選び直せば、この数字も変わります',
      next: 'pred_8',
    },
    pred_8: {
      type: 'message',
      id: 'pred_8',
      speaker: SPEAKER,
      text: '誰に何を任せるか。店主さんの腕の見せどころですね！',
      next: 'pred_9',
    },
    pred_9: {
      type: 'message',
      id: 'pred_9',
      speaker: SPEAKER,
      text: 'さて、それでは依頼してみましょうか',
      next: 'pred_10',
    },
    pred_10: {
      type: 'message',
      id: 'pred_10',
      speaker: SPEAKER,
      text: '中央にある『この依頼を紹介する』を押してみてください！',
      next: 'pred_11',
    },
    pred_11: {
      type: 'message',
      id: 'pred_11',
      speaker: SPEAKER,
      text: 'なーに、当たって砕けろですよ！',
      next: 'wait_request_offered',
    },
    wait_request_offered: {
      type: 'wait_for_action',
      id: 'wait_request_offered',
      wait: 'request_offered',
      target: 'assign_button',
      branches: { accepted: 'accepted_1', declined: 'declined_1' },
    },
    accepted_1: {
      type: 'message',
      id: 'accepted_1',
      speaker: SPEAKER,
      text: 'やりましたね！　依頼を受諾していただけましたよ！',
      next: 'common_1',
    },
    declined_1: {
      type: 'message',
      id: 'declined_1',
      speaker: SPEAKER,
      text: 'ありゃりゃ。断られちゃいましたね……',
      next: 'common_1',
    },
    common_1: {
      type: 'message',
      id: 'common_1',
      speaker: SPEAKER,
      text: 'ちなみに、ランクが違ったり、慎重なパーティーだったりすると断られることもあります',
      next: 'common_2',
    },
    common_2: {
      type: 'message',
      id: 'common_2',
      speaker: SPEAKER,
      text: '推定依頼達成率が高くても、依頼そのものを断られることはあります',
      next: 'common_3',
    },
    common_3: {
      type: 'message',
      id: 'common_3',
      speaker: SPEAKER,
      text: '推定依頼達成率と、引き受けてもらえるかどうかは別の話なんですね',
      next: 'common_4',
    },
    common_4: {
      type: 'message',
      id: 'common_4',
      speaker: SPEAKER,
      text: '逆に、パーティーと親しくなれば、少し難しい依頼でも受諾してくれるケースがありますよ',
      next: 'recover_1',
    },
    recover_1: {
      type: 'message',
      id: 'recover_1',
      speaker: SPEAKER,
      text: 'それから、パーティーは魔物と戦ったりすると、傷を癒すため『療養中』という状態になっていることもあります',
      next: 'recover_2',
    },
    /** No static `next` — `TutorialRuntime.advanceMessage()` special-cases
     * this exact step id: it reads the authoritative Campaign
     * (`currentDay.offers`), and branches to `wrap_1` once at least one
     * Request has actually been accepted today, or to `retry_intro_1`
     * otherwise. The Tutorial never tracks an accepted count itself. */
    recover_2: {
      type: 'message',
      id: 'recover_2',
      speaker: SPEAKER,
      text: '療養中のパーティーにはお仕事をお願いできないので、注意してくださいね',
    },
    wrap_1: {
      type: 'message',
      id: 'wrap_1',
      speaker: SPEAKER,
      text: '基本はこれだけです！',
      next: 'wrap_2',
    },
    wrap_2: {
      type: 'message',
      id: 'wrap_2',
      speaker: SPEAKER,
      text: '依頼を見て、任せるパーティーを考えて、紹介する',
      next: 'wrap_3',
    },
    wrap_3: {
      type: 'message',
      id: 'wrap_3',
      speaker: SPEAKER,
      text: 'それでは、他の依頼も店主さんの判断で色々試してみてください！',
      next: 'wrap_4',
    },
    wrap_4: {
      type: 'message',
      id: 'wrap_4',
      speaker: SPEAKER,
      text: 'ちなみに、全部の依頼を受ける必要はありませんからね！',
      next: 'wrap_5',
    },
    wrap_5: {
      type: 'message',
      id: 'wrap_5',
      speaker: SPEAKER,
      text: '無理そうなら見送るのも、立派な店主さんのお仕事です！',
      next: 'wrap_6',
    },
    wrap_6: {
      type: 'message',
      id: 'wrap_6',
      speaker: SPEAKER,
      text: 'それで、今日お願いする依頼の振り分けが終わったら――',
      next: 'wrap_7',
    },
    wrap_7: {
      type: 'message',
      id: 'wrap_7',
      speaker: SPEAKER,
      text: '画面上にある『翌日へ』ボタンを押してみてください',
      next: 'wrap_8',
    },
    wrap_8: {
      type: 'message',
      id: 'wrap_8',
      speaker: SPEAKER,
      text: 'あとは冒険者さんたちにお任せです！',
      next: 'wrap_9',
    },
    wrap_9: {
      type: 'message',
      id: 'wrap_9',
      speaker: SPEAKER,
      text: '翌日になれば、お願いした依頼がどうなったのか確認できますよ！',
      next: 'wrap_10',
    },
    wrap_10: {
      type: 'message',
      id: 'wrap_10',
      speaker: SPEAKER,
      text: '冒険者さんたちがどうなったのか、結果を見に行きましょう！',
      next: 'wait_day_advanced',
    },
    /** The Tutorial's final wait — matching `dispatch({type:'day_advanced'})`
     * completes `basic_request_assignment` (see `completeActiveTutorial`
     * in the Runtime). Reaching this step requires at least one accepted
     * Request today (enforced by `recover_2`'s branch above), so
     * `next_day_button` is never unlocked as a Tutorial target before
     * that. Day Results' own explanation is Phase 10.2's responsibility —
     * this Tutorial's job ends the moment the day actually advances. */
    wait_day_advanced: {
      type: 'wait_for_action',
      id: 'wait_day_advanced',
      wait: 'day_advanced',
      target: 'next_day_button',
    },
    /** Reached only when the first offer of the day was declined and
     * `recover_2` found zero accepted Requests yet — invites the Player
     * to try a different Quest/Party combination rather than leaving the
     * Tutorial stuck on a single declined offer. */
    retry_intro_1: {
      type: 'message',
      id: 'retry_intro_1',
      speaker: SPEAKER,
      text: 'とはいえ、このまま誰にもお仕事をお願いしないまま終わるのも、ちょっと寂しいですね',
      next: 'retry_intro_2',
    },
    retry_intro_2: {
      type: 'message',
      id: 'retry_intro_2',
      speaker: SPEAKER,
      text: 'せっかくなので、もうひとつ別の組み合わせも試してみましょう！',
      next: 'retry_intro_3',
    },
    retry_intro_3: {
      type: 'message',
      id: 'retry_intro_3',
      speaker: SPEAKER,
      text: '今度は引き受けてくれそうな依頼とパーティーを選んでみてください',
      next: 'wait_quest_selected_retry',
    },
    wait_quest_selected_retry: {
      type: 'wait_for_action',
      id: 'wait_quest_selected_retry',
      wait: 'quest_selected',
      target: 'quest_list',
      next: 'retry_post_quest_1',
    },
    /** Short-form retry messaging (item 8 of the review) — the full
     * "what is a request/read the details" explanation from `post_quest_1`
     * onward already played once and is never repeated. */
    retry_post_quest_1: {
      type: 'message',
      id: 'retry_post_quest_1',
      speaker: SPEAKER,
      text: 'では、この依頼でいってみましょう！',
      next: 'retry_post_quest_2',
    },
    retry_post_quest_2: {
      type: 'message',
      id: 'retry_post_quest_2',
      speaker: SPEAKER,
      text: '次はお願いするパーティーを選んでみてください',
      next: 'wait_party_selected_retry',
    },
    wait_party_selected_retry: {
      type: 'wait_for_action',
      id: 'wait_party_selected_retry',
      wait: 'party_selected',
      target: 'party_list',
      next: 'wait_prediction_ready_retry',
    },
    wait_prediction_ready_retry: {
      type: 'wait_for_action',
      id: 'wait_prediction_ready_retry',
      wait: 'prediction_ready',
      target: 'none',
      next: 'retry_pred_1',
      onError: 'retry_pred_error_1',
    },
    retry_pred_error_1: {
      type: 'message',
      id: 'retry_pred_error_1',
      speaker: SPEAKER,
      text: 'うーん、予測がうまく取得できませんでした。もう一度パーティーを選び直してみてください',
      next: 'wait_party_selected_retry',
    },
    retry_pred_1: {
      type: 'message',
      id: 'retry_pred_1',
      speaker: SPEAKER,
      text: '推定依頼達成率も確認しておきましょう',
      next: 'retry_pred_2',
    },
    retry_pred_2: {
      type: 'message',
      id: 'retry_pred_2',
      speaker: SPEAKER,
      text: 'よさそうなら、『この依頼を紹介する』を押してみてください！',
      next: 'wait_request_offered_retry',
    },
    wait_request_offered_retry: {
      type: 'wait_for_action',
      id: 'wait_request_offered_retry',
      wait: 'request_offered',
      target: 'assign_button',
      branches: { accepted: 'retry_accepted_1', declined: 'retry_declined_1' },
    },
    /** Accepted on retry — skips straight to the day-advance chain rather
     * than replaying the acceptance/療養中 explanation a second time. */
    retry_accepted_1: {
      type: 'message',
      id: 'retry_accepted_1',
      speaker: SPEAKER,
      text: 'やりましたね！　依頼を受諾していただけましたよ！',
      next: 'wrap_1',
    },
    retry_declined_1: {
      type: 'message',
      id: 'retry_declined_1',
      speaker: SPEAKER,
      text: 'うーん、また断られちゃいましたね……',
      next: 'retry_declined_2',
    },
    retry_declined_2: {
      type: 'message',
      id: 'retry_declined_2',
      speaker: SPEAKER,
      text: 'では、別の組み合わせを試してみましょう！',
      next: 'wait_quest_selected_retry',
    },
  },
}
