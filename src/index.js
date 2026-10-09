import { adminApi } from "./admin-api.js";
import { adminPage } from "./admin-page.js";
import { studentIpReport, ipStatus } from "./student-report.js";
import { schoolGuard, coveredHost, normalizePolicyIp } from "./policy.js";

// The public workers.dev address only serves diagnostics.
// Real traffic reaches this Worker through a Service Binding from
// vynalth-cloudflare-edge, never through a Custom Domain on a website origin.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname.endsWith(".workers.dev")) {
      if (
        url.hostname === "website-block-by-school-powiis.ongyuze1401.workers.dev" &&
        (url.pathname === "/admin/ip" ||
         url.pathname === "/admin/ip/app.js" ||
         url.pathname.startsWith("/admin/ip/api/"))
      ) {
        return url.pathname.startsWith("/admin/ip/api/")
          ? adminApi(request, env, url)
          : adminPage(request, url);
      }
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
      if (url.pathname === "/ip-status") {
        // Read-only diagnostics: IP family and availability, never the address.
        return ipStatus(request);
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
    if (!coveredHost(url.hostname) || !normalizePolicyIp(ip)) {
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
