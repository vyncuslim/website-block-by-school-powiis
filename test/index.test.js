import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

test("workers.dev /health reports KV binding, does not log IPs", async () => {
  const calls = [];
  const kv = { async get(key) { calls.push(key); return null; } };
  const request = new Request(
    "https://website-block-by-school-powiis.example.workers.dev/health",
    { headers: { "CF-Connecting-IP": "60.49.64.83" } }
  );
  const response = await worker.fetch(
    request,
    { MODE: "observe", SCHOOL_IP_KV: kv },
    { waitUntil() { throw new Error("unexpected background work"); } }
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data, {
    ok: true,
    service: "website-block-by-school-powiis",
    policyProtocol: "internal-204-v1",
    mode: "observe",
    kvBound: true
  });
  assert.deepEqual(calls, []);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("workers.dev non-health request is 404 without origin self-fetch", async () => {
  const response = await worker.fetch(
    new Request("https://website-block-by-school-powiis.example.workers.dev/"),
    { MODE: "observe" },
    {}
  );
  assert.equal(response.status, 404);
});

test("missing KV is reported on /health but does not create one", async () => {
  const response = await worker.fetch(
    new Request("https://website-block-by-school-powiis.example.workers.dev/health"),
    { MODE: "observe" },
    {}
  );
  assert.equal((await response.json()).kvBound, false);
});


test("internal Service Binding request checks policy without forwarding to an origin", async () => {
  const writes = [];
  const kv = {
    async get() { return null; },
    async put(key, value, opts) { writes.push({ key, value, opts }); }
  };
  const wait = [];
  const response = await worker.fetch(
    new Request("https://vyncuslim.com/", {
      headers: { "X-Vynalth-Policy-Client-IP": "60.49.64.83" }
    }),
    { MODE: "observe", SCHOOL_IP_KV: kv },
    { waitUntil(p) { wait.push(p); } }
  );
  await Promise.all(wait);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("X-School-Policy"), "allow");
  assert.equal(writes[0].key, "observed:60.49.64.83");
});

test("internal manual KV block returns a tagged 403 only in enforce mode", async () => {
  const kv = {
    async get(key) { return key === "blocked:60.49.64.83" ? "manual-review" : null; },
    async put() {}
  };
  const request = new Request("https://vynalthai.si/login", {
    headers: { "X-Vynalth-Policy-Client-IP": "60.49.64.83" }
  });
  const ctx = { waitUntil() {} };
  const obs = await worker.fetch(request, { MODE: "observe", SCHOOL_IP_KV: kv }, ctx);
  assert.equal(obs.status, 204);
  const denied = await worker.fetch(request, { MODE: "enforce", SCHOOL_IP_KV: kv }, ctx);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("X-School-Policy"), "blocked");
});

test("missing internal source header never reads a blocklist", async () => {
  const kv = { async get() { throw Error("KV must not be accessed"); } };
  const response = await worker.fetch(new Request("https://vyncuslim.com/"), {
    MODE: "enforce", SCHOOL_IP_KV: kv
  }, {});
  assert.equal(response.status, 204);
});
