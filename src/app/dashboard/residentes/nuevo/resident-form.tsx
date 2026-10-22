'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { createResident, type ResidentFormState } from '@/lib/supabase/actions'
import { Input } from '@/components/ui/Input'
import { Button, SubmitButton } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { GENDER_LABELS, RESIDENT_STATUS_LABELS } from '@/types'
import type { ResidentGender, ResidentStatus } from '@/types'

const ESTADO_INICIAL: ResidentFormState = { error: null, exito: false, campos: {} }

const GENEROS = Object.keys(GENDER_LABELS) as ResidentGender[]
const ESTADOS = Object.keys(RESIDENT_STATUS_LABELS) as ResidentStatus[]

/** Formulario de alta de residente (Fase 3). Client component por interactividad. */
export function ResidentForm() {
  const [estado, accion] = useActionState(createResident, ESTADO_INICIAL)

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader
        title="Nuevo residente"
        subtitle="Registra a la persona en el censo de la residencia."
      />
      <CardContent>
        <form action={accion} className="space-y-5">
          {estado.error ? (
            <div role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
              {estado.error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input id="first_name" label="Nombre *" placeholder="María" required error={estado.campos['first_name']} />
            <Input id="last_name" label="Apellidos *" placeholder="Gómez Ruiz" required error={estado.campos['last_name']} />
            <Input id="birth_date" label="Fecha de nacimiento *" type="date" required error={estado.campos['birth_date']} />
            <div className="space-y-1.5">
              <label htmlFor="gender" className="block text-sm font-medium text-slate-700">Género *</label>
              <select
                id="gender"
                name="gender"
                required
                defaultValue="femenino"
                aria-invalid={estado.campos['gender'] ? true : undefined}
                className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
              >
                {GENEROS.map((g) => (
                  <option key={g} value={g}>{GENDER_LABELS[g]}</option>
                ))}
              </select>
              {estado.campos['gender'] ? (
                <p className="text-xs font-medium text-rose-600">{estado.campos['gender']}</p>
              ) : null}
            </div>
            <Input id="room_number" label="Habitación" placeholder="204-B" error={estado.campos['room_number']} />
            <Input id="admission_date" label="Fecha de ingreso" type="date" error={estado.campos['admission_date']} />
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="status" className="block text-sm font-medium text-slate-700">Estado</label>
              <select
                id="status"
                name="status"
                defaultValue="activo"
                className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
              >
                {ESTADOS.map((s) => (
                  <option key={s} value={s}>{RESIDENT_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold text-slate-700">Contacto de emergencia</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input id="emergency_contact_name" label="Nombre del contacto" placeholder="Carlos Gómez (hijo)" error={estado.campos['emergency_contact_name']} />
              <Input id="emergency_contact_phone" label="Teléfono" type="tel" placeholder="+34 600 123 456" error={estado.campos['emergency_contact_phone']} />
            </div>
          </fieldset>

          <div className="space-y-4">
            <Input
              id="allergies"
              label="Alergias"
              placeholder="Penicilina, mariscos… (separadas por comas)"
              error={estado.campos['allergies']}
            />
            <Input
              id="diagnoses"
              label="Diagnósticos"
              placeholder="EPOC grado II, HTA… (separados por comas)"
              error={estado.campos['diagnoses']}
            />
            <div className="space-y-1.5">
              <label htmlFor="notes" className="block text-sm font-medium text-slate-700">Notas de admisión</label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="Observaciones relevantes para el equipo de cuidado…"
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/dashboard/residentes">
              <Button variant="secondary" type="button">Cancelar</Button>
            </Link>
            <SubmitButton>Registrar residente</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
