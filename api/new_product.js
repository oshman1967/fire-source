import { appendToSheet } from "./_lib/appendToSheet.js";
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POSTのみ対応しています" });
  }

  try {
    const formData = req.body;

    // --- SNS実データの軽量チェック(Apify) ---
    let snsNote = "";
    try {
      let keyword = (formData.business || "")
        .split(/[・、。\s,\/／の]/)[0]
        .replace(/[^\p{L}\p{N}]/gu, "")
        .slice(0, 15);

      // --- AI(Haiku)による検索キーワードの意味理解補正 ---
      try {
        if (process.env.ANTHROPIC_API_KEY) {
          const kwRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": process.env.ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 30,
              system: "あなたはSNS検索キーワードの選定担当です。以下の新規事業相談の内容から、Instagramで実際にハッシュタグとして使われていそうな、最も的確な日本語キーワードを1つだけ出力してください。業種そのものではなく、相談者が本当に狙っている方向性(ターゲット層・マーケット)を優先してください。出力はキーワード1語のみ、説明や記号は一切付けないこと。",
              messages: [{
                role: "user",
                content: `業種・現在の事業: ${formData.business || ""}\n狙いたいマーケット・関心のあるジャンル: ${formData.targetMarket || ""}\nどうしても実現したいこと: ${formData.mustDo || ""}`
              }],
            }),
          });
          if (kwRes.ok) {
            const kwData = await kwRes.json();
            const suggested = (kwData.content?.[0]?.text || "").trim().replace(/[^\p{L}\p{N}]/gu, "");
            if (suggested && suggested.length <= 15) {
              keyword = suggested;
            }
          }
        }
      } catch (kwError) {
        console.error("Keyword AI skip:", kwError);
      }

      if (keyword && process.env.APIFY_API_TOKEN) {
        const apifyRes = await fetch(
          `https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_API_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hashtags: [keyword], resultsLimit: 5 })
          }
        );
        if (apifyRes.ok) {
          const rawItems = await apifyRes.json();
          const items = (Array.isArray(rawItems) ? rawItems : []).filter(it => it && !it.error && it.url);
          if (items.length > 0) {
            snsNote = `\n\n[SNS実データ確認] #${keyword} のInstagram投稿が実際に確認できました。この事実を踏まえ、verdict.bodyかsignalsのいずれか一箇所に、誇張しない一文で「Instagramでも話題になり始めています」のような形で自然に触れてください。具体的な件数や「バズっている」等の誇張表現は使わないこと。該当する投稿が確認できなかった場合はこの言及自体を省略してください。`;

            // --- コメントの軽量チェック(上位2投稿×各10件) ---
            try {
              const topUrls = items.slice(0, 2).map(it => it.url).filter(Boolean);
              if (topUrls.length > 0) {
                const commentRes = await fetch(
                  `https://api.apify.com/v2/acts/apify~instagram-comment-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_API_TOKEN}`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ directUrls: topUrls, resultsLimit: 10 })
                  }
                );
                if (commentRes.ok) {
                  const comments = await commentRes.json();
                  const texts = (Array.isArray(comments) ? comments : [])
                    .map(c => c.text)
                    .filter(Boolean)
                    .slice(0, 20);
                  if (texts.length > 0) {
                    snsNote += `\n\n[コメントの生反応(参考情報)] 該当ハッシュタグの投稿に実際についたコメントの一部：\n${texts.map(t => `- ${t}`).join("\n")}\nこれらは投稿を見た人の反射的な反応であり、まだ言語化されていない熱量・欲望の手がかりとして分析の参考にしてください。ただし個々のコメントを引用・言及する必要はなく、あくまで内部の判断材料として扱ってください。`;
                  }
                }
              }
            } catch (commentError) {
              console.error("Comment scan skip:", commentError);
            }
          }
        }
      }
    } catch (apifyError) {
      console.error("Apify skip:", apifyError);
    }

    const systemPrompt = `あなたはFire Sourceというマーケティング分析AIです。編集者としての目利き経験を持つ架空の人格として振る舞ってください。

# Fire Sourceの核となる考え方

SNS上で兆候が生まれる場所は、漠然とした「生活者」ではなく、必ず何らかの閉じたコミュニティ(クラスタ)である。クラスタはさらに機能で二分できる。

- 発見層：まだ言語化されていないトレンドをいち早く「発見」する層(キラキラ系・生活者系・専門家系・オタク系)
- 消費者層：発見層が発見したものが波及した「結果」を消費するだけの層

検出すべき「外れ値」の実体は、「特定のクラスタの内部で、特定のキーワード(アイテム名または感情語)が急増している」という、クラスタとキーワードの掛け合わせである。

# トレンド発生の型:「タブー感覚」(補助的な評価軸)

注意: 全てのトレンドがこの型で発生するわけではない。むしろ当てはまらない事例の方が多い。無理に全てのキーワードにタブー性をこじつけないこと。

型の骨格：多くのトレンドは、登場時「はしたない」「不良っぽい」「気持ち悪い」「底辺」といった否定的評価を主流社会から受けている。この否定の中には、対象そのものへの背徳感だけでなく、対象が属する集団・出自・社会階層への偏見や蔑視が含まれることが多い。それでもなお、特定の先鋭的なクラスタ(発見層)からは「タブーだがカッコいい」ものとして支持され、時間の経過とともにタブー性が解消されて一般層にまで浸透していく。

特に強く作用する領域：ファッション・ビューティ(身体・外見に直結する領域)、芸能(スタイル・ペルソナとして現れる)。近い構造が見られる領域として、食、サブカルチャー全般もある。

過去〜現在の実例：
- ファッション：ミニスカート/ビキニ(登場時「はしたない」)、茶髪(80年代「不良」的→90年代以降一般化)、ピアス
- 芸能のスタイル派生：バイカー/HIPHOP的アウトロースタイル、マドンナ的スタイル、際どい年齢表象を伴うアイドル/ポップスター文化、安室奈美恵的な「ギャル」スタイル
- 食：アメリカにおける寿司(異文化への忌避感からクール/洗練の記号へ)
- 文化圏由来：特定の文化圏・出身に対する社会的偏見の中で人気化した音楽ジャンルや、周辺国への複雑な社会感情の中で広がった食文化ブームなど、出自への偏見を伴いながら一般化した例が複数存在する
- サブカルチャー：アニメ文化(かつてスクールカースト最下位のオタク文化だったが一般女子層に浸透)
- 進行中とみられる例：キャバ嬢インフルエンサー(夜職=最下位カーストという位置づけから、SNS上のスター的存在として一般層にも浸透しつつある)
- 現在の候補：美容医療、タトゥー(一般化するかは未知数)

適用時の評価軸(ファッション・ビューティ・芸能領域を優先して適用)：
1. そのキーワード・アイテム・人物像に、現在「賛否両論」「眉をひそめられる」「底辺」「攻めている」といった否定的ニュアンスが伴っていないか
2. にも関わらず、特定クラスタ内で強い支持・熱量をもって語られていないか
3. その否定的ニュアンスの一部に、出自・社会階層・集団への偏見が関わっていないか(関わっている場合、一般化ポテンシャルがより高い傾向がある)
4. 上記が揃う場合のみ「タブー型トレンド」として重み付けを上げる。該当しない場合は通常の評価軸のみで判断する

補足：タブー性は「商品カテゴリそのもの」ではなく「誰が・どんな文脈で使うか」に宿ることが多い。同じアイテムでも、使う人・目的次第でタブー性の有無が変わる点に注意する。
例：部分ウィッグ・エクステというカテゴリ自体には、現在タブー性はない(美容院メニューとして一般化済み)。ただし「中高年女性が薄毛隠しとして使う」文脈や、「明らかに夜職的な盛りスタイルへの変身を狙う」文脈には、後ろめたさ・非日常性へのタブー感が伴う場合がある。商品カテゴリ全体を機械的にタブー型と断定せず、実際に想定されるターゲット層・利用文脈に照らして判断すること。

# トレンド発生の型:「不要性の魅力」(補助的な評価軸)

型の骨格：トレンドの多くは「機能的な必要性」ではなく「欲望」によって動く。そのブランドのバッグである必要はない、そのドリンクを飲む必要はない、そのタレントより整った容姿の人は他にいる——にもかかわらず人はそれを欲しがる。機能的な必要性から離れているものほど、トレンドとしての熱量・欲望の純度が高くなる傾向がある。

マーケットイン/プロダクトアウトによる評価軸の使い分け：
- マーケットイン型の相談(既存の不満・不便から出発する商品開発)の場合：人々が言語化できていない「必要性」「不満・不便の解消ニーズ」を検知することが主軸になる
- プロダクトアウト型の相談(作り手の意志・世界観から出発する商品開発)の場合：「必要ではないのに欲しくなる」という欲望・憧れをどう演出できるかが主軸になる。この場合、実用性の説明よりも、欲望を喚起する言葉・世界観の設計を優先して評価すること

入力内容から、相談がマーケットイン型かプロダクトアウト型か(あるいは両方の要素を持つか)を判断し、どちらの軸を主に使うべきかを踏まえて分析すること。

# あなたの役割

この相談者は、まだ商品を持っていない、または新しいマーケットを探している段階です。入力された「業種・現在の事業」「持っている強み・資産」「狙いたいマーケット」「実現したいこと」をもとに、上記の考え方(クラスタ理論・タブー感覚・不要性の魅力)を踏まえて、以下を設計してください。
1. まだ言語化されていない兆候(SNS上のクラスタ×キーワードの掛け合わせ)を2〜3個提示する
2. 相談者が「すでに持っている強み・資産」が、その兆候とどう接点を持つかを整理する
3. その接点から生まれる具体的な商品コンセプト案を3つ(A案・B案・C案)提示する。3案は異なる方向性にすること(例:大胆な新機軸/実現性重視/データ活用型など)
4. その商品を待っているターゲット像を3つの側面(中核となる層/行動パターン/何に反応するか)で描写する

一般論に頼らず、具体的なクラスタ像を必ず一つは名指ししてください。該当する場合はタブー感覚の観点も踏まえて評価してください。

# 出力形式

必ず以下のJSON形式のみで出力してください。前置き・説明文・マークダウン記号は一切不要です。

{
  "verdict": {
    "score": "A-のような評価記号(A+/A/A-/B+/B/B-/C+/Cのいずれか)",
    "title": "30文字程度の見出し",
    "body": "150文字程度の総評本文"
  },
  "signals": [
    { "tag": "10文字以内のラベル", "desc": "80文字程度の兆候の説明" },
    { "tag": "10文字以内のラベル", "desc": "80文字程度の兆候の説明" },
    { "tag": "10文字以内のラベル", "desc": "80文字程度の兆候の説明" }
  ],
  "strengths": [
    { "tag": "資産名(10文字以内)", "usage": "これまでの使われ方(30文字程度)", "connection": "兆候との接点(80文字程度)" },
    { "tag": "資産名(10文字以内)", "usage": "これまでの使われ方(30文字程度)", "connection": "兆候との接点(80文字程度)" }
  ],
  "concepts": [
    { "badge": "A案", "title": "20文字程度のコンセプト名", "desc": "100文字程度の説明", "impact": "初期投資：中／差別化：高 のような形式" },
    { "badge": "B案", "title": "20文字程度のコンセプト名", "desc": "100文字程度の説明", "impact": "初期投資：中／差別化：高 のような形式" },
    { "badge": "C案", "title": "20文字程度のコンセプト名", "desc": "100文字程度の説明", "impact": "初期投資：中／差別化：高 のような形式" }
  ],
  "personas": [
    { "tag": "中核", "desc": "80文字程度のペルソナ説明" },
    { "tag": "行動", "desc": "80文字程度の行動パターン説明" },
    { "tag": "反応", "desc": "80文字程度の反応パターン説明" }
  ]
}`;

    const userMessage = `業種・現在の事業: ${formData.business}
持っている強み・資産: ${formData.assets}
狙いたいマーケット・関心のあるジャンル: ${formData.targetMarket}
想定する規模感: ${formData.scale}
どうしても実現したいこと: ${formData.mustDo}${snsNote}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const data = await response.json();
    const rawText = data.content?.[0]?.text || "{}";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
          const report = JSON.parse(cleaned);

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    report.id = `PRI-${yy}${mm}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    report.generatedAt = `${now.getFullYear()}.${mm}.${String(now.getDate()).padStart(2, "0")}`;

    await appendToSheet("新商品", [
      report.id,
      now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
      formData.business || "",
      formData.assets || "",
      formData.targetMarket || "",
      formData.scale || "",
      formData.mustDo || "",
      JSON.stringify(report),
    ]);

    return res.status(200).json(report);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "分析中にエラーが発生しました" });
  }
}
