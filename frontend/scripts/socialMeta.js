// socialMeta.js — the site's own link preview tags that need its full address, written at build time (see vite.config.js).
//
// index.html carries the fixed Open Graph tags (name, title, description). A preview's picture and canonical address must be full
// addresses ("https://shopsavvy.example/og-image.png"): WhatsApp and Facebook do not resolve "/og-image.png" against the page. The
// site's address is known only at build time, from SITE_URL; without it (local development) these tags are left out, and a
// preview shows the text alone. A product's own card comes from the API's share page (backend/src/services/sharePage.service.js).

const IMAGE = "/og-image.png"; // public/og-image.png, 1200 x 630

/** The site's address without a trailing slash, or null when SITE_URL is not a full http(s) address. */
export function siteAddress({ SITE_URL } = {}) {
  try {
    const url = new URL(String(SITE_URL ?? "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** The tags to add to index.html's head ("" without a site address). */
export function socialTags(env = {}) {
  const site = siteAddress(env);
  if (!site) return "";
  return [
    `<meta property="og:url" content="${site}/" />`,
    `<meta property="og:image" content="${site}${IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:image" content="${site}${IMAGE}" />`,
  ].map((tag) => `    ${tag}\n`).join("");
}

/** A Vite plugin that adds them before </head>. */
export function socialMetaPlugin(env) {
  const tags = socialTags(env);
  return {
    name: "shopsavvy-social-meta",
    transformIndexHtml: (html) => (tags ? html.replace("</head>", `${tags}  </head>`) : html),
  };
}
