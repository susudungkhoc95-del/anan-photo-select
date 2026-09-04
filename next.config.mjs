/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for the Cloud Run container. Vercel continues to deploy the
  // same app normally; this only adds a portable standalone server bundle.
  output: "standalone"
};

export default nextConfig;
