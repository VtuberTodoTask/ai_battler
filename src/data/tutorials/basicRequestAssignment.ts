import type { TutorialScript } from '../../ui/canvas/tutorial/types.ts'

/**
 * Phase 10.1 `basic_request_assignment` Tutorial — hand-authored, non-AI
 * script for the 妖精 ("神の使い" fairy from the Opening). Covers exactly
 * one flow: look at a request -> pick a Party -> read the predicted
 * success rate -> offer the request -> see it accepted or declined.
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
      text: 'まずは一番大事な、お仕事の仲介からやってみましょう！',
      next: 'intro_3',
    },
    intro_3: {
      type: 'message',
      id: 'intro_3',
      speaker: SPEAKER,
      text: '酒場には、冒険者に頼みたいお仕事――依頼がいくつも届きます',
      next: 'intro_4',
    },
    intro_4: {
      type: 'message',
      id: 'intro_4',
      speaker: SPEAKER,
      text: 'それを、ふさわしいパーティーに紹介するのが店主さんの仕事です',
      next: 'intro_5',
    },
    intro_5: {
      type: 'message',
      id: 'intro_5',
      speaker: SPEAKER,
      text: '依頼の中身と、パーティーの得意なことをよく見比べてくださいね',
      next: 'intro_6',
    },
    intro_6: {
      type: 'message',
      id: 'intro_6',
      speaker: SPEAKER,
      text: 'なに、難しく考えなくて大丈夫です。一緒にやってみましょう！',
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
      text: 'いいですね、その依頼を選びましたか',
      next: 'post_quest_2',
    },
    post_quest_2: {
      type: 'message',
      id: 'post_quest_2',
      speaker: SPEAKER,
      text: '依頼の内容や条件は、画面の中央に詳しく出ていますよ',
      next: 'post_quest_3',
    },
    post_quest_3: {
      type: 'message',
      id: 'post_quest_3',
      speaker: SPEAKER,
      text: 'よく読んで、どんなパーティーが向いていそうか考えてみてください',
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
      next: 'pred_intro_1',
    },
    /** Recovery path when the async prediction fetch fails — never used
     * by the Runtime's normal `next` chain, only reached via
     * `TutorialRuntime.handlePredictionError()` while waiting on
     * `wait_prediction_ready`. Sends the Player back to Party selection
     * rather than leaving the Tutorial stuck forever. */
    pred_error_1: {
      type: 'message',
      id: 'pred_error_1',
      speaker: SPEAKER,
      text: 'うーん、予測がうまく取得できませんでした。もう一度パーティーを選び直してみてください',
      next: 'wait_party_selected',
    },
    pred_intro_1: {
      type: 'message',
      id: 'pred_intro_1',
      speaker: SPEAKER,
      text: 'おお、もう予測が出ていますね',
      next: 'pred_intro_2',
    },
    pred_intro_2: {
      type: 'message',
      id: 'pred_intro_2',
      speaker: SPEAKER,
      text: 'これは、このパーティーがこの依頼にどれくらい成功しそうか、酒場が計算した目安です',
      next: 'pred_intro_3',
    },
    pred_intro_3: {
      type: 'message',
      id: 'pred_intro_3',
      speaker: SPEAKER,
      text: '詳しく見てみましょう',
      next: 'pred_explain_1',
    },
    pred_explain_1: {
      type: 'message',
      id: 'pred_explain_1',
      speaker: SPEAKER,
      text: '右側に『推定依頼達成率』というパーセンテージが出ていますね',
      next: 'pred_explain_2',
    },
    pred_explain_2: {
      type: 'message',
      id: 'pred_explain_2',
      speaker: SPEAKER,
      text: 'これが高いほど、依頼をうまくこなせる可能性が高いということです',
      next: 'pred_explain_3',
    },
    pred_explain_3: {
      type: 'message',
      id: 'pred_explain_3',
      speaker: SPEAKER,
      text: 'もちろん絶対ではありません。低くても成功することはありますし、高くても油断は禁物です',
      next: 'pred_explain_4',
    },
    pred_explain_4: {
      type: 'message',
      id: 'pred_explain_4',
      speaker: SPEAKER,
      text: 'あくまで目安として、パーティーを送り出すかどうかの参考にしてください',
      next: 'pred_explain_5',
    },
    pred_explain_5: {
      type: 'message',
      id: 'pred_explain_5',
      speaker: SPEAKER,
      text: '気になるなら、内訳を開いて詳しく確認することもできますよ',
      next: 'pred_explain_6',
    },
    pred_explain_6: {
      type: 'message',
      id: 'pred_explain_6',
      speaker: SPEAKER,
      text: 'さあ、決まりましたか？　それなら、中央にある『この依頼を紹介する』を押してみてください！',
      next: 'pred_explain_7',
    },
    pred_explain_7: {
      type: 'message',
      id: 'pred_explain_7',
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
      text: 'やりましたね！',
      next: 'common_1',
    },
    declined_1: {
      type: 'message',
      id: 'declined_1',
      speaker: SPEAKER,
      text: 'あちゃー、断られてしまいましたね',
      next: 'common_1',
    },
    common_1: {
      type: 'message',
      id: 'common_1',
      speaker: SPEAKER,
      text: '依頼を受けるかどうかは、パーティーの側にも意思があります',
      next: 'common_2',
    },
    common_2: {
      type: 'message',
      id: 'common_2',
      speaker: SPEAKER,
      text: '達成率が高くても、リスクや実入りに納得できなければ断られることもあります',
      next: 'common_3',
    },
    common_3: {
      type: 'message',
      id: 'common_3',
      speaker: SPEAKER,
      text: '逆に、達成率が低くても引き受けてくれることもありますよ',
      next: 'common_4',
    },
    common_4: {
      type: 'message',
      id: 'common_4',
      speaker: SPEAKER,
      text: '数字だけがすべてではない、というのも覚えておいてくださいね',
      next: 'recover_1',
    },
    recover_1: {
      type: 'message',
      id: 'recover_1',
      speaker: SPEAKER,
      text: 'それと、依頼を終えたパーティーはしばらく休養が必要になることもあります',
      next: 'recover_2',
    },
    recover_2: {
      type: 'message',
      id: 'recover_2',
      speaker: SPEAKER,
      text: '休養中のパーティーには新しい依頼を任せられないので、そこも覚えておいてください',
      next: 'wrap_1',
    },
    wrap_1: {
      type: 'message',
      id: 'wrap_1',
      speaker: SPEAKER,
      text: 'これで、お仕事の仲介の基本はひと通りです',
      next: 'wrap_2',
    },
    wrap_2: {
      type: 'message',
      id: 'wrap_2',
      speaker: SPEAKER,
      text: '依頼を見て、パーティーを選んで、達成率を確認して、紹介する。それだけです',
      next: 'wrap_3',
    },
    wrap_3: {
      type: 'message',
      id: 'wrap_3',
      speaker: SPEAKER,
      text: 'あとは、これを繰り返しながら、少しずつ酒場を大きくしていきましょう',
      next: 'wrap_4',
    },
    wrap_4: {
      type: 'message',
      id: 'wrap_4',
      speaker: SPEAKER,
      text: '無理そうな依頼を無理に紹介する必要はありません',
      next: 'wrap_5',
    },
    wrap_5: {
      type: 'message',
      id: 'wrap_5',
      speaker: SPEAKER,
      text: '無理そうなら見送るのも、立派な店主さんのお仕事です！',
    },
  },
}
