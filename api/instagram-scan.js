export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { keyword, limit = 30 } = req.body;

    if (!keyword) {
      return res.status(400).json({ error: 'keyword is required' });
    }

    const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
    const actorId = 'apify~instagram-hashtag-scraper';

    const runResponse = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hashtags: [keyword],
          resultsLimit: limit
        })
      }
    );

    if (!runResponse.ok) {
      const errText = await runResponse.text();
      return res.status(502).json({ error: 'Apify run failed', detail: errText });
    }

    const items = await runResponse.json();

    const simplified = items.map(item => ({
      caption: item.caption,
      hashtags: item.hashtags,
      likesCount: item.likesCount,
      commentsCount: item.commentsCount,
      timestamp: item.timestamp,
      ownerUsername: item.ownerUsername
    }));

    return res.status(200).json({
      keyword,
      count: simplified.length,
      items: simplified
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
