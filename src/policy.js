/**
 * Candidate school-egress policy.
 *
 * NEVER equate an observed public IP with membership of a school.
 * MODE=observe is the default. Only manually created blocked:IP keys can
 * trigger a 403, and only when MODE=enforce.
 */

export const ZONES = Object.freeze([
  "powiismunc.com",
  "sleepsomno.com",
  "vitamindai.online",
  "vynalthai.com",
  "vynalthai.si",
  "vyncuslim.com",
  "vyncuslim.si"
]);

// Unverified, historically observed public source IPs. Do not auto-block.
export const CANDIDATE_IPS = new Set([
  "60.49.64.83",
  "60.51.219.195",
  "60.51.219.225"
]);

export const OBSERVATION_TTL_SECONDS = 86400;

export function coveredHost(hostname) {
  if (typeof hostname !== "string") return false;
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return ZONES.some(zone => host === zone || host.endsWith("." + zone));
}

export function validIPv4(value) {
  if (typeof value !== "string") return false;
  const octets = value.split(".");
  return octets.length === 4 && octets.every(octet =>
    /^(0|[1-9][0-9]{0,2})$/.test(octet) && Number(octet) <= 255
  );
}

async function recordCandidate(kv, ip) {
  const key = "observed:" + ip;
  try {
    // One record per IP per day; do not write on every page asset.
    if ((await kv.get(key)) !== null) return;
    await kv.put(
      key,
      JSON.stringify({
        firstSeen: new Date().toISOString(),
        category: "unverified-candidate"
      }),
      { expirationTtl: OBSERVATION_TTL_SECONDS }
    );
  } catch {
    // KV is eventually consistent; competing writes or quota limits should
    // never break website availability.
    console.warn("candidate observation unavailable");
  }
}

function deniedResponse() {
  return new Response(
    "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Request unavailable</title><body><h1>Request unavailable</h1><p>This request cannot be completed. Contact the site owner if you believe this is an error.</p></body></html>",
    {
      status: 403,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Robots-Tag": "noindex",
        "X-School-Policy": "blocked",
        "Content-Security-Policy": "default-src 'none'; style-src 'none'; frame-ancestors 'none'; base-uri 'none'"
      }
    }
  );
}

/**
 * Wraps an existing Worker's handler without replacing its logic.
 * next() must call the original handler or origin fetch.
 */
export async function schoolGuard(request, env, ctx, next) {
  if (!request || typeof next !== "function") {
    throw new TypeError("schoolGuard requires a Request and a next() handler");
  }

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return next();
  }

  if (!coveredHost(url.hostname)) return next();

  // Trusted only when set by Cloudflare on an incoming proxied edge request.
  // Never read client-supplied X-Forwarded-For for policy decisions.
  const ip = request.headers.get("CF-Connecting-IP");
  if (!validIPv4(ip)) return next();

  const kv = env && env.SCHOOL_IP_KV;

  if (
    kv &&
    CANDIDATE_IPS.has(ip) &&
    request.method === "GET" &&
    url.pathname === "/" &&
    ctx &&
    typeof ctx.waitUntil === "function"
  ) {
    ctx.waitUntil(recordCandidate(kv, ip));
  }

  // Safe-by-default. The unverified candidate set does not trigger a block.
  if (!env || env.MODE !== "enforce" || !kv) return next();

  try {
    // Manually managed keys only; no automatic block on observation.
    const explicitlyBlocked = await kv.get("blocked:" + ip);
    if (explicitlyBlocked !== null && explicitlyBlocked !== undefined) {
      return deniedResponse();
    }
  } catch {
    // Fail open instead of breaking all seven public websites.
    console.error("KV blocklist lookup failed; request passed through");
  }

  return next();
}
