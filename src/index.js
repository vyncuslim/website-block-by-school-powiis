import { studentIpReport } from "./student-report.js";
import { schoolGuard, coveredHost, validIPv4 } from "./policy.js";

// The public workers.dev address only serves diagnostics.
// Real traffic reaches this Worker through a Service Binding from
// vynalth-cloudflare-edge, never through a Custom Domain on a website origin.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname.endsWith(".workers.dev")) {
      if (request.method === "GET" && url.pathname === "/health") {
        return new Response(
          JSON.stringify({
            ok: true,
            service: "website-block-by-school-powiis",
            policyProtocol: "internal-204-v1",
            mode: env?.MODE === "enforce" ? "enforce" : "observe",
            kvBound: typeof env?.SCHOOL_IP_KV?.get === "function"
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store",
              "X-Robots-Tag": "noindex"
            }
          }
        );
      }
      if (url.pathname === "/block-ip") {
        // Consent-based reporting, NOT a public write to the blocklist.
        return studentIpReport(request, env, url);
      }

      if (request.method === "GET" && url.pathname === "/") {
        return new Response(null, {
          status: 302,
          headers: {
            "Location": "/block-ip",
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex, nofollow"
          }
        });
      }

      return new Response("Standalone Worker: use /health", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    // Deliberately require the internal gateway header and a known hostname.
    // The edge Worker obtains this from the CF-Connecting-IP on the real
    // incoming request, rather than passing an arbitrary browser-supplied
    // X-Vynalth-Policy-Client-IP header.
    const ip = request.headers.get("X-Vynalth-Policy-Client-IP");
    if (!coveredHost(url.hostname) || !validIPv4(ip)) {
      return new Response(null, { status: 204, headers: { "X-School-Policy": "allow" } });
    }

    const policyRequest = new Request(request.url, {
      method: request.method,
      headers: { "CF-Connecting-IP": ip }
    });
    return schoolGuard(
      policyRequest,
      env,
      ctx,
      () => new Response(null, {
        status: 204,
        headers: { "X-School-Policy": "allow", "Cache-Control": "no-store" }
      })
    );
  }
};
