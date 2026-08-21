/** @type {import('next').NextConfig} */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const projectRoot = dirname(fileURLToPath(import.meta.url));
// Static export. The App Router is used as specified, but the build emits plain
// files that src/server/index.ts serves — so the demo stays ONE process on one
// port instead of a Next server plus an API server. There are no route handlers
// and no SSR here: the Node server is the API, and this is the client.
const nextConfig = {
  output: "export",
  distDir: "out",
  images: { unoptimized: true },
  trailingSlash: true,
  outputFileTracingRoot: projectRoot,
};

// `next dev` used to write into the same out/ the export emits, so a dev server
// running while anyone built corrupted the served bundle — routes-manifest.json
// vanished mid-request and every route 500'd. Dev gets its own directory; the
// artefact the Node server reads stays exactly where it expects it.
export default (phase) =>
  phase === PHASE_DEVELOPMENT_SERVER ? { ...nextConfig, distDir: ".next-dev" } : nextConfig;
