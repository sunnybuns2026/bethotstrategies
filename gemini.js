// Netlify serverless function — proxies requests to Google's Gemini API server-side.
// Gemini's free tier has no expiration and needs no credit card (unlike Anthropic's,
// which requires purchased credit). Get a free key at https://aistudio.google.com
// (Get API Key → Create API key), then add it in Netlify: Site settings →
// Environment variables → GEMINI_API_KEY.
//
// Note: Google updates its recommended free-tier model name from time to time.
// If this starts returning 404s, check https://ai.google.dev/gemini-api/docs/models
// for the current free-tier model and update GEMINI_MODEL below.

const GEMINI_MODEL = "gemini-2.5-flash";

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "GEMINI_API_KEY is not set in this site's environment variables. Get a free key at aistudio.google.com, then add it in Netlify: Site settings → Environment variables." })
    };
  }

  let prompt;
  try {
    const parsed = JSON.parse(event.body || "{}");
    prompt = parsed.prompt;
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid request body." }) };
  }
  if (!prompt || typeof prompt !== "string") {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing 'prompt' in request body." }) };
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
      }
    );

    const data = await res.json();

    if (!res.ok) {
      const msg = (data && data.error && data.error.message) ? data.error.message : `Gemini API returned status ${res.status}`;
      return { statusCode: res.status, headers, body: JSON.stringify({ error: msg }) };
    }

    const candidate = (data.candidates || [])[0];
    const text = candidate && candidate.content && candidate.content.parts
      ? candidate.content.parts.map(p => p.text || "").join("\n").trim()
      : "";

    if (!text) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Gemini returned an empty response (it may have blocked the prompt for safety reasons)." }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ text }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server-side request to Gemini failed: " + err.message }) };
  }
};
