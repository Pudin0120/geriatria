'use client'

/**
 * GeriCare · FASE 7 — Envoltorio del bottom-sheet de ejecución.
 * ----------------------------------------------------------------------
 * Mantiene montado el sheet durante la animación de salida (AnimatePresence)
 * y, al terminar, remonta el formulario interno con `key`, de modo que todo
 * el estado local (resultado, signos vitales, foto) se reinicie sin necesidad
 * de setState dentro de un efecto (regla react-hooks/set-state-in-effect).
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { TareaMovilAuxiliar } from '@/types'
import { TaskExecutionModal } from './task-execution-modal'

interface TaskExecutionSheetProps {
  task: TareaMovilAuxiliar | null
}

export function TaskExecutionSheet({ task }: TaskExecutionSheetProps) {
  const [cerrando, setCerrando] = useState(false)
  const [generacion, setGeneracion] = useState(0)
  const visible = task !== null && !cerrando

  return (
    <AnimatePresence onExitComplete={() => setCerrando(false)}>
      {visible ? (
        <motion.div key={task.id} exit={{ opacity: 0 }} initial={{ opacity: 1 }} animate={{ opacity: 1 }}>
          <TaskExecutionModal
            key={`gen-${generacion}-${task.id}`}
            task={task}
            open
            onClose={() => {
              // Inicia la salida; cuando termine, el formulario se remonta limpio.
              setCerrando(true)
              setGeneracion((g) => g + 1)
            }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
