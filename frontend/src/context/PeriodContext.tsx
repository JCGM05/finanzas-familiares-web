import { createContext, useContext, useState, type ReactNode } from 'react'

interface PeriodState {
  anio: number
  mes: number
  setAnio: (a: number) => void
  setMes: (m: number) => void
}

const PeriodContext = createContext<PeriodState | null>(null)

export function PeriodProvider({ children }: { children: ReactNode }) {
  const now = new Date()
  const [anio, setAnio] = useState(now.getFullYear())
  const [mes, setMes] = useState(now.getMonth() + 1)
  return (
    <PeriodContext.Provider value={{ anio, mes, setAnio, setMes }}>
      {children}
    </PeriodContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePeriod() {
  const ctx = useContext(PeriodContext)
  if (!ctx) throw new Error('usePeriod debe usarse dentro de PeriodProvider')
  return ctx
}
