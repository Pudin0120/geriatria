import { redirect } from 'next/navigation'

/**
 * Raíz de GeriCare: el panel protegido es el punto de entrada natural.
 * El proxy ya redirige a /dashboard si hay sesión; este redirect cubre
 * el renderizado directo (bot, pre-render, etc.).
 */
export default function Home() {
  redirect('/login')
}
