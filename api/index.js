export const config = {
  runtime: "edge",
};

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host", "connection", "keep-alive",
  "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
  "forwarded", "x-forwarded-host", "x-forwarded-proto",
  "x-forwarded-port",
]);

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("Service configuration error", { status: 500 });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = TARGET_BASE + url.pathname + url.search;

    const headers = new Headers();
    let clientIp = null;

    for (const [key, value] of req.headers) {
      const k = key.toLowerCase();
      if (STRIP_HEADERS.has(k)) continue;
      if (k.startsWith("x-vercel-")) continue;
      if (k === "x-real-ip") { clientIp = value; continue; }
      if (k === "x-forwarded-for") { if (!clientIp) clientIp = value; continue; }
      headers.set(k, value);
    }
    if (clientIp) headers.set("x-forwarded-for", clientIp);

    const method = req.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    // ✅ اضافه کردن AbortController برای timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // 25 ثانیه

    const fetchOpts = {
      method,
      headers,
      redirect: "manual",
      signal: controller.signal, // ✅
    };

    if (hasBody) {
      fetchOpts.body = req.body;
      fetchOpts.duplex = "half";
    }

    let upstream;
    try {
      upstream = await fetch(targetUrl, fetchOpts);
    } finally {
      clearTimeout(timeout); // ✅ همیشه timeout رو پاک کن
    }

    const respHeaders = new Headers();
    for (const [k, v] of upstream.headers) {
      if (k.toLowerCase() === "transfer-encoding") continue;
      respHeaders.set(k, v);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });

  } catch (err) {
    // ✅ خطای timeout رو جدا handle کن
    if (err.name === "AbortError") {
      return new Response("Gateway timeout", { status: 504 });
    }
    return new Response("Service temporarily unavailable", { status: 502 });
  }
}
