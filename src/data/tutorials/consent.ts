const SPEAKER = '妖精'

/**
 * The one-time Tutorial Consent question, shown only while
 * `campaign.tutorial.mode === 'pending'`. Not itself a `TutorialId` / a
 * `TutorialScript` — it is a separate, single-use flow that decides
 * whether Tutorials run at all, and lives outside the per-Tutorial script
 * graphs for that reason (see `tutorialRuntime.ts`).
 */
export const TUTORIAL_CONSENT_QUESTION = {
  speaker: SPEAKER,
  text: 'では店主さん……どうしましょう。お仕事など諸々のレクチャー、必要ですか？',
  choices: [
    { id: 'yes', label: 'はい' },
    { id: 'no', label: 'いいえ' },
  ],
}

/** Shown after "いいえ" — mode commits to `disabled` first, then these
 * three lines play before the Overlay closes for good. */
export const TUTORIAL_CONSENT_DECLINE_LINES: string[] = [
  'おお、自信ありですね！',
  'では私は邪魔しないようにしておきます！',
  '何をどうするかは店主さんにお任せしますね。頑張ってください！',
]
