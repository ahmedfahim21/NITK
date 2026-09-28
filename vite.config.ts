import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Link previews: Open Graph and Twitter tags for public/og.png (a text-free
 * illustration, rendered from public/og.svg by `npm run og:render`).
 * Crawlers want an absolute image URL: the production site by default,
 * or VITE_SITE_URL (a preview deployment, say).
 */
const SITE_URL = "https://nitk-world.vercel.app";

function openGraph(siteUrl: string): Plugin {
  return {
    name: "nitk-open-graph",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const base = siteUrl.replace(/\/+$/, "");
        const image = `${base}/og.png`;
        const tags = [
          `<meta property="og:type" content="website" />`,
          `<meta property="og:title" content="NITK World" />`,
          `<meta property="og:description" content="Walk the NITK Surathkal campus in 3D, built from OpenStreetMap." />`,
          `<meta property="og:url" content="${base}/" />`,
          `<meta property="og:image" content="${image}" />`,
          `<meta property="og:image:width" content="1200" />`,
          `<meta property="og:image:height" content="630" />`,
          `<meta property="og:image:alt" content="A red and white lighthouse on a green knoll sends a gold beam over the sea at sunset, with the campus towers on the plateau behind." />`,
          `<meta name="twitter:card" content="summary_large_image" />`,
          `<meta name="twitter:image" content="${image}" />`,
        ];
        return html.replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    base: "./",
    build: { chunkSizeWarningLimit: 2000 },
    plugins: [openGraph(env.VITE_SITE_URL || SITE_URL)],
  };
});
