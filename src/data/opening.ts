/**
 * Phase 9.10 Opening — a hand-authored, non-AI canonical script.
 * Reuses `SoundNovelScene`'s existing paragraph model: blank lines split
 * the text into pages exactly like any other Narrative text, so this is
 * plain prose, not a special format.
 *
 * This is the fixed canonical Opening as of the Phase 9.10 PR #60 "Opening
 * Flow & Canonical Script" review — do not summarize, paraphrase, or
 * shorten it. It establishes: the protagonist was once a hero; Nosferatu
 * sealed their power in person, on-screen ("実験台になっていただきます");
 * the protagonist cannot fight anymore; a small fairy claiming to be a
 * messenger of the gods proposes running a tavern instead, brokering
 * requests to adventurers able to fight in the protagonist's place; and
 * the long-term goal of eventually tracking Nosferatu down again. The
 * fairy is written as the future Tutorial Guide character, without fixing
 * its name, exact nature, or which god it serves.
 *
 * The protagonist never speaks in this script — every reaction is
 * non-verbal (a glance, a tilted head, a reach for a sword, silence) —
 * and their name, gender, age, speech style, and first-person pronoun are
 * never fixed here, matching the "店主" convention the rest of the
 * codebase enforces on AI-generated Narrative.
 */
export const OPENING_SCRIPT = `かつて、あなたは勇者だった。

剣を取り、魔物を倒し、人々から助けを求められれば危険な土地へ赴く。

そんな日々が終わったのは、ノスフェラトゥと名乗る男に出会った日だった。

「ようやく会えましたね、勇者殿」

薄暗い部屋の向こうで、男は穏やかに笑っていた。

あなたが剣へ手を伸ばす。

「おお、怖い怖い。さすが勇者殿です」

その瞬間、身体を得体の知れない何かが駆け抜けた。

「あなたには、少し実験台になっていただきます」

力が抜ける。

剣を握る指が動かない。

足に力が入らない。

身体の奥にあった何かが、ひとつずつ閉ざされていく感覚。

「心配はいりません。命まで奪うつもりはありませんよ」

ノスフェラトゥは倒れたあなたを見下ろした。

「ただ――その力なしで、あなたがどこまで生きられるのか。それを見てみたいだけです」

そこで、意識は途切れた。

次に目を覚ました時には、ノスフェラトゥの姿はなかった。

確かに命は残っていた。だが、勇者としての力は残っていなかった。

剣を振ることはできる。歩くこともできる。

それでも、以前のように魔物と戦える身体ではない。

勇者として生きてきたあなたは、何をすればいいのか分からなくなった。

それからしばらく。

目的もなく日々を過ごしていた、ある日のこと。

「見つけましたー！」

突然、頭上から声が降ってきた。

見上げると、手のひらほどの小さな妖精が宙に浮かんでいる。

あなたは怪訝そうに妖精を見た。

「私は神の使いですよ！ なんですかその目は！」

妖精は自信満々に胸を張った。

どう見ても怪しい。

「まあまあ。疑うのは後にしてください」

妖精はあなたの周りをくるりと飛ぶ。

「事情は聞いてます。力を封印されちゃったんですよね？」

返事をしないあなたを見て、妖精は続けた。

「だったら、自分で戦うのはやめましょう！」

あまりにも簡単に言われた。

「戦えないなら、戦える人にお願いすればいいんです」

あなたは首をかしげた。

「つまりですね、冒険者の酒場を経営するのです！」

さらに頭をかしげる。

「冒険者が集まる酒場です！ 仕事を頼みたい人から依頼を預かって、それに向いていそうな冒険者さんへ紹介するんです！ ……あなた、元勇者なんでしょう？ だったら、どんな仕事が危険なのか。誰なら任せられそうなのか。そのくらいは分かるはずです」

自分自身が戦うことはできない。

だが。

戦える者を見つけることならできる。

誰に仕事を任せるべきか、考えることもできる。

「それに」

妖精が少しだけ声を落とした。

「いつか、あなたの力を封じた相手を追うつもりなら――ひとりじゃ無理です」

ノスフェラトゥ。

あの男が何を目的としていたのかは分からない。

封じられた力を取り戻せるのかも分からない。

「だから今は、信頼できる冒険者さんたちを見つけましょう。……何度も仕事を任せて、一緒にやっていける人を増やすんです」

妖精はそう言って、あなたの前にある一軒の建物を指さした。

小さな酒場だった。

豪華ではない。

客の姿も、まだほとんどない。

まるで神が用意したように偶然に、そこに使われていない酒場があった。

「さあ、店主さん！ やりましょう！」

妖精が酒場の扉へ向かって飛んでいく。

「賽は投げられました！ 大丈夫、お仕事のやり方は、私がちゃんと教えてあげますから！」

こうして。

勇者としての戦いを失ったあなたの――

酒場の主人としての、新しい日々が始まった。`
