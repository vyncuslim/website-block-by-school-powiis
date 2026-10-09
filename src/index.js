import { schoolGuard } from "./policy.js";

// Standalone Worker, suitable for a regular Cloudflare route over an origin.
// Do NOT put this route on top of an existing Worker without migrating or
// composing that Worker's existing handler. See README.
export default {
  async fetch(request, env, ctx) {
    return schoolGuard(request, env, ctx, () => fetch(request));
  }
};
