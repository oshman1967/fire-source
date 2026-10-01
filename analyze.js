import { appendToSheet } from "./_lib/appendToSheet.js";
import { put } from "@vercel/blob";
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POSTのみ対応しています" });
  }

  try {
    const formData = req.body;

    // --- SNS実データの軽量チェック(Apify) ---
    let snsNote = "";
    let haikuKeyword = ""; // ★Haikuが選んだキーワード(シート記録用)
    try {
        let keyword = (formData.category || "")
        .split(/[・、。\s,\/／]/)[0]
        .replace(/[^\p{L}\p{N}]/gu, "")
        .slice(0, 15);

      // --- AI(Haiku)による検索キーワードの意味理解補正(候補3語) ---
      try {
        if (process.env.ANTHROPIC_API_KEY) {
         const kwRes = await fetch("https://api.anthropic.com/v1/messages", {
            signal: AbortSignal.timeout(5000),
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": process.env.ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 40,
              system: "あなたはSNS検索キーワードの選定担当です。以下の商品相談内容から、Instagramで実際にハッシュタグとして使われていそうな、最も的確な日本語キーワードを、有望だと思う順に3つ出力してください。商品カテゴリそのものではなく、相談者が本当に狙っている方向性(ターゲット層・訴求軸)を優先してください。出力はキーワード3つのみ、カンマ区切りで、説明や記号は一切付けないこと。例:艶感,韓国コスメ,発色",
              messages: [{
                role: "user",
                content: `商品カテゴリ: ${formData.category || ""}\nターゲット層: ${formData.targetLayer || ""}\nブランドイメージ: ${formData.brandImage || ""}\n悩み・変えたいこと: ${formData.notes || ""}`
              }],
            }),
          });
          if (kwRes.ok) {
            const kwData = await kwRes.json();
            const rawSuggestion = (kwData.content?.[0]?.text || "").trim();
            const candidates = rawSuggestion
              .split(/[,、]/)
              .map(s => s.trim().replace(/[^\p{L}\p{N}]/gu, ""))
              .filter(s => s && s.length <= 15)
              .slice(0, 3);
            if (candidates.length > 0) {
              keyword = candidates[0];
              haikuKeyword = candidates.join(", ");
            }
          }
        }
      } catch (kwError) {
        console.error("Keyword AI skip:", kwError);
      }

      if (!haikuKeyword) haikuKeyword = keyword;
      if (keyword && process.env.APIFY_API_TOKEN) {
       const apifyRes = await fetch(
          `https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_API_TOKEN}`,
          {
            signal: AbortSignal.timeout(8000),
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hashtags: [keyword], resultsLimit: 5 })
          }
        );
               if (apifyRes.ok) {
          const rawItems = await apifyRes.json();
          const items = (Array.isArray(rawItems) ? rawItems : []).filter(it => it && !it.error && it.url);
          if (items.length > 0) {
            snsNote = `\n\n[SNS実データ確認] #${keyword} のInstagram投稿が実際に確認できました。この事実を踏まえ、verdict.bodyかwarningsのいずれか一箇所に、誇張しない一文で「Instagramでも話題になり始めています」のような形で自然に触れてください。具体的な件数や「バズっている」等の誇張表現は使わないこと。該当する投稿が確認できなかった場合はこの言及自体を省略してください。`;

            // --- コメントの軽量チェック(上位2投稿×各10件) ---
            try {
              const topUrls = items.slice(0, 2).map(it => it.url).filter(Boolean);
              if (topUrls.length > 0) {
               const commentRes = await fetch(
                  `https://api.apify.com/v2/acts/apify~instagram-comment-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_API_TOKEN}`,
                  {
                    signal: AbortSignal.timeout(8000),
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

- 発見層：まだ言語化されていないトレンドをいち早く「発見」する層。以下の4類型がある。
  - キラキラ系：カースト上位女子大生、都内私立一貫女子校、港区女子等
  - 生活者系：地域の主婦・ママコミュニティ
  - 専門家系：美容師など業界内のプロ
  - オタク系：趣味・推し活に限らず、政治・投資・特定ジャンルへの強い関心など、関心事全般で集まるコミュニティ
- 消費者層：発見層が発見したものが波及した「結果」を消費するだけの層。

大切なのは発見層であり、消費者層は結果でしかない。また、発見力は領域によって変わる。同じクラスタでも、あるテーマでは単なる消費者層だが、別のテーマでは発見層になる、という逆転が起こり得る(例：夜職女性はラグジュアリーブランドに関しては消費者層だが、美容医療領域では医師・美容家と並ぶ発見層になる)。

クラスタには、地域・国籍という軸も掛け合わせられる(例：インバウンド観光客、アジア圏在住者)。この軸は上記4類型と独立しており、「台湾人のキラキラ系」のように組み合わせて使ってよい。

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

# 非物理財・人的リソース型の相談における注意

入力内容が、タレント・インフルエンサー・講師・塾のコマ数・予約枠・施術枠など、物理的な製造物ではなく人的稼働やサービス提供の「枠」を伴う相談だと判断した場合、金額・ロットをそのまま製造業の商品スペックとして扱い、「月産◯個・◯円」のような言い回しでレポートに書かないこと。該当する場合は、稼働数・出演本数・ギャランティ・コマ数・予約枠数など、その業態に即した言葉に置き換えて言及すること。判断に迷う場合は、金額・ロットという数値そのものへの言及を避け、規模感の話に留めること。

# Fire Source(火種・燃える場所・燃料)という考え方

流行・ヒット・人気に必要なのは、次の3要素である。

1. **火種**：商品・企画そのものの独自性。次のいずれでもよい。
   - 新しい商品・企画をゼロから考える
   - 既存の商品を、新しい角度で語り直す(例：長年のブランドの「格式」を再発見し、新しい体験として編集し直す)
   - 顧客が来店・購入しない理由(障害)を取り除く(例：量が多すぎて頼みにくい、清潔感に欠ける、価格帯が分かりにくい)
   火種は、必ずしも真新しい商品開発である必要はなく、既存の商品・サービスをどう磨き直すか、という視点も含む。
2. **燃える場所**：どのクラスタ(発見層)に、最初に火をつけるか。
3. **燃料**：どう広め、燃え広がらせるか。インフルエンサー・PR・広告・イベント等の施策。

「インフルエンサー」は、Instagram等のSNSクリエイターに限らない。YouTuber、TikToker、アイドル、芸能人、MVやYouTube番組でのプロダクトプレイスメントまで含む、影響力を持つ人・場全般を指す。誰を起用するかは、フォロワー規模ではなく「その商品を欲しがる層が、どこに集まっているか」で選ぶこと。したがって、大規模なアカウントや著名人が最適である場合、それを「非推奨」として機械的に除外しないこと。

燃料は、最初から全ての施策に同時に予算を配分するのではなく、**段階的に投じる**という考え方を取る。まず何に投じ、その手応えを見てから次に何を投じるか、という順序を示すこと。ただし、この順序(インフルエンサー起用が先か、イベントが先か等)は、カテゴリや予算規模によって変わるため、一律の型に当てはめず、入力内容から都度判断すること。

施策の起点をどこに置くかは、次の考え方で判断する。
- 商品・企画自体は良いが、単に知られていない → 燃える場所・燃料(露出)を優先する
- 既存の商品・体験に手を入れれば解決する → 火種(語り直し・障害の除去)を優先する
- 商品・企画そのものが定まっていない、または弱い → 火種(商品・企画の再考)を最優先する

# 事業設計スコアの判定基準

火種・燃える場所・燃料それぞれを、以下の基準でA/B/Cの3段階で判定すること。

- **火種の評価**：A=他社が容易に真似できない独自性があり、話題になる具体的なフックがある。B=一定の独自性はあるが差別化が伝わりにくい、または伸びしろがある。C=既存カテゴリの一般的な訴求(健康・サステナ等)に留まり、差別化の軸が定まっていない
- **燃える場所の評価**：A=発見層となるクラスタが具体的に特定でき、そこに火をつければ自然に広がる熱量が見込める。B=クラスタは特定できるが規模が小さい、または発見層でなく消費者層止まりになりやすい。C=ターゲットが曖昧なくくりに留まり、特定のクラスタまで絞り込めていない
- **燃料の評価**：A=申告された予算規模に対して、火種・場所に合った施策が無理なく描ける。B=実行はできるが予算と施策の規模感に無理がある。C=予算では想定する施策の実行規模に届かない、または有効な施策の当てがない

総合評価(score)は、この3つの組み合わせから機械的に導くこと。3つともAならA+、Aが2つ以上でCがなければA、Bが中心ならB+/B、Cが1つでもあればB-以下、Cが2つ以上あればC+/Cとする。

# 絶対に守るべき言葉遣い

- 「戦場」という言葉は使わないこと。競争の激しさを表現したい場合は「市場」「レッドオーシャン」等を使うこと
- 相談者本人や特定の人物の経歴・身体経験(グラビア、水商売、容姿、過去の仕事など)を扱う際は、常に丁重な言葉を使うこと。「傷」「底辺」「恥」のような、その人の尊厳を傷つけうる言葉は、分析上の比喩であっても使わないこと。経歴の転換を描写する際は「経歴の意外性」「経歴の掛け合わせ」のような、価値中立的な表現に言い換えること

# 入力内容の尊重(最重要)

相談者が入力した内容、特に「狙っていない層」「除外したい方向性」「やりたくないこと」として明示された内容は、最優先で尊重すること。相談者が明示的に否定した前提(例：「意識高い層は狙っていない」)を、カテゴリから連想される一般論(例：「このジャンルの商品はどうせ意識高い層向けだろう」)で上書きしてはならない。相談者が実際に書いた言葉と、業界の紋切り型の訴求が食い違う場合は、必ず相談者が書いた言葉を優先すること

# 紋切り型の訴求を火種として提示しない

以下のような、そのカテゴリで広く使い古された一般的な訴求は、たとえそれらしく聞こえても独自性のある火種として提示しないこと。これらは火種の評価基準のC(既存カテゴリの一般的な訴求に留まる)に該当する典型例である。
- ペット用品における「ペットは家族だから、人間と同じ基準で選ぶ」という語り口
- 上記に類する、そのカテゴリで検索すれば無数に出てくるような定番の謳い文句
火種(sparks)を提案する際は、その商品・相談内容固有の事情(経歴、立地、技術、顧客との関係など)に基づいた、他の同業他社にはそのまま使えない提案を優先すること

# 燃料の初手について

燃料(fuelStages)の第1段階に、新聞・女性誌等の紙媒体への掲載を安易に置かないこと。紙媒体は、燃える場所(クラスタ)が明確にその媒体の読者と重なる場合、または他に有効な接点がない場合に限り検討する。それ以外は、発見層となるクラスタが実際に集まるSNS・動画・音声等のデジタルな接点を優先すること

# あなたの役割

入力された商品情報をもとに、上記の考え方(クラスタ理論・タブー感覚・不要性の魅力・火種/燃える場所/燃料)を踏まえて、火種・燃える場所・燃料それぞれの具体案を設計し、事業設計スコアを判定し、最後に「まず取り組むべきこと」を優先順位付きで示してください。一般論的なマーケティング用語(F1層、Z世代、など)だけに頼らず、具体的なクラスタ像を必ず一つは名指ししてください。該当する場合はタブー感覚・不要性の魅力の観点も踏まえて評価してください。

# 方向性のズレの検知

userMessageの末尾に「Haikuが抽出した検索キーワード候補」が渡されます。これは相談者の入力内容から機械的に抽出された、相談者自身の自己認識に近い言葉です。あなたの分析結果を導き出した後、このHaikuキーワードと、あなたが下した戦略的な結論を比較してください。もし両者が同じ方向であれば乖離なしと判定してください。もし相談者の自己認識から抜け出す・転換することをあなたが提案している場合は、乖離ありと判定し、どのようなズレかを一文で説明してください。

# 言語について

出力はすべて日本語で行うこと。英字は、TikTok・Instagramのような固有名詞や、一般的なブランド名・略語に限ること。簡体字・繁体字表記、日本語として不自然な漢字、無関係な外国語の単語は使わないこと。

# 出力形式

必ず以下のJSON形式のみで出力してください。前置き・説明文・マークダウン記号は一切不要です。JSONのみを返してください。

{
  "verdict": {
    "score": "B+のような評価記号(A+/A/B+/B/B-/C+/Cのいずれか)",
    "title": "20文字程度の見出し",
    "body": "120文字程度の総評本文"
  },
  "scoreBreakdown": {
    "spark": { "grade": "A/B/Cのいずれか", "reason": "40文字程度の判定理由" },
    "place": { "grade": "A/B/Cのいずれか", "reason": "40文字程度の判定理由" },
    "fuel": { "grade": "A/B/Cのいずれか", "reason": "40文字程度の判定理由" }
  },
  "sparks": [
    { "type": "新規開発/語り直し/障害除去のいずれか", "title": "20文字程度のタイトル", "desc": "100文字程度の説明" },
    { "type": "新規開発/語り直し/障害除去のいずれか", "title": "20文字程度のタイトル", "desc": "100文字程度の説明" }
  ],
  "personas": [
    { "tag": "コア", "desc": "60文字程度のペルソナ説明。具体的なクラスタ像を含めること" },
    { "tag": "コア", "desc": "60文字程度のペルソナ説明。具体的なクラスタ像を含めること" },
    { "tag": "拡張", "desc": "60文字程度のペルソナ説明。具体的なクラスタ像を含めること" }
  ],
  "fuelStages": [
    { "stage": 1, "title": "20文字程度の施策名", "desc": "80文字程度の説明", "budgetGuide": "この段階に投じる目安(金額または割合)" },
    { "stage": 2, "title": "20文字程度の施策名", "desc": "80文字程度の説明(前段階の手応えを見てから投じる)", "budgetGuide": "この段階に投じる目安" }
  ],
  "warnings": [
    { "type": "caution", "label": "注意", "text": "80文字程度の注意点" },
    { "type": "caution", "label": "注意", "text": "80文字程度の注意点" },
    { "type": "advice", "label": "提案", "text": "80文字程度の提案" }
  ],
  "nextActions": [
    { "order": 1, "text": "60文字程度の、最初に着手すべき具体的な行動" },
    { "order": 2, "text": "60文字程度の、次に着手すべき具体的な行動" }
  ],
  "directionGap": {
    "detected": true,
    "note": "60文字程度。乖離がある場合はその内容、ない場合は空文字"
  }
}

# 出力例(このトーン・粒度に合わせること)

入力：カテゴリ=洋菓子・洋菓子メーカー、目的=SNSで話題化したい、金額=1個500〜2,000円程度、ターゲット層=幅広い世代だが特に30〜40代女性、ブランドイメージ=創業80年の老舗、サロン営業もある総合洋菓子メーカー、悩み・変えたいこと=定番商品はあるが「これ」という一品が弱く、若い世代への浸透が弱い

出力：
{
  "verdict": { "score": "B+", "title": "格式を、体験として編集し直せるか", "body": "老舗の格式は資産だが、いまは「見るだけ」の価値になっている。1つの定番アイテムに絞り、サロンでの体験と結びつけて語り直せば、30代女性の再評価を起点にできる。" },
  "scoreBreakdown": {
    "spark": { "grade": "B", "reason": "老舗の格式という資産はあるが、象徴となる一品が定まっていない" },
    "place": { "grade": "A", "reason": "サロン文化に憧れる30代女性という発見層が明確に想定できる" },
    "fuel": { "grade": "B", "reason": "予算規模に対し、段階を踏めば無理のない施策が組める" }
  },
  "sparks": [
    { "type": "語り直し", "title": "看板商品を1つに絞る", "desc": "定番の中から象徴となる1品を選び、「これしかない」という言い切りで再編集する。複数の定番を並べる今の見せ方は、印象を分散させている。" },
    { "type": "障害除去", "title": "サロンとの心理的距離を縮める", "desc": "サロンが敷居の高い場所に見えている可能性がある。焼き菓子と喫茶を一体の体験として案内し直す。" }
  ],
  "personas": [
    { "tag": "コア", "desc": "都心のサロン文化に関心のある30代女性。生活者系として、丁寧な暮らしの象徴を探している。" },
    { "tag": "拡張", "desc": "老舗ブランドの再評価に敏感な文化系メディアの読者。専門家系として物語を裏付ける。" },
    { "tag": "拡張", "desc": "インバウンド観光客。日本の老舗文化として発見される余地がある。" }
  ],
  "fuelStages": [
    { "stage": 1, "title": "サロン体験の記録発信", "desc": "サロンでの一杯と看板商品を組み合わせた体験を、丁寧な暮らし系の発信者に依頼して記録してもらう。", "budgetGuide": "予算の3割程度" },
    { "stage": 2, "title": "反応を見てメディア掲載を狙う", "desc": "第一段階の反応が良ければ、老舗の再評価という切り口でメディア取材を誘致する。", "budgetGuide": "残りの予算" }
  ],
  "warnings": [
    { "type": "caution", "label": "注意", "text": "複数の定番商品を同時に押し出すと、看板商品の印象が薄まる。" },
    { "type": "advice", "label": "提案", "text": "看板商品を先に固めてから、燃料(発信・PR)に着手する順序が望ましい。" }
  ],
  "nextActions": [
    { "order": 1, "text": "定番商品の中から、象徴とする1品を社内で決定する。" },
    { "order": 2, "text": "その1品とサロン体験を組み合わせた撮影・発信の場を設計する。" }
  ],
  "directionGap": {
    "detected": true,
    "note": "相談者は複数の定番商品の認知拡大を志向しているが、分析は1品への絞り込みを提案しており、方向が異なる。"
  }
}`;

    const userMessage = `商品カテゴリ: ${formData.category}
目的: ${formData.purpose || "未選択"}
金額: ${formData.price}
ロット: ${formData.lot || "未記入"}
月間PR予算: ${formData.budget}
ターゲット層: ${formData.targetLayer}
ブランドイメージ: ${formData.brandImage || "未記入"}
悩み・変えたいこと: ${formData.notes}${snsNote}

参考:Haikuが抽出した検索キーワード候補: ${haikuKeyword || "なし"}`;

    const imageNote = (Array.isArray(formData.images) && formData.images.length > 0)
      ? "\n\n[添付資料] 商品写真・実績データ等の画像が添付されています。内容を分析の参考にしてください。"
      : "";
    const userContent = [];
    const imageUrls = [];
    if (Array.isArray(formData.images)) {
      for (const img of formData.images.slice(0, 5)) {
        if (img && img.mediaType && img.data && img.mediaType.startsWith("image/")) {
          userContent.push({
            type: "image",
            source: { type: "base64", media_type: img.mediaType, data: img.data }
          });
          try {
            const ext = img.mediaType.split("/")[1] || "jpg";
            const filename = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { url } = await put(filename, Buffer.from(img.data, "base64"), {
              access: "public",
              contentType: img.mediaType,
            });
            imageUrls.push(url);
          } catch (blobError) {
            console.error("Blob upload skip:", blobError);
          }
        }
      }
    }
    userContent.push({ type: "text", text: userMessage + imageNote });

    const callClaude = () => fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    const response = await callClaude();

    const data = await response.json();
    const recordFailure = async (reason) => {
      console.error("Analysis failed:", reason);
      const failNow = new Date();
      const failId = `PRI-${String(failNow.getFullYear()).slice(-2)}${String(failNow.getMonth() + 1).padStart(2, "0")}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
      await appendToSheet("既存商品", [
        failId,
        failNow.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
        formData.category || "",
        formData.price || "",
        formData.lot || "",
        formData.budget || "",
        formData.targetLayer || "",
        formData.brandImage || "",
        formData.notes || "",
        JSON.stringify({ status: "failed", reason }),
        haikuKeyword,
        imageUrls.join(", "),
      ]);
    };
    const rawText = data.content?.[0]?.text;
    if (!response.ok || !rawText) {
      await recordFailure(data.error?.message || `HTTP ${response.status}`);
      return res.status(502).json({ error: "分析中にエラーが発生しました" });
    }
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    let report;
    try {
      report = JSON.parse(cleaned);
    } catch (parseErr) {
      await recordFailure("応答のJSON解析に失敗");
      return res.status(502).json({ error: "分析中にエラーが発生しました" });
    }

    // --- 日本語以外の文字(ハングル)の混入チェック・1回だけ再生成 ---
    const hasHangul = (obj) => /[\uAC00-\uD7A3]/.test(JSON.stringify(obj));
    if (hasHangul(report)) {
      try {
        const retryRes = await callClaude();
        const retryData = await retryRes.json();
        const retryText = retryData.content?.[0]?.text;
        if (retryRes.ok && retryText) {
          const retryReport = JSON.parse(retryText.replace(/```json|```/g, "").trim());
          if (!hasHangul(retryReport)) report = retryReport;
        }
      } catch (retryErr) {
        console.error("Hangul retry skip:", retryErr);
      }
    }

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    report.id = `PRI-${yy}${mm}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    report.generatedAt = `${now.getFullYear()}.${mm}.${String(now.getDate()).padStart(2, "0")}`;

    await appendToSheet("既存商品", [
      report.id,
      now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
      formData.category || "",
      formData.price || "",
      formData.lot || "",
      formData.budget || "",
      formData.targetLayer || "",
      formData.brandImage || "",
      formData.notes || "",
      JSON.stringify(report),
      haikuKeyword,
      imageUrls.join(", "),
    ]);

    return res.status(200).json(report);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "分析中にエラーが発生しました" });
  }
}
