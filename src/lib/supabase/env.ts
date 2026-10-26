/**
 * GeriCare · Lectura BLINDADA de las variables de entorno de Supabase.
 * =====================================================================
 * CAÍDA DE ORIGEN DEL ERROR «invalid key» / «invalid url»:
 *
 * Next.js sustituye `process.env.NEXT_PUBLIC_*` por su valor LITERAL en el
 * momento de compilar/bundlear (DefinePlugin en Webpack, reescritura estática
 * en Turbopack). Solo se inlinean las referencias ESCRITAS TAL CUAL:
 *
 *    ✅  process.env.NEXT_PUBLIC_SUPABASE_URL      → "https://xyz.supabase.co"
 *    ❌  const e = process.env; e.NEXT_PUBLIC_...   → undefined (no se inlines)
 *    ❌  process.env[claveVariable]                 → undefined
 *
 * Si además la variable llega vacía/ausente, el valor queda como `undefined` y
 * `@supabase/ssr` intenta construir la URL (`new URL(undefined)`) o enviar el
 * header `apikey: undefined`, y el edge/proxy de Supabase responde con
 * `{"error":"invalid key"}` o `{"error":"Invalid URL (invalid url)"}` — que es
 * exactamente el síntoma observado, independiente de que `.env.local` exista.
 *
 * Este módulo centraliza la lectura con:
 *  1. Referencias literales a `process.env.*` (únicas inlinables en cliente).
 *  2. Normalización defensiva: recorta espacios, comillas sobrantes, quita la
 *     barra final de la URL y detecta placeholders típicos («xxxx», «tu-…»).
 *  3. Fail-fast con mensaje ACCIONABLE en lugar de dejar pasar `undefined`
 *     al constructor de Supabase.
 */

export interface ConfigSupabase {
  url: string
  anonKey: string
}

/** Claves canónicas (documentación oficial de Supabase para Next.js App Router). */
const NOMBRE_URL = 'NEXT_PUBLIC_SUPABASE_URL'
const NOMBRE_KEY = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'

/**
 * Diagnóstico en texto plano de la configuración de Supabase.
 * Devuelve `null` si TODO es correcto; si hay algún problema, devuelve un
 * mensaje detallado y ACCIONABLE sin exponer el valor completo de las claves
 * (solo prefijos/pistas suficientes para identificar el error).
 *
 * Detecta explícitamente:
 *  (a) variables undefined/ausentes,
 *  (b) URL con barra final o mal formada,
 *  (c) claves `sb_secret_…` (secret key: prohibida en el navegador),
 *  (d) JWT legacy cuyo payload decodificado lleva `role=service_role`,
 *  (e) claves vacías o con espacios/comillas accidentales.
 */
