import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    // Cabeceras de seguridad endurecidas para toda la aplicación (GeriCare
    // maneja datos clínicos protegidos; se aplica defensa en profundidad
    // además de la RLS y la validación de sesiones en servidor).
    return [
      {
        source: '/:path*',
        headers: [
          // Impide que la app se incruste en iframes (anti clickjacking).
          { key: 'X-Frame-Options', value: 'DENY' },
          // Evita que el navegador infiera (y ejecute) un MIME type distinto.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // No filtra URLs completas a terceros en la cabecera Referer.
          { key: 'Referrer-Policy', value: 'same-origin' },
          // Deniega cámara, micrófono y geolocalización por defecto.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
};

export default nextConfig;
