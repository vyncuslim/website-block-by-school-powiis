import { schoolGuard } from "./policy.js";

// This is intentionally a standalone, observe-only deployment.
// Existing live Cloudflare routes should keep their existing Worker logic.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Without a zone route, a workers.dev Worker is not an origin proxy.
    // Serve an explicit, harmless health endpoint instead of self-fetching.
    if (url.hostname.endsWith(".workers.dev")) {
      if (request.method === "GET" && url.pathname === "/health") {
        return new Response(
          JSON.stringify({
            ok: true,
            service: "website-block-by-school-powiis",
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
      return new Response("Standalone Worker: use /health", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    }

    // For legitimate Cloudflare zone routes, pass on to the origin.
    // Never install this over a route already owned by another Worker.
    return schoolGuard(request, env, ctx, () => fetch(request));
  }
};
