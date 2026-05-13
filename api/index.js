export const config = {
  runtime: "edge",
};

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").trim().replace(/\/$/, "");

export default async function handler(req) {
  // === لاگ‌گیری برای دیباگ ===
  console.log("TARGET_BASE:", TARGET_BASE);
  console.log("Request Path:", req.url);
  console.log("Method:", req.method);

  if (!TARGET_BASE || !TARGET_BASE.startsWith("https://")) {
    console.error("TARGET_DOMAIN is invalid or not set");
    return new Response("Proxy configuration error: TARGET_DOMAIN missing", { 
      status: 500,
      headers: { "content-type": "text/plain" }
    });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = TARGET_BASE + url.pathname + url.search;

    console.log("Forwarding to:", targetUrl);

    const headers = new Headers();
    for (const [key, value] of req.headers) {
      const k = key.toLowerCase();
      if (["host", "connection", "keep-alive", "upgrade", "te", "trailer", 
           "transfer-encoding", "proxy-authorization", "x-vercel-"].includes(k)) {
        continue;
      }
      headers.set(key, value);
    }

    const fetchOpts = {
      method: req.method,
      headers,
      redirect: "manual",
    };

    if (req.body) {
      fetchOpts.body = req.body;
      fetchOpts.duplex = "half";
    }

    const upstream = await fetch(targetUrl, fetchOpts);
    
    console.log("Upstream Status:", upstream.status);

    const respHeaders = new Headers(upstream.headers);
    respHeaders.delete("transfer-encoding");
    respHeaders.delete("content-encoding");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });

  } catch (err) {
    console.error("Proxy Error:", err);
    return new Response("Proxy Error: " + err.message, { status: 502 });
  }
}
