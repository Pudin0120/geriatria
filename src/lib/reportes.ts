/**
 * GeriCare · Fase 5 — Tipos de dominio para reportes, auditoría y alertas.
 *
 * Todos los modelos de agregación que devuelven las Server Actions de
 * reportes viven aquí (cero `any`, tipado estricto). Se mantienen en un
 * módulo sin directiva `'use server'` para poder importarlos tanto desde
 * Server Components como desde Client Components.
 */

import type {
  AccessLogRow,
  ExecutionOutcome,
  FrailtyLevel,
  ResidentStatus,
} from '@/types'

/* ================================================================== */
/* Tono semafórico compartido por KPIs, gráficos y alertas             */
/* ================================================================== */

export type Tone = 'emerald' | 'amber' | 'rose' | 'sky' | 'slate'

/* ================================================================== */
/* getDashboardMetrics                                                 */
/* ================================================================== */

export interface DistribucionHabitacion {
  habitacion: string
  residentes: number
}

export interface DistribucionEstado {
  estado: ResidentStatus
  etiqueta: string
  cantidad: number
}

export interface DistribucionFragilidad {
  nivel: FrailtyLevel
  etiqueta: string
  cantidad: number
}

export interface DashboardMetrics {
  /** Fecha local del corte de métricas (YYYY-MM-DD). */
  fecha: string
  totalResidentes: number
  residentesActivos: number
  /** % sobre el total histórico; null si no hay residentes cargados. */
  ocupacionPct: number | null
  distribucionHabitaciones: DistribucionHabitacion[]
  distribucionEstados: DistribucionEstado[]
  distribucionFragilidad: DistribucionFragilidad[]
  tareasProgramadasHoy: number
  tareasCompletadasHoy: number
  /** Ejecuciones omitidas/canceladas registradas hoy. */
  tareasNoRealizadasHoy: number
  /** Porcentaje de adherencia a las tareas ejecutadas hoy (0-100); null si no hay ejecuciones. */
  adherenciaTareasHoyPct: number | null
  tomasMedicacionHoy: number
  administradasHoy: number
  /** Reacciones adversas registradas hoy. */
  reaccionesAdversasHoy: number
}

/* ================================================================== */
/* getResidentStats                                                    */
/* ================================================================== */

export interface VgiEvolucionPunto {
  fecha: string
  barthel: number | null
  mmse: number | null
  fragilidad: FrailtyLevel | null
}

export interface ResidenteRiesgo {
  id: string
  nombre: string
  habitacion: string | null
  barthel: number | null
  mmse: number | null
  fragilidad: FrailtyLevel | null
  /** Días transcurridos desde su última valoración VGI; null si nunca fue valorado. */
  diasDesdeUltimaVgi: number | null
}

export interface ResidentStats {
  residenteId: string
  vgiHistorial: VgiEvolucionPunto[]
  /** Último Barthel registrado. */
  ultimoBarthel: number | null
  /** Delta respecto a la VGI anterior (positivo = mejora). */
  deltaBarthel: number | null
  ultimoMmse: number | null
  deltaMmse: number | null
  /** Ventana del cálculo de adherencia (días). */
  adherenciaDias: number
  ejecucionesCompletadas: number
  ejecucionesOmitidas: number
  /** % completadas sobre total de ejecuciones del periodo; null si no hubo. */
  adherenciaPct: number | null
  eventosAdversosTotal: number
  eventosAdversos30dias: number
  planesActivos: number
  medicacionesActivas: number
}

/* ================================================================== */
/* getAuditLogs                                                        */
/* ================================================================== */

export interface AuditFilters {
  userId?: string
  /** Inicio del rango, inclusivo (timestamp ISO). */
  desde?: string
  /** Fin del rango, inclusivo (timestamp ISO). */
  hasta?: string
  action?: string
  entityType?: string
  page?: number
  pageSize?: number
}

export interface AuditLogEntryView extends AccessLogRow {
  /** Nombre legible del usuario (NULL si no está disponible). */
  userName: string | null
}

