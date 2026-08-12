import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `standalone` traces the exact files the server needs and copies them into
   * .next/standalone, so the Docker image carries a runtime instead of the
   * whole node_modules tree — a few hundred megabytes of difference.
   *
   * Gated on an env var rather than set unconditionally: Vercel builds this
   * app too, and there is no reason to change the output shape of a deploy
   * that already works. Docker sets DOCKER_BUILD=1; Vercel does not.
   */
  ...(process.env.DOCKER_BUILD ? { output: "standalone" as const } : {}),
};

export default nextConfig;
