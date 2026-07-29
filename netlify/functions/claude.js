// Netlify serverless function — proxies requests to Anthropic's API server-side
// so the browser never needs to hold or send an API key directly to api.anthropic.com.
// Requires an environment variable ANTHROPIC_API_KEY set in Netlify (Site settings →
// Environment variables), NOT in any client-side code.

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY is not set in this site's environment variables. Add it in Netlify: Site settings → Environment variables." })
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
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = (data && data.error && data.error.message) ? data.error.message : `Anthropic API returned status ${res.status}`;
      return { statusCode: res.status, headers, body: JSON.stringify({ error: msg }) };
    }

    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    return { statusCode: 200, headers, body: JSON.stringify({ text }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server-side request to Anthropic failed: " + err.message }) };
  }
};
