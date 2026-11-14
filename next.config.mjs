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
    const rules = [
      { source: "/plugins/quantum-intercept/index.html", destination: "/embed/quantum-intercept" },
      { source: "/plugins/pyro-timers/index.html", destination: "/embed/timers" },
    ];
    // Solo para desarrollo local: el bucket R2 de los modelos 3D acepta CORS
    // únicamente desde https://sclabs.space, así que en localhost los GLB se
    // bloquean y el visor cae a la silueta genérica. Si GLB_DEV_PROXY está
    // definida (en .env.local), /glb-dev/* se sirve pasando por el server de
    // Next y el navegador no hace el pedido cruzado. En producción la variable
    // no existe y esta regla no se agrega.
    if (process.env.GLB_DEV_PROXY) {
      rules.push({
        source: "/glb-dev/:path*",
        destination: `${process.env.GLB_DEV_PROXY.replace(/\/$/, "")}/:path*`,
      });
    }
    return rules;
  },
};

export default withNextIntl(nextConfig);