export interface AuditPage {
  logs: AuditLogEntryView[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/* ================================================================== */
/* AlertBanner                                                         */
/* ================================================================== */

export type AlertLevel = 'critico' | 'advertencia' | 'info'

export interface ClinicalAlert {
  id: string
  level: AlertLevel
  titulo: string
  detalle: string
  href: string | null
}

export interface AlertSummary {
  generatedAt: string
  alerts: ClinicalAlert[]
  urgentesSinCompletar: number
  medicacionesPendientes: number
  signosFueraDeRango: number
}

/* ================================================================== */
/* Umbrales clínicos de signos vitales (para alertas)                  */
/* ================================================================== */

interface RangoVital {
  min: number
  max: number
  etiqueta: string
}

/** Rangos normales admitidos; fuera de ellos se genera alerta. */
export const RANGOS_SIGNOS_VITALES: Readonly<Record<'frecuencia_cardiaca' | 'temperatura' | 'saturacion_oxigeno' | 'glucemia', RangoVital>> = {
  frecuencia_cardiaca: { min: 50, max: 100, etiqueta: 'Frecuencia cardiaca' },
  temperatura: { min: 35.5, max: 37.8, etiqueta: 'Temperatura' },
  saturacion_oxigeno: { min: 92, max: 100, etiqueta: 'Saturación de O₂' },
  glucemia: { min: 70, max: 180, etiqueta: 'Glucemia' },
}

/** Clases de tensión arterial anormales (texto 'SISTOLICA/DIASTOLICA'). */
export function clasificarTension(valor: string): string | null {
  const m = /^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(valor.trim())
  if (!m) return null
  const sistolica = Number(m[1])
  const diastolica = Number(m[2])
  if (sistolica >= 180 || diastolica >= 120) return 'Tensión en crisis hipertensiva'
  if (sistolica >= 140 || diastolica >= 90) return 'Tensión alta (hipertensión)'
  if (sistolica < 90 || diastolica < 60) return 'Tensión baja (hipotensión)'
  return null
}

/** Devuelve las anomalías detectadas en un registro de signos vitales. */
export function detectarAnomaliasSignos(
  vitalSigns: Record<string, string | number | boolean | null | undefined>,
): string[] {
  const anomalías: string[] = []

  const tension = vitalSigns.tension_arterial
  if (typeof tension === 'string') {
    const clase = clasificarTension(tension)
    if (clase) anomalías.push(`${clase}: ${tension} mmHg`)
  }

  for (const clave of Object.keys(RANGOS_SIGNOS_VITALES) as (keyof typeof RANGOS_SIGNOS_VITALES)[]) {
    const valor = vitalSigns[clave]
    if (typeof valor !== 'number' || !Number.isFinite(valor)) continue
    const rango = RANGOS_SIGNOS_VITALES[clave]
    if (valor < rango.min || valor > rango.max) {
      anomalías.push(`${rango.etiqueta}: ${valor} (normal ${rango.min}–${rango.max})`)
    }
  }

  return anomalías
}

/* ================================================================== */
/* Exportación CSV                                                     */
/* ================================================================== */

/** Convierte filas planas a CSV (RFC 4180) con BOM UTF-8 para Excel. */
export function generarCsv(headers: readonly string[], rows: readonly (string | number | null)[][]): string {
  const escapar = (v: string | number | null): string => {
    if (v === null) return ''
    const s = String(v)
    return /[",\n\r;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  const lineas = [headers.map(escapar).join(','), ...rows.map((fila) => fila.map(escapar).join(','))]
  return `\uFEFF${lineas.join('\r\n')}\r\n`
}

/* ================================================================== */
/* Etiquetas de criticidad para auditoría                              */
/* ================================================================== */

/** Clasifica una acción de auditoría en verde/amarillo/rojo. */
export function criticidadAccion(action: string): Tone {
  const a = action.toLowerCase()
  if (a.includes('delete') || a.includes('elimin') || a.includes('suspend')) return 'rose'
  if (a.includes('insert') || a.includes('create') || a.includes('regist') || a.includes('login')) return 'emerald'
  if (a.includes('update') || a.includes('edit') || a.includes('toggle') || a.includes('modify')) return 'amber'
  if (a.includes('select') || a.includes('view') || a.includes('export')) return 'sky'
  return 'slate'
}

/** Etiqueta en español del resultado de ejecución (reutilizada en gráficos). */
export function etiquetaOutcomeEjecucion(outcome: ExecutionOutcome): string {
  switch (outcome) {
    case 'completada':
      return 'Completadas'
    case 'omitida':
      return 'Omitidas'
    case 'cancelada':
      return 'Canceladas'
  }
}
