export const config = {
  runtime: "edge",
};

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate",
  "proxy-authorization", "te", "trailer", "transfer-encoding",
  "upgrade", "forwarded", "x-forwarded-host", "x-forwarded-proto",
  "x-forwarded-port", "x-vercel-"
]);

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("Config error", { status: 500 });
  }

  try {
    const url = new URL(req.url);
    // مهم: path رو حفظ کن
    const targetUrl = TARGET_BASE + url.pathname + url.search;

    const headers = new Headers();
    for (const [key, value] of req.headers) {
      const k = key.toLowerCase();
      if (STRIP_HEADERS.has(k) || k.startsWith("x-vercel-")) continue;
      headers.set(key, value);
    }

    const fetchOpts = {
      method: req.method,
      headers,
      redirect: "manual",
      body: req.body ? req.body : undefined,
      duplex: req.body ? "half" : undefined,
    };

    const upstream = await fetch(targetUrl, fetchOpts);

    const respHeaders = new Headers(upstream.headers);
    // بعضی هدرهای مشکل‌ساز رو پاک کن
    respHeaders.delete("transfer-encoding");
    respHeaders.delete("content-encoding"); // اگر مشکلی دیدی

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (err) {
    console.error(err);
    return new Response("Proxy Error", { status: 502 });
  }
}
