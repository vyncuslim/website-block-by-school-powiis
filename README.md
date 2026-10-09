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

The production Cloudflare Worker is **website-block-by-school-powiis**, exactly matching `wrangler.jsonc`.

**Existing KV binding confirmed in Cloudflare dashboard:** binding variable `SCHOOL_IP_KV` connects to the `website-block-by-school-powiis-school-ip-kv` namespace. Its namespace ID has been pinned in `wrangler.jsonc` to keep dashboard and GitHub redeployments consistent.

1. In Cloudflare Workers & Pages → website-block-by-school-powiis → **Deployments**, check the latest GitHub `main` commit. Build settings: no build command, deployment command `npx wrangler deploy`, root directory `/`.
2. In **Settings → Bindings**, confirm the production KV binding `SCHOOL_IP_KV` points to the existing namespace (do not create a duplicate).
3. If deployment fails, inspect and share the error lines **after** the Wrangler banner.
4. **No live website routes are added by this repository.** An existing `vynalth-cloudflare-edge` Worker may already own routes across the websites. Migrate/integrate its handler deliberately; do not attach a competing Worker to the same hostname/route.
5. Until routing/integration is completed, the standalone Worker only offers the harmless `/health` endpoint on workers.dev.

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

The exported `schoolGuard()` can be composed into your existing `vynalth-cloudflare-edge` entrypoint. This is the **recommended approach** if that Worker already owns a hostname/route; do not attach a competing Worker to the same route.

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


## After deployment: verify the Worker

1. Open Cloudflare → Workers & Pages → **website-block-by-school-powiis** → **Deployments** and confirm the latest GitHub commit completed successfully.
2. Open the Worker's **workers.dev** URL (shown by Cloudflare) and add `/health` to it. A healthy bound deployment returns JSON similar to `{"ok":true,"service":"website-block-by-school-powiis","mode":"observe","kvBound":true}`.
3. Check **Settings → Bindings** for **SCHOOL_IP_KV** linked to a KV namespace. `kvBound:true` only checks binding availability; it does not prove a successful KV write.
4. The health endpoint runs on workers.dev and does not write visitor IPs. The candidate IP observation runs only on routed supported hostnames and GET root requests; **no live zone routes are installed automatically**.
5. **Do not change MODE to enforce before reviewing any manually blocked IPs and confirming the account/route impact.**

## KV keys / manually blocking

Observed candidate IPs are automatically stored only after a root-page visit:

- observed:60.49.64.83
- observed:60.51.219.195
- observed:60.51.219.225

### Manage KV in Cloudflare dashboard (easiest)

Open Workers & Pages → website-block-by-school-powiis → **Settings → Bindings** and follow its KV namespace to view keys. This avoids needing the namespace ID in your local config.

### Manage the existing KV using Wrangler CLI

The KV namespace is already bound in `wrangler.jsonc`. **Run commands from the repository directory**, signed into the correct Cloudflare account. The commands below use the configured binding, not a new namespace.

List observed candidates (only populated after successful routing and a qualifying visit):

~~~sh
npx wrangler kv key list --binding SCHOOL_IP_KV --prefix "observed:" --remote
~~~

Only after verifying that a public IP is appropriate to block and understanding shared-IP collateral impact, manually add a block record:

~~~sh
npx wrangler kv key put "blocked:60.49.64.83" "manual-review" --binding SCHOOL_IP_KV --remote
~~~

Undo a manually added block record:

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

## Recommended live routing architecture

**Seven public domains → vynalth-cloudflare-edge (existing routes) → SCHOOL_POLICY Service Binding → this policy Worker → SCHOOL_IP_KV.**

The policy Worker intentionally has **no Custom Domains or zone Routes**. Attaching it directly to an apex hostname would replace an existing application origin. The existing Edge Worker owns the HTTP routes and delegates only the IP decision via the private Cloudflare Service Binding. A policy result of HTTP 204 means continue normal origin handling. HTTP 403 with `X-School-Policy: blocked` means block; unexpected responses and transient service-binding failures fail open to protect site availability.

