import type { MetadataRoute } from 'next'

/**
 * GeriCare · FASE 7 — Manifiesto PWA (preparación).
 * Permite "Agregar a pantalla de inicio" en Android/iOS para la vista móvil
 * del auxiliar. Sin service worker propio: Next.js gestiona el offline de
 * assets vía su cache; la app sigue necesitando sesión para mutar datos.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GeriCare · Cuidado geriátrico',
    short_name: 'GeriCare',
    description:
      'Ejecución de tareas de cuidado y registro de signos vitales para auxiliares de enfermería.',
    lang: 'es',
    start_url: '/auxiliar',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#0f766e',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
