// securityHeaders.js — the standard HTTP security headers (helmet), set on every response.
//
// What the API serves is JSON, so its content policy is the strictest there is: nothing may be loaded or run from a response, and
// it cannot be put in a frame. Two things differ:
//   - the Swagger page (/api-docs) is a web app, so it gets a looser (but still script-restricting) content policy, see below;
//   - the alert confirm / cancel pages (routes/alertPages.routes.js) send their own, nonce-based policy, which replaces this one.
//
// The Swagger page (/api-docs) loads only its own scripts from this server and needs inline styles, so it gets a policy that allows exactly that
// (scripts from this origin only, no inline script, connections to this origin only) instead of none.
//
// Cross-origin resource policy is "cross-origin" because the frontend runs on another origin and reads this API from the browser
// (config/cors.js decides which origins may); same-origin would block nothing a fetch needs but would break images and embeds later.
// HSTS (helmet's default) only has an effect over https, so it is harmless in local development and applies when deployed.

import helmet from "helmet";

const common = { crossOriginResourcePolicy: { policy: "cross-origin" }, referrerPolicy: { policy: "no-referrer" } };

/** For every response except the Swagger page. */
export const apiHeaders = helmet({
  ...common,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: { defaultSrc: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"], frameAncestors: ["'none'"] },
  },
});

/** For the Swagger page: scripts only from this origin, inline styles allowed, calls only back to this origin. */
export const apiDocsHeaders = helmet({
  ...common,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
});
