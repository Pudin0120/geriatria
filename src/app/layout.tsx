import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: 'GeriCare · Cuidado geriátrico integral',
    template: '%s · GeriCare',
  },
  description:
    'Plataforma de gestión clínica para residencias de adultos mayores: valoración geriátrica integral, planes de cuidado, medicación y auditoría de accesos.',
  // Preparación PWA (Fase 7): tema visual y modo standalone para "Agregar a pantalla de inicio".
  manifest: '/manifest.webmanifest',
  themeColor: '#0f766e',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'GeriCare',
  },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  )
}
