# POWIIS Candidate Egress Policy

Cloudflare Worker + Workers KV for managing IP-based access to **seven domains** in one Cloudflare account.

> **Status: not deployed. Default mode: observe.** IP observations do not prove school membership. Do not block an entire ISP/ASN or treat a shared public IP as a personal identity.

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

## Setup (Windows PowerShell / any shell)

1. Install Node.js 22+ and sign into the **correct Cloudflare account** using Wrangler:

~~~sh
npm install
npx wrangler login
~~~

2. Create a KV namespace for the Worker:

~~~sh
npx wrangler kv namespace create SCHOOL_IP_KV
~~~

3. Edit wrangler.jsonc, replacing REPLACE_WITH_REAL_KV_NAMESPACE_ID with the namespace ID provided by Wrangler. Do not enter API tokens or secrets into GitHub. A KV namespace ID itself is not a secret.

4. Test locally:

~~~sh
npm test
npx wrangler dev
~~~

5. Deploy the standalone Worker only (no zone routes are automatically activated):

~~~sh
npx wrangler deploy
~~~

6. **Important if an existing Worker already handles your sites:** you previously have vynalth-cloudflare-edge. Do not attach a second Worker to its exact same route, which can replace/conflict with existing route handling. Instead merge/import the schoolGuard() function into your existing edge Worker's fetch handler, give THAT Worker the SCHOOL_IP_KV binding, and wrap its existing logic:

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

Copy src/policy.js as school-policy.js in the existing Worker project if using this integration. Replace existingHandler with your actual existing request handler. Preserve existing authentication, routing, protection and logs. Do not deploy this illustrative snippet without adapting it.

7. If running standalone where there is **no** competing Worker route, configure routes intentionally for the desired hosts under Workers & Pages → your Worker → Settings → Domains & Routes. The optional routes.example.jsonc file illustrates all seven domains; review the subdomain impact first. Requests to unproxied DNS-only hostnames will not reach a Cloudflare route Worker.

## KV keys / manually blocking

Observed candidate IPs are automatically stored only after a root-page visit:

- observed:60.49.64.83
- observed:60.51.219.195
- observed:60.51.219.225

View observations:

~~~sh
npx wrangler kv key list --binding SCHOOL_IP_KV --prefix "observed:" --remote
~~~

Once you have **independently confirmed** an address should be blocked and accepted the collateral impact, add it explicitly:

~~~sh
npx wrangler kv key put "blocked:60.49.64.83" "manual-review" --binding SCHOOL_IP_KV --remote
~~~

To remove this manual block:

~~~sh
npx wrangler kv key delete "blocked:60.49.64.83" --binding SCHOOL_IP_KV --remote
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