export function diagnosticarConfigSupabase(): string | null {
  // ⚠️ Referencias LITERALES obligatorias: Turbopack/Webpack solo inlinean
  // `process.env.NEXT_PUBLIC_*` escritos tal cual en el código fuente.
  const urlBruto = process.env.NEXT_PUBLIC_SUPABASE_URL
  const keyBruta = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const problemas: string[] = []

  /* ---- (a) y (e): variables ausentes o vacías ------------------------ */
  if (typeof urlBruto !== 'string' || urlBruto.trim().length === 0) {
    problemas.push(
      `${NOMBRE_URL} está ${urlBruto === undefined ? 'undefined (no existe en el entorno)' : 'vacía'}. ` +
        'Crea .env.local en la RAÍZ del proyecto (no dentro de /src).',
    )
  }
  if (typeof keyBruta !== 'string' || keyBruta.trim().length === 0) {
    problemas.push(
      `${NOMBRE_KEY} está ${keyBruta === undefined ? 'undefined (no existe en el entorno)' : 'vacía'}. ` +
        'Copia la «publishable key» (sb_publishable_…) o la anon key JWT desde Dashboard → Settings → API Keys.',
    )
  }
  if (problemas.length > 0) return problemas.join(' | ')

  const url = limpiar(urlBruto)
  const key = limpiar(keyBruta)

  /* ---- (b): URL mal formada ------------------------------------------- */
  if (!/^https?:\/\//.test(url)) {
    problemas.push(`${NOMBRE_URL} debe empezar por https:// (actual: "${url.slice(0, 32)}").`)
  } else {
    try {
      new URL(url)
    } catch {
      problemas.push(`${NOMBRE_URL} no parsea como URL válida.`)
    }
    if (/\/$/.test(url)) {
      problemas.push(
        `${NOMBRE_URL} termina en «/»; aunque @supabase/ssr lo tolera, guárdala sin barra final para evitar duplicados "//rest/v1".`,
      )
    }
    if (esPlaceholder(url)) {
      problemas.push(`${NOMBRE_URL} contiene un placeholder de ejemplo, no un Project URL real.`)
    }
  }

  /* ---- (c): secret key expuesta en NEXT_PUBLIC_* ---------------------- */
  if (key.startsWith('sb_secret_')) {
    problemas.push(
      `${NOMBRE_KEY} empieza por «sb_secret_»: es la SECRET KEY (service_role encubierta). ` +
        'JAMÁS va en una variable NEXT_PUBLIC_ ni en el navegador — cualquier visitante podría extraerla. ' +
        'Usa la publishable key (sb_publishable_…). Y ROTA esa secret key ya que parece haberse filtrado.',
    )
  }

  /* ---- (d): JWT legacy con role=service_role -------------------------- */
  const partes = key.split('.')
  if (partes.length === 3 && partes.every((p) => p.length > 0)) {
    try {
      const payload = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
        role?: string
        ref?: string
      }
      if (payload.role === 'service_role') {
        problemas.push(
          'La anon key configurada es un JWT legacy con role=service_role: es una clave PRIVILEGIADA que ' +
            'bypass total de RLS. No debe exponerse en el frontend (NEXT_PUBLIC_*). Sustitúyela por la ' +
            '«publishable/anon key». Nota: si rotaste las JWT Keys del proyecto, esta clave legacy además ' +
            'ya fue revocada y Supabase responde «invalid key».',
        )
      }
      if (url.startsWith('https://') && payload.ref && /^[a-z0-9]{15,25}$/.test(payload.ref)) {
        const projectRef = url.replace(/^https:\/\//, '').split('.')[0]
        if (projectRef !== payload.ref) {
          problemas.push(
            `La URL apunta al proyecto «${projectRef}» pero la clave pertenece a «${payload.ref}»: ` +
              'URL y clave de proyectos DISTINTOS → Supabase responde «invalid key».',
          )
        }
      }
    } catch {
      /* payload no decodificable: se valida abajo con el check de formato */
    }
  } else if (!key.startsWith('sb_publishable_')) {
    problemas.push(
      `${NOMBRE_KEY} no tiene un formato reconocido (ni JWT de 3 segmentos, ni «sb_publishable_…»): ` +
        'revisa el copiado desde el Dashboard (sin comillas, espacios ni saltos de línea).',
    )
  }

  if (key.length > 0 && /\s/.test(String(keyBruta))) {
    problemas.push(`${NOMBRE_KEY} contiene espacios en blanco: error típico de copiado desde el Dashboard.`)
  }

  return problemas.length > 0 ? problemas.join(' | ') : null
}

/** Quita espacios y comillas accidentales (`"..."` / `'...'`) del borde del valor. */
function limpiar(valor: string | undefined): string {
  if (typeof valor !== 'string') return ''
  let v = valor.trim()
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1).trim()
  }
  // Las claves JWT/publishable jamas llevan espacios interiores: si aparecen,
  // es un error de copiado desde el Dashboard (se rompen la firma al enviarlas).
  return v.replace(/\s+/g, '')
}

