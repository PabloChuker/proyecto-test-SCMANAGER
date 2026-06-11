import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Plugins de Umbra: cada plugin vive bajo /plugins/<nombre>/ (su
  // umbra-plugin.json es estático en public/). El entry "index.html" de cada
  // manifest se reescribe a la ruta /embed/ correspondiente, manteniendo la
  // base del plugin para que icono y assets relativos resuelvan bien.
  async rewrites() {
    return [
      { source: "/plugins/quantum-intercept/index.html", destination: "/embed/quantum-intercept" },
      { source: "/plugins/pyro-timers/index.html", destination: "/embed/timers" },
    ];
  },
};

export default withNextIntl(nextConfig);
