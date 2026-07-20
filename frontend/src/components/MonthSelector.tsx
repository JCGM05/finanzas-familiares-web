import { usePeriod } from '../context/PeriodContext'
import { MESES } from '../lib/format'

export default function MonthSelector() {
  const { anio, mes, setAnio, setMes } = usePeriod()
  const anioActual = new Date().getFullYear()
  const anios = [anioActual - 1, anioActual, anioActual + 1]

  return (
    <div className="flex items-center gap-2">
      <select
        value={mes}
        onChange={(e) => setMes(Number(e.target.value))}
        className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-medium shadow-sm focus:border-verde-500 focus:outline-none"
      >
        {MESES.map((m, i) => (
          <option key={i} value={i + 1}>{m}</option>
        ))}
      </select>
      <select
        value={anio}
        onChange={(e) => setAnio(Number(e.target.value))}
        className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-medium shadow-sm focus:border-verde-500 focus:outline-none"
      >
        {anios.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
    </div>
  )
}
