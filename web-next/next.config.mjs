/** @type {import('next').NextConfig} */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
export default nextConfig;
