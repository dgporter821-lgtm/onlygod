export const config = {
  runtime: "edge",
};

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").trim().replace(/\/$/, "");

export default async function handler(req) {
  console.log("TARGET_BASE:", TARGET_BASE);
  console.log("Incoming Path:", req.url);
  console.log("Incoming Host:", req.headers.get("host"));

  if (!TARGET_BASE || !TARGET_BASE.startsWith("https://")) {
    return new Response("TARGET_DOMAIN error", { status: 500 });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = TARGET_BASE + url.pathname + url.search;

    const headers = new Headers();
    
    // مهم: Host اصلی Vercel رو به Host مورد انتظار Xray تغییر بده
    for (const [key, value] of req.headers) {
      const k = key.toLowerCase();
      
      if (["connection", "keep-alive", "upgrade", "te", "trailer", 
           "transfer-encoding", "proxy-authorization", "x-vercel-"].includes(k)) {
        continue;
      }
      
      // Host رو به هاست مورد انتظار Xray تغییر بده
      if (k === "host") {
        headers.set("host", "onlygod.vercel.app");
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

    console.log("Forwarding to:", targetUrl, "with Host: onlygod.vercel.app");

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
    console.error("Error:", err);
    return new Response("Proxy Error", { status: 502 });
  }
}
