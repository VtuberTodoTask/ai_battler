/**
 * Phase 9.10 Opening — a hand-authored, non-AI canonical script (item 3).
 * Reuses `SoundNovelScene`'s existing paragraph model: blank lines split
 * the text into pages exactly like any other Narrative text, so this is
 * plain prose, not a special format.
 *
 * Deliberately keeps the same "店主" convention the rest of the codebase
 * enforces on AI-generated Narrative (no invented name/gender/appearance
 * for the protagonist) — even though nothing here is AI-authored, breaking
 * that convention in the one hand-written script would be jarring the
 * moment Bond Conversation or Main Quest Narrative picks the thread back
 * up later in the same Campaign.
 */
export const OPENING_SCRIPT = `かつて勇者と呼ばれた者がいた。

戦いは、ある日を境に終わった。剣は鞘へ収められ、二度と抜かれることのないまま、遠い記憶になった。

戦えなくなった元勇者に何が残るのか。誰も、本人でさえ、答えを持っていなかった。

残されたのは、古い酒場の権利書と、埃をかぶったカウンターと、開かずの扉が一つ。

それから随分と時間が過ぎて、その扉に灯りが戻る。

看板を掛け直し、椅子の埃を払い、樽を運び入れる。特別なことは何もない。ただ、今日から酒場が始まるというだけの話だ。

窓の外では、旅装の一団が通りを歩いている。冒険者たちだ。彼らはこの街に来て、依頼を探し、依頼を受け、遠征へ出て、また戻ってくる。その繰り返しの中に、この酒場も加わることになる。

やがて最初の客が扉を開ける日が来る。それがどんなParty かは、まだ分からない。

酒場の主人としての、新しい日々が始まる。`
