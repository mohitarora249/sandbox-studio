/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Keep Dockerode and its optional SSH/native dependencies on the Node.js server.
  // These packages are not intended to be bundled into browser-facing code.
  serverExternalPackages: ["dockerode"],
  // The app executes on a trusted machine and needs the Docker socket only on the server.
  // No Docker client code is imported by browser components.
};

export default nextConfig;
