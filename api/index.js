export const config = { runtime: "edge" };

const BLOCKED_HEADERS = new Set([
  "host", "connection", "keep-alive", "te", "trailer",
  "transfer-encoding", "upgrade", "forwarded",
  "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port",
  "proxy-authenticate", "proxy-authorization",
]);

const BLOCKED_RESPONSE_HEADERS = new Set([
  "transfer-encoding", "connection", "keep-alive",
]);

function buildTargetUrl(reqUrl, base) {
  const url = new URL(reqUrl);
  return `${base}${url.pathname}${url.search}`;
}

function filterRequestHeaders(reqHeaders) {
  const headers = new Headers();
  let clientIp = null;

  for (const [k, v] of reqHeaders) {
    const key = k.toLowerCase();
    if (BLOCKED_HEADERS.has(key)) continue;
    if (key.startsWith("x-vercel-")) continue;
    if (key === "x-real-ip") { clientIp = v; continue; }
    if (key === "x-forwarded-for") { if (!clientIp) clientIp = v; continue; }
    headers.set(k, v);
  }

  if (clientIp) headers.set("x-forwarded-for", clientIp);
  return headers;
}

function filterResponseHeaders(upstreamHeaders) {
  const headers = new Headers();
  for (const [k, v] of upstreamHeaders) {
    if (BLOCKED_RESPONSE_HEADERS.has(k.toLowerCase())) continue;
    headers.set(k, v);
  }
  return headers;
}

function isBodyAllowed(method) {
  return method !== "GET" && method !== "HEAD";
}

export default async function handler(req) {
  const base = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

  if (!base) {
    return new Response(JSON.stringify({ error: "Service misconfigured" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  let targetUrl;
  try {
    targetUrl = buildTargetUrl(req.url, base);
  } catch {
    return new Response("Invalid request URL", { status: 400 });
  }

  const method = req.method;
  const reqHeaders = filterRequestHeaders(req.headers);

  const fetchOptions = {
    method,
    headers: reqHeaders,
    redirect: "manual",
    ...(isBodyAllowed(method) && {
      body: req.body,
      duplex: "half",
    }),
  };

  let upstream;
  try {
    upstream = await fetch(targetUrl, fetchOptions);
  } catch (err) {
    const msg = err instanceof TypeError ? "Upstream unreachable" : "Bad gateway";
    return new Response(msg, { status: 502 });
  }

  const respHeaders = filterResponseHeaders(upstream.headers);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}
