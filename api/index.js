export const config = {
  runtime: "edge",
};

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").trim().replace(/\/$/, "");

export default async function handler(req) {
  console.log("→ Path:", req.url);
  console.log("→ Host from Vercel:", req.headers.get("host"));

  if (!TARGET_BASE) return new Response("TARGET_DOMAIN missing", { status: 500 });

  try {
    const url = new URL(req.url);
    let targetPath = url.pathname;
    
    // اگر مسیر با /mypath2025 شروع نشد، درستش کن
    if (!targetPath.startsWith("/mypath2025")) {
      targetPath = "/mypath2025" + (targetPath === "/" ? "" : targetPath);
    }

    const targetUrl = TARGET_BASE + targetPath + url.search;

    const headers = new Headers();
    for (const [key, value] of req.headers) {
      const k = key.toLowerCase();
      if (["connection", "keep-alive", "upgrade", "te", "trailer", 
           "transfer-encoding", "proxy-authorization", "x-vercel-"].includes(k)) {
        continue;
      }
      if (k === "host") {
        headers.set("host", "onlygod.vercel.app");   // دقیقاً مطابق config Xray
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
    console.error(err);
    return new Response("Proxy Error", { status: 502 });
  }
}
