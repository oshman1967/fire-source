import crypto from "crypto";

async function getAccessToken() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const base64url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const unsigned = `${base64url(header)}.${base64url(claimSet)}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(unsigned), privateKey)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error("Google認証トークンの取得に失敗しました: " + JSON.stringify(data));
  }
  return data.access_token;
}

export async function appendToSheet(sheetName, rowValues) {
  try {
    const accessToken = await getAccessToken();
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const range = `${sheetName}!A1`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
      range
    )}:append?valueInputOption=USER_ENTERED`;

    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [rowValues] }),
    });
  } catch (err) {
    console.error("Sheet append error:", err);
  }
}
