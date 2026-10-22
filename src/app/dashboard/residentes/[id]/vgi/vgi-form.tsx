'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { createVgiAssessment, RANGOS_VGI, type VgiFormState } from '@/lib/supabase/actions'
import { ScaleInput } from '@/components/ui/ScaleInput'
import { Button, SubmitButton } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { FRAILTY_LEVEL_LABELS } from '@/types'
import type { FrailtyLevel } from '@/types'
import { fechaLocalISO } from '@/lib/utils'

const ESTADO_INICIAL: VgiFormState = { error: null, exito: false, campos: {} }

const NIVELES_FRAGILIDAD: ReadonlyArray<FrailtyLevel> = ['fragil', 'pre_fragil', 'robusto']

interface VgiFormProps {
  residentId: string
}

/**
 * Formulario completo de Valoración Geriátrica Integral (Fase 3).
 * Escalas numéricas con validación estricta de rangos en cliente y
 * envío contra la Server Action `createVgiAssessment`.
 */
export function VgiForm({ residentId }: VgiFormProps) {
  const accionConResidente = createVgiAssessment.bind(null, residentId)
  const [estado, accion] = useActionState(accionConResidente, ESTADO_INICIAL)

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader
        title="Nueva valoración"
        subtitle="Puntúa cada escala dentro de su rango clínico. Los campos vacíos quedan sin puntuar."
      />
      <CardContent>
        <form action={accion} className="space-y-6">
          {estado.error ? (
            <div role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
              {estado.error}
            </div>
          ) : null}

          {/* Fecha de valoración */}
          <div className="space-y-1.5">
            <label htmlFor="assessment_date" className="block text-sm font-medium text-slate-700">
              Fecha de valoración *
            </label>
            <input
              id="assessment_date"
              name="assessment_date"
              type="date"
              required
              defaultValue={fechaLocalISO()}
              max={fechaLocalISO()}
              aria-invalid={estado.campos['assessment_date'] ? true : undefined}
              className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
            />
            {estado.campos['assessment_date'] ? (
              <p className="text-xs font-medium text-rose-600">{estado.campos['assessment_date']}</p>
            ) : null}
          </div>

          {/* Escalas clínicas */}
          <fieldset className="space-y-5 rounded-lg border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold text-slate-700">Escalas geriátricas</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ScaleInput
                name="barthel_index"
                label="Índice de Barthel (AVD básicas)"
                min={RANGOS_VGI.barthel_index.min}
                max={RANGOS_VGI.barthel_index.max}
                hint="0 = dependencia total · 100 = independiente"
                error={estado.campos['barthel_index']}
              />
              <ScaleInput
                name="mmse_score"
                label="MMSE (Mini-Mental State Examination)"
                min={RANGOS_VGI.mmse_score.min}
                max={RANGOS_VGI.mmse_score.max}
                hint="≤ 23 sugiere deterioro cognitivo"
                error={estado.campos['mmse_score']}
              />
              <ScaleInput
                name="mna_sf_score"
                label="MNA-SF (Mini Nutritional Assessment)"
                min={RANGOS_VGI.mna_sf_score.min}
                max={RANGOS_VGI.mna_sf_score.max}
                hint="≤ 7 desnutrición · 8-11 riesgo"
                error={estado.campos['mna_sf_score']}
              />
              <ScaleInput
                name="downton_score"
                label="Downton (riesgo de caídas)"
                min={RANGOS_VGI.downton_score.min}
                max={RANGOS_VGI.downton_score.max}
                hint="≥ 2 riesgo alto de caídas"
                error={estado.campos['downton_score']}
              />
              <ScaleInput
                name="yesavage_score"
                label="Yesavage (GDS-15, ánimo)"
                min={RANGOS_VGI.yesavage_score.min}
                max={RANGOS_VGI.yesavage_score.max}
                hint="≥ 11 depresión probable"
                error={estado.campos['yesavage_score']}
              />
              <ScaleInput
                name="charlson_score"
                label="Charlson (comorbilidad)"
                min={RANGOS_VGI.charlson_score.min}
                max={RANGOS_VGI.charlson_score.max}
                hint="Mayor puntuación = mayor carga de comorbilidad"
                error={estado.campos['charlson_score']}
              />
            </div>
          </fieldset>

          {/* Nivel de fragilidad */}
          <div className="space-y-1.5">
            <label htmlFor="frailty_level" className="block text-sm font-medium text-slate-700">
              Nivel de fragilidad
            </label>
            <select
              id="frailty_level"
              name="frailty_level"
              defaultValue=""
              aria-invalid={estado.campos['frailty_level'] ? true : undefined}
              className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
            >
              <option value="">Sin clasificar</option>
              {NIVELES_FRAGILIDAD.map((nivel) => (
                <option key={nivel} value={nivel}>
                  {FRAILTY_LEVEL_LABELS[nivel]}
                </option>
              ))}
            </select>
            {estado.campos['frailty_level'] ? (
              <p className="text-xs font-medium text-rose-600">{estado.campos['frailty_level']}</p>
            ) : null}
          </div>

          {/* Resumen clínico */}
          <div className="space-y-1.5">
            <label htmlFor="clinical_summary" className="block text-sm font-medium text-slate-700">
              Resumen clínico
            </label>
            <textarea
              id="clinical_summary"
              name="clinical_summary"
              rows={4}
              maxLength={2000}
              placeholder="Síntesis global del estado funcional, cognitivo, nutricional y anímico del residente…"
              aria-invalid={estado.campos['clinical_summary'] ? true : undefined}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
            />
            {estado.campos['clinical_summary'] ? (
              <p className="text-xs font-medium text-rose-600">{estado.campos['clinical_summary']}</p>
            ) : null}
          </div>

          {/* Recomendaciones */}
          <div className="space-y-1.5">
            <label htmlFor="recommendations" className="block text-sm font-medium text-slate-700">
              Recomendaciones
            </label>
            <textarea
              id="recommendations"
              name="recommendations"
              rows={3}
              placeholder="Una recomendación por línea, p. ej.:&#10;Reevaluación nutricional en 3 meses&#10;Fisioterapia para marcha dos veces por semana"
              aria-describedby="recommendations-help"
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-teal-600"
            />
            <p id="recommendations-help" className="text-xs text-slate-400">
              Escribe cada recomendación en una línea separada (máximo 20).
            </p>
            {estado.campos['recommendations'] ? (
              <p className="text-xs font-medium text-rose-600">{estado.campos['recommendations']}</p>
            ) : null}
          </div>

          {/* Acciones */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <Link href={`/dashboard/residentes/${residentId}`}>
              <Button variant="secondary" type="button">Cancelar</Button>
            </Link>
            <SubmitButton>Guardar valoración</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
