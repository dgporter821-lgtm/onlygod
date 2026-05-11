export default async function handler(req, res) {
  const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

  if (!TARGET_BASE) {
    return res.status(500).send("Service configuration error");
  }

  try {
    const url = new URL(req.url, "http://localhost");
    const targetUrl = TARGET_BASE + url.pathname + url.search;

    const STRIP_HEADERS = new Set([
      "host", "connection", "keep-alive",
      "proxy-authenticate", "proxy-authorization",
      "te", "trailer", "transfer-encoding", "upgrade",
      "forwarded", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port",
    ]);

    const headers = {};
    let clientIp = null;

    for (const [key, value] of Object.entries(req.headers)) {
      const k = key.toLowerCase();
      if (STRIP_HEADERS.has(k)) continue;
      if (k.startsWith("x-vercel-")) continue;
      if (k === "x-real-ip") { clientIp = value; continue; }
      if (k === "x-forwarded-for") { if (!clientIp) clientIp = value; continue; }
      headers[k] = value;
    }
    if (clientIp) headers["x-forwarded-for"] = clientIp;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const fetchOpts = {
      method: req.method,
      headers,
      redirect: "manual",
      signal: controller.signal,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      fetchOpts.body = Buffer.concat(chunks);
    }

    let upstream;
    try {
      upstream = await fetch(targetUrl, fetchOpts);
    } finally {
      clearTimeout(timeout);
    }

    res.status(upstream.status);
    for (const [k, v] of upstream.headers.entries()) {
      if (k.toLowerCase() === "transfer-encoding") continue;
      res.setHeader(k, v);
    }

    const body = await upstream.arrayBuffer();
    res.send(Buffer.from(body));

  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(504).send("Gateway timeout");
    }
    return res.status(502).send("Service temporarily unavailable");
  }
}
