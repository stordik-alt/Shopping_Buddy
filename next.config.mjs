/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      // Receipt photo/PDF upload (uploadReceiptAction) sends the file as a base64 string inside the
      // action request. The upload cap is 10 MB of raw bytes (MAX_IMAGE_BYTES in
      // app/actions/receipts.ts); base64 inflates that by ~4/3 (~13.4 MB) plus a little request
      // overhead. Next's 1 MB default would reject a normal phone photo before the action runs.
      bodySizeLimit: '15mb',
    },
  },
}

export default nextConfig
