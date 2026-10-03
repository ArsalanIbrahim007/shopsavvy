// securityHeaders.js — the standard HTTP security headers (helmet), set on every response.
//
// What the API serves is JSON, so its content policy is the strictest there is: nothing may be loaded or run from a response, and
// it cannot be put in a frame. Two things differ:
//   - the Swagger page (/api-docs) is a web app that needs inline scripts and styles, so it gets the other headers without a content policy;
//   - the alert confirm / cancel pages (routes/alertPages.routes.js) send their own, nonce-based policy, which replaces this one.
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

/** For the Swagger page: everything but the content policy. */
export const apiDocsHeaders = helmet({ ...common, contentSecurityPolicy: false });
