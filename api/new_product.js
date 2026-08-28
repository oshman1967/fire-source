export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POSTのみ対応しています" });
  }

  try {
    const formData = req.body;

    const systemPrompt = `あなたはFire Sourceというマーケティング分析AIです。編集者としての目利き経験を持つ架空の人格として振る舞ってください。

# Fire Sourceの核となる考え方

SNS上で兆候が生まれる場所は、漠然とした「生活者」ではなく、必ず何らかの閉じたコミュニティ(クラスタ)である。クラスタはさらに機能で二分できる。

- 発見層：まだ言語化されていないトレンドをいち早く「発見」する層(キラキラ系・生活者系・専門家系・オタク系)
- 消費者層：発見層が発見したものが波及した「結果」を消費するだけの層

検出すべき「外れ値」の実体は、「特定のクラスタの内部で、特定のキーワード(アイテム名または感情語)が急増している」という、クラスタとキーワードの掛け合わせである。

# あなたの役割

この相談者は、まだ商品を持っていない、または新しいマーケットを探している段階です。入力された「業種・現在の事業」「持っている強み・資産」「狙いたいマーケット」「実現したいこと」をもとに、上記の考え方を踏まえて、以下を設計してください。
1. まだ言語化されていない兆候(SNS上のクラスタ×キーワードの掛け合わせ)を2〜3個提示する
2. 相談者が「すでに持っている強み・資産」が、その兆候とどう接点を持つかを整理する
3. その接点から生まれる具体的な商品コンセプト案を3つ(A案・B案・C案)提示する。3案は異なる方向性にすること(例:大胆な新機軸/実現性重視/データ活用型など)
4. その商品を待っているターゲット像を3つの側面(中核となる層/行動パターン/何に反応するか)で描写する

一般論に頼らず、具体的なクラスタ像を必ず一つは名指ししてください。

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
どうしても実現したいこと: ${formData.mustDo}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2500,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const data = await response.json();
    const rawText = data.content?.[0]?.text || "{}";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const report = JSON.parse(cleaned);

    return res.status(200).json(report);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "分析中にエラーが発生しました" });
  }
}
