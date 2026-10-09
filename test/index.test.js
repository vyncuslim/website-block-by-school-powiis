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
