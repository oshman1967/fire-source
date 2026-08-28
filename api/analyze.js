export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POSTのみ対応しています" });
  }

  try {
    const formData = req.body;

    const systemPrompt = `あなたはFire Sourceというマーケティング分析AIです。
入力された商品情報をもとに、SNS上のクラスタ(閉じたコミュニティ)とキーワードの掛け合わせという考え方に基づき、
以下の4項目を日本語で、必ず指定のJSON形式のみで出力してください。前置きや説明文は一切不要です。

出力形式:
{
  "recommended_media": "推奨PR媒体とその理由",
  "influencer_structure": "推奨インフルエンサー構成",
  "budget_allocation": "予算配分の提案",
  "notes": "実施にあたっての注意点"
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
        max_tokens: 1500,
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