Ensure Cloudflare runs both Workers in the **same account**, and that the existing Edge Worker has a Service Binding named `SCHOOL_POLICY` pointing to service `website-block-by-school-powiis`. The Edge Worker's `wrangler.toml` is the source of truth for this binding and for the domain Routes. Do not add separate routes for the policy Worker. The existing Edge Worker adds `.si` routes to the five original zones, resulting in seven zone configurations. DNS must be proxied to Cloudflare for the routes to take effect.


## Public student reporting at `/block-ip`

**Public URL:** https://website-block-by-school-powiis.ongyuze1401.workers.dev/block-ip

- `GET /` redirects to `/block-ip`. `GET /block-ip` displays a multilingual student-facing explanation and **does not record an IP**.
- The student must be on a network they are authorized to use, read that a shared IP may later be restricted for other people, and **explicitly consent** to the opt-in submission.
- `POST /block-ip` takes only `{"consent":true,"schoolWifiConfirmed":true}` in JSON. The IP comes from the Cloudflare-set `CF-Connecting-IP` header, never from client body/query/X-Forwarded-For. The reported Wi-Fi connection is a **self-declaration, not proof of school affiliation**.
- KV key is `student-report:<public IPv4>`, value contains only IP, first-seen time, source and unverified review state. KV TTL is **72 hours**.
- Multiple reports from the same shared egress IP do not create duplicate writes or extend TTL.
- No public route can list KV candidates, create `blocked:` keys, enable enforcement, or invoke Cloudflare APIs. A report is **NOT a block**, and `MODE=observe` remains the default.
- In Cloudflare → KV → namespace `website-block-by-school-powiis-school-ip-kv`, filter keys by `student-report:` to review submitted candidates. Reverify IP ownership/accuracy independently before considering a separate manual restricted-access action; do not assume the school's ownership from visitor claims.
- The Worker must be deployed with the latest GitHub code before the webpage becomes available. A GitHub commit alone is not proof the Cloudflare production Worker has been updated.
- This page is **not official POWIIS school infrastructure**, does not request students' names, passwords or device identifiers, and informs visitors that their IP/time may be considered for future shared-network site access restrictions.

### Test

```bash
npm install
node --test test/student-report.test.js
npm test
```



### /block-ip public-IP error diagnostics

The public reporting page supports Cloudflare-observed globally routable IPv4 **and IPv6**. Cloudflare may deliver IPv6 to the Worker directly. If the Cloudflare Pseudo IPv4 configuration overwrites CF-Connecting-IP with a synthetic Class E IPv4, the page uses CF-Connecting-IPv6 for the real IPv6 address instead. **Do not use X-Forwarded-For, X-Real-IP or user input as substitute evidence**.

If a visitor receives `PUBLIC_IP_UNAVAILABLE`, open `https://website-block-by-school-powiis.ongyuze1401.workers.dev/ip-status`. This GET response never includes the visitor IP, only:
- `publicIpAvailable: true` and `family: "ipv4" / "ipv6"` when valid.
- `reason: "cf_header_missing"` if Cloudflare did not supply CF-Connecting-IP.
- `reason: "nonpublic_or_unsupported"` if it was reserved, synthetic without original IPv6, or an internal cross-zone Worker IP.

If `cf_header_missing`, inspect Cloudflare's **Remove visitor IP headers** Managed Transform, Workers subrequest chain, and placement of the public route; correct the server-side configuration, not the user's browser. Never make an unauthorized request to obtain another person's IP or accept browser-submitted IP claims. The `/ip-status` endpoint has no write permission and its responses are no-store.

The submit endpoint does **not** create `blocked:IP` keys. The separate internal policy service currently applies restrictions only to manually confirmed IPv4 entries with MODE=enforce; recording an IPv6 report does not automatically enable IPv6 access restrictions.

