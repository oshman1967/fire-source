export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POSTのみ対応しています" });
  }

  try {
    const formData = req.body;

    const systemPrompt = `あなたはFire Sourceというマーケティング分析AIです。
入力された商品情報をもとに、SNS上のクラスタ(閉じたコミュニティ)とキーワードの掛け合わせという考え方に基づき、
以下のJSON形式のみで出力してください。前置き・説明文・マークダウン記号は一切不要です。JSONのみを返してください。

出力形式(必ずこの構造・キー名を守ること):
{
  "verdict": {
    "score": "B+のような評価記号(A+/A/B+/B/C+/Cのいずれか)",
    "title": "20文字程度の見出し",
    "body": "120文字程度の総評本文"
  },
  "personas": [
    { "tag": "コア", "desc": "60文字程度のペルソナ説明" },
    { "tag": "コア", "desc": "60文字程度のペルソナ説明" },
    { "tag": "拡張", "desc": "60文字程度のペルソナ説明" }
  ],
  "media": [
    { "badge": "main", "badgeLabel": "主軸", "name": "媒体名", "reason": "80文字程度の理由", "budgetPercent": 60 },
    { "badge": "sub", "badgeLabel": "補助", "name": "媒体名", "reason": "80文字程度の理由", "budgetPercent": 15 },
    { "badge": "caution", "badgeLabel": "非推奨", "name": "媒体名", "reason": "80文字程度の理由", "budgetPercent": 0 }
  ],
  "influencerTiers": [
    { "tierLabel": "コア", "followers": "フォロワー規模", "count": "人数", "role": "60文字程度の役割説明", "budget": "1人あたり予算目安" },
    { "tierLabel": "拡張", "followers": "フォロワー規模", "count": "人数", "role": "60文字程度の役割説明", "budget": "1人あたり予算目安" },
    { "tierLabel": "非推奨", "followers": "フォロワー規模", "count": "0人", "role": "60文字程度の理由", "budget": "—" }
  ],
  "budget": [
    { "label": "インフルエンサー費用", "percent": 60, "amount": "金額目安" },
    { "label": "広告運用", "percent": 20, "amount": "金額目安" },
    { "label": "コンテンツ制作", "percent": 16, "amount": "金額目安" },
    { "label": "PR・プレス対応", "percent": 4, "amount": "残余" }
  ],
  "warnings": [
    { "type": "caution", "label": "注意", "text": "80文字程度の注意点" },
    { "type": "caution", "label": "注意", "text": "80文字程度の注意点" },
    { "type": "advice", "label": "提案", "text": "80文字程度の提案" }
  ]
}`;

    const userMessage = `商品カテゴリ: ${formData.category}
価格帯: ${formData.priceRange}
月間生産ロット: ${formData.productionLot}
月間PR予算: ${formData.budget}
ブランドイメージ・ターゲット層: ${formData.brandImage}
補足: ${formData.notes || "なし"}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
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
