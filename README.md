# POWIIS Candidate Egress Policy

Cloudflare Worker + Workers KV for managing IP-based access to **seven domains** in one Cloudflare account.

> **Deployment depends on Cloudflare Builds. No website routes included; default mode: observe.** IP observations do not prove school membership. Do not block an entire ISP/ASN or treat a shared public IP as a personal identity.

## Protected domains

- powiismunc.com
- sleepsomno.com
- vitamindai.online
- vynalthai.com
- vynalthai.si
- vyncuslim.com
- vyncuslim.si

The code recognizes apex hosts and their subdomains **if their Cloudflare routes are configured**. Routes are NOT automatically configured by this repository.

## What it does

- Reads the client IPv4 from the Cloudflare-provided CF-Connecting-IP header inside the Worker.
- Recognizes three historically observed, **unverified** candidate public egress IPs: 60.49.64.83, 60.51.219.195, 60.51.219.225.
- For a candidate visiting the root path (GET /), records an expiring minimal KV observation under observed:IP with a 24-hour TTL. Other visitors are not automatically recorded.
- If and ONLY IF MODE=enforce, checks KV for blocked:IP and returns HTTP 403 on a manually listed IP.
- Otherwise passes through the original request. KV errors fail open to avoid accidentally taking seven sites offline.
- Does not expose a public administration endpoint or allow browsers to modify KV.

**Important:** No automatic block is created for any candidate IP. Source IP cannot establish that a person is a school student or teacher. Shared or changing NAT addresses can misidentify people.

## Cloudflare Git integration (recommended)

The Worker registered in Cloudflare is **website-block-by-school-powiis**. The name in wrangler.jsonc **must exactly match** this Cloudflare Worker; a mismatch fails GitHub-connected Workers Builds.

**As of the deploy configuration fix:** wrangler.jsonc has \`kv_namespaces: [{ "binding": "SCHOOL_IP_KV" }]\` (no placeholder ID). Recent Wrangler versions support automatic KV provisioning. On a successful dashboard-triggered Git deployment, Cloudflare can create and bind the KV namespace for this Worker. If a namespace already exists and you prefer to reuse it, place its actual namespace ID in the configuration instead.

1. In Cloudflare Workers & Pages → website-block-by-school-powiis → **Deployments**, look for the build triggered by the latest GitHub commit. Build settings: no build command required, deploy command \`npx wrangler deploy\`, root directory \`/\`.
2. After a successful deploy, check **Settings → Bindings** for the \`SCHOOL_IP_KV\` KV Namespace binding, and check **Storage & databases → KV** for the created namespace. If the build fails again, get the log from the lines **after** the \`wrangler\` banner; the beginning alone is not the error.
3. Cloudflare Git builds provision KV automatically, but the generated namespace ID is **not automatically committed back to GitHub**. Copy the real ID from the dashboard if you want to pin it in wrangler.jsonc for repeatable CLI maintenance. An ID is an identifier, **not an API credential**.
4. Do not attach live routes to this Worker yet. The current project has an existing \`vynalth-cloudflare-edge\` Worker for some/all domains, and a route collision could override it. A successful deployment only makes the new standalone Worker available at its workers.dev address. It does **not** make all seven domains use this code.

### Local development (optional)

~~~sh
npm install
npm test
npx wrangler dev
~~~

For local command-line deployment from the correct Cloudflare account:

~~~sh
npx wrangler login
npx wrangler deploy
~~~

### Integrate without replacing the existing edge Worker

The exported \`schoolGuard()\` can be composed into your existing \`vynalth-cloudflare-edge\` entrypoint. This is the **recommended approach** if that Worker already owns a hostname/route; do not attach a competing Worker to the same route.

~~~js
import { schoolGuard } from "./school-policy.js";

export default {
  async fetch(request, env, ctx) {
    return schoolGuard(
      request, env, ctx,
      () => existingHandler(request, env, ctx)
    );
  }
};
~~~

Copy src/policy.js as school-policy.js in the existing Worker project. Replace existingHandler with your actual existing request handler, preserve all existing security and routing behavior, and bind **SCHOOL_IP_KV** on THAT Worker as well if you want it to use the same KV. The example is illustrative, not ready to deploy without integration.

When no other Worker handles a route, the example in routes.example.jsonc illustrates the targeted hosts; review every subdomain before attaching anything. Unproxied DNS-only hostnames will not run Cloudflare route Workers.

## KV keys / manually blocking

Observed candidate IPs are automatically stored only after a root-page visit:

- observed:60.49.64.83
- observed:60.51.219.195
- observed:60.51.219.225

### Manage KV in Cloudflare dashboard (easiest)

Open Workers & Pages → website-block-by-school-powiis → **Settings → Bindings** and follow its KV namespace to view keys. This avoids needing the namespace ID in your local config.

### Manage KV using Wrangler CLI

**First obtain the real KV namespace ID from Cloudflare dashboard.** In dashboard-based Git deployments, auto-created KV IDs are not synchronized back to GitHub. Replace \`<REAL_KV_NAMESPACE_ID>\` in commands below **locally**; do not use a placeholder value.

List observations:

~~~sh
npx wrangler kv key list --namespace-id <REAL_KV_NAMESPACE_ID> --prefix "observed:" --remote
~~~

Only after verifying ownership/impact, manually add a block record:

~~~sh
npx wrangler kv key put "blocked:60.49.64.83" "manual-review" --namespace-id <REAL_KV_NAMESPACE_ID> --remote
~~~

Undo a block record:

~~~sh
npx wrangler kv key delete "blocked:60.49.64.83" --namespace-id <REAL_KV_NAMESPACE_ID> --remote
~~~


Review the entry and separately change MODE to "enforce" in wrangler.jsonc (or matching existing Worker configuration) and deploy. MODE=observe never blocks, even when a blocked:IP key exists.

**Caution:** With MODE=enforce, the operator's own visits from that shared IP will also be blocked. Keep a separate way to manage Cloudflare (for example from home/mobile data) and a documented rollback. A KV record deletion may not take effect globally immediately.

## Behavior and privacy

- Recognized candidates, not all internet visitors, are stored. Each observation expires after 24 hours.
- Observation writes only occur for GET / requests, avoiding writes on every favicon/image request.
- An IP alone cannot identify an individual or prove association with POWIIS. The three candidates could belong to shared ISP infrastructure.
- KV is eventually consistent and is not suitable for instantaneous/high-assurance revocations.
- No browser-accessible API to create, list, or delete stored IPs.
- No IP addresses or secrets are emitted in blocked HTTP responses.
- Existing Cloudflare WAF, Vercel, Shield and application authorization still need to work independently.
- The standalone Worker processes matched routed requests. Its host filter will skip requests for unrelated zones.
- The filter is fail-open on missing KV or KV errors; consider a stronger edge policy engine for strict enforcement.

## Test

~~~sh
npm test
~~~

See src/index.js, src/policy.js, test/policy.test.js and routes.example.jsonc.
