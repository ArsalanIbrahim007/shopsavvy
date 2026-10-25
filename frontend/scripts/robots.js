// robots.js — the site's robots.txt, written at build time (see vite.config.js; kept in scripts/, as build/ is ignored by git) so it can name the sitemap.
//
// The sitemap is built from live data by the API (GET /sitemap.xml, backend/src/services/sitemap.service.js), so it lives on
// the API's host. The sitemaps protocol accepts that when the site's own robots.txt names it, and robots.txt needs a full
// address: SITEMAP_URL when set, else the API's origin from VITE_API_URL (https://api.shopsavvy.example/api ->
// https://api.shopsavvy.example/sitemap.xml). With neither (a relative API address, or local development) the line is left out.

/** The sitemap's full address, or null. */
export function sitemapAddress({ SITEMAP_URL, VITE_API_URL } = {}) {
  for (const candidate of [SITEMAP_URL, VITE_API_URL]) {
    try {
      const url = new URL(String(candidate ?? "").trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      return candidate === SITEMAP_URL ? url.href : `${url.origin}/sitemap.xml`;
    } catch {
      // not a full address: try the next
    }
  }
  return null;
}

/** The text of robots.txt: every crawler may read every page, and where the sitemap is. */
export function robotsTxt(env = {}) {
  const sitemap = sitemapAddress(env);
  return `User-agent: *\nAllow: /\n${sitemap ? `\nSitemap: ${sitemap}\n` : ""}`;
}

/** A Vite plugin that writes robots.txt into the build, and serves it in development. */
export function robotsPlugin(env) {
  const text = robotsTxt(env);
  return {
    name: "shopsavvy-robots",
    configureServer(server) {
      server.middlewares.use("/robots.txt", (req, res) => {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(text);
      });
    },
    generateBundle() {
      if (!sitemapAddress(env)) {
        this.warn("robots.txt has no Sitemap line: set VITE_API_URL to the API's full address (or SITEMAP_URL) for a deployed build.");
      }
      this.emitFile({ type: "asset", fileName: "robots.txt", source: text });
    },
  };
}