/** Determina si una cadena es un valor de relleno/ejemplo, no un secreto real. */
function esPlaceholder(valor: string): boolean {
  const t = valor.toLowerCase()
  return (
    t.includes('xxxx') ||
    t.includes('tu-proyecto') ||
    t.includes('your-project') ||
    t.includes('your_project') ||
    t.includes('example.com') ||
    t.includes('reemplaza') ||
    t.includes('placeholder') ||
    /^<[a-z_-]+>$/.test(t)
  )
}

/**
 * Devuelve la configuración validada o lanza un error descriptivo (sin exponer
 * secretos) que el usuario verá en el terminal / UI de errores de Next.js.
 */
export function obtenerConfigSupabase(): ConfigSupabase {
  // ⚠️ Mantener SIEMPRE la forma literal `process.env.NEXT_PUBLIC_*`.
  const url = limpiar(process.env[NOMBRE_URL])
  const anonKey = limpiar(process.env[NOMBRE_KEY])

  const faltantes: string[] = []
  if (url.length === 0) faltantes.push(NOMBRE_URL)
  if (anonKey.length === 0) faltantes.push(NOMBRE_KEY)

  if (faltantes.length > 0) {
    throw new Error(
      `[GeriCare] Faltan las variables de entorno de Supabase: ${faltantes.join(', ')}. ` +
        'Defínelas en .env.local (raíz del proyecto, NO dentro de /src) y reinicia ' +
        '`next dev` (los cambios en NEXT_PUBLIC_* exigen reinicio y/o borrar .next).',
    )
  }

  if (esPlaceholder(url) || esPlaceholder(anonKey)) {
    throw new Error(
      `[GeriCare] ${NOMBRE_URL}/${NOMBRE_KEY} contienen un valor de ejemplo (placeholder). ` +
        'Copia los valores reales desde Supabase → Project Settings → API Keys.',
    )
  }

  if (!url.startsWith('http://localhost:') && !url.startsWith('https://')) {
    throw new Error(
      `[GeriCare] ${NOMBRE_URL} debe empezar por https:// (valor actual: "${url.slice(0, 24)}…"). ` +
        'Ej.: https://abcdefghijklm.supabase.co',
    )
  }

  try {
    // Esto es precisamente lo que revienta dentro de supabase-js con un
    // `undefined`; aquí lo detectamos antes con un mensaje útil.
    new URL(url)
  } catch {
    throw new Error(`[GeriCare] ${NOMBRE_URL} no es una URL válida: "${url.slice(0, 40)}".`)
  }

  // Una publishable/anon key siempre decodifica como JWT de 3 partes.
  const partes = anonKey.split('.')
  const pareceJwt = partes.length === 3 && partes.every((p) => p.length > 0)
  const esPublishableV2 = anonKey.startsWith('sb_publishable_')
  if (!pareceJwt && !esPublishableV2) {
    throw new Error(
      `[GeriCare] ${NOMBRE_KEY} no tiene pinta de clave de Supabase (JWT de 3 segmentos o ` +
        '«sb_publishable_…»).' +
        (anonKey.startsWith('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.')
          ? ' OJO: estás usando la ANCESTRAL clave `service_role` hardcodeada de los tutoriales: ' +
            'esa clave NUNCA va en el navegador ni en NEXT_PUBLIC_* (fuga total de seguridad) y ' +
            'Supabase la rechaza con «invalid key». Usa la «publishable key» / anon key de tu proyecto.'
          : ' Verifica el copiado (sin espacios, sin saltos de línea, sin comillas).'),
    )
  }

  return { url: url.replace(/\/+$/, ''), anonKey }
}

/** Versión «segura» para contextos donde no se desea lanzar (devuelve null). */
export function configSupabaseOpcional(): ConfigSupabase | null {
  try {
    return obtenerConfigSupabase()
  } catch {
    return null
  }
}
