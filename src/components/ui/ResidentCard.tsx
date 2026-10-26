import Link from 'next/link'
import type { ResidentRow } from '@/types'
import { GENDER_LABELS, buildResidentFullName } from '@/types'
import { calcularEdadTexto, formatearFecha } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Badge, ResidentStatusBadge } from '@/components/ui/Badge'

interface ResidentCardProps {
  resident: ResidentRow
}

/**
 * Tarjeta resumen de un residente (Fase 3): nombre, edad calculada,
 * habitación, género, fecha de ingreso y estado con badge semántico.
 * Toda la tarjeta es un enlace al detalle del residente.
 */
export function ResidentCard({ resident }: ResidentCardProps) {
  const iniciales = `${resident.first_name.charAt(0)}${resident.last_name.charAt(0)}`.toUpperCase()

  return (
    <Card className="group overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-[#cdded3] hover:shadow-[0_12px_28px_rgba(29,67,56,.08)]">
      <Link
        href={`/dashboard/residentes/${resident.id}`}
        className="block rounded-2xl p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176b5b] sm:p-5"
      >
        <div className="flex items-start gap-3">
          {/* Avatar con iniciales */}
          <span
            aria-hidden
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e6f2ed] text-sm font-bold text-[#176b5b] ring-1 ring-inset ring-[#d4e7db]"
          >
            {iniciales}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate text-sm font-semibold text-[#1b302e] group-hover:text-[#176b5b]">
                {buildResidentFullName(resident)}
              </h3>
              <ResidentStatusBadge status={resident.status} />
            </div>

            <p className="mt-1 text-xs text-[#71817c]">
              {calcularEdadTexto(resident.birth_date)} · {GENDER_LABELS[resident.gender]}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[#edf1ee] pt-3 text-xs">
              <div className="flex items-center gap-1.5">
                <dt className="text-slate-400">Habitación:</dt>
                <dd className="font-medium text-slate-700">{resident.room_number ?? '—'}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="text-slate-400">Ingreso:</dt>
                <dd className="font-medium text-slate-700">{formatearFecha(resident.admission_date)}</dd>
              </div>
            </dl>

            {/* Alergias destacadas (alerta clínica) */}
            {resident.allergies.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="rose">⚠ {resident.allergies.length} alergia{resident.allergies.length > 1 ? 's' : ''}</Badge>
                {resident.allergies.slice(0, 2).map((alergía) => (
                  <span key={alergía} className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700 ring-1 ring-inset ring-rose-600/20">
                    {alergía}
                  </span>
                ))}
                {resident.allergies.length > 2 ? (
                  <span className="text-[11px] text-slate-400">+{resident.allergies.length - 2} más</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </Link>
    </Card>
  )
}
