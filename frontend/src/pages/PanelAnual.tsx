import { Card, ErrorBox, Loading } from '../components/ui'
import { usePeriod } from '../context/PeriodContext'
import { api } from '../lib/api'
import { fmtEur, num } from '../lib/format'
import { useAsync } from '../lib/useAsync'

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Celda de dinero: vacía (—) si es cero, para no saturar la matriz.
function Money({ v, bold, tone }: { v: string | number; bold?: boolean; tone?: 'salmon' | 'verde' }) {
  const n = num(v)
  const color = n < 0 ? 'text-salmon-600' : tone === 'verde' ? 'text-verde-600' : tone === 'salmon' ? 'text-salmon-600' : 'text-slate-600 dark:text-slate-300'
  return (
    <td className={`px-2 py-1.5 text-right tabular-nums ${bold ? 'font-semibold' : ''} ${n === 0 ? 'text-slate-300' : color}`}>
      {n === 0 ? '—' : fmtEur(v)}
    </td>
  )
}

export default function PanelAnual() {
  const { anio } = usePeriod()
  const { data, loading, error } = useAsync(() => api.yearDashboard(anio), [anio])

  if (loading) return <Loading />
  if (error) return <ErrorBox msg={error} />
  const d = data!

  const filas = d.categorias.filter((c) => num(c.total_anio) !== 0 || num(c.presupuesto_anio) !== 0)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        Panel anual · <span className="text-verde-600">{anio}</span>
      </h1>
      <p className="text-xs text-lila-600 dark:text-lila-300">■ Las filas en lila son el apoyo temporal a los suegros.</p>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500">
              <th className="sticky left-0 bg-white dark:bg-slate-800 py-2 pr-2 text-left uppercase tracking-wide">Categoría</th>
              {MESES_CORTOS.map((m) => <th key={m} className="px-2 py-2 text-right font-medium">{m}</th>)}
              <th className="px-2 py-2 text-right uppercase">Total año</th>
              <th className="px-2 py-2 text-right uppercase">Media/mes</th>
              <th className="px-2 py-2 text-right uppercase">Ppto año</th>
              <th className="px-2 py-2 text-right uppercase">Desv.</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr key={c.category_id} className={`border-b border-slate-100 dark:border-slate-800 ${c.es_apoyo_suegros ? 'bg-lila-50 dark:bg-lila-500/20' : ''}`}>
                <td className={`sticky left-0 py-1.5 pr-2 font-medium ${c.es_apoyo_suegros ? 'bg-lila-50 dark:bg-lila-500/20 text-lila-600 dark:text-lila-300' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>
                  {c.nombre}
                </td>
                {c.meses.map((v, i) => <Money key={i} v={v} />)}
                <Money v={c.total_anio} bold />
                <Money v={c.media_mes} />
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-400 dark:text-slate-500">{fmtEur(c.presupuesto_anio)}</td>
                <Money v={c.desviacion} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-salmon-50 dark:bg-salmon-500/15 font-semibold text-salmon-700 dark:text-salmon-300">
              <td className="sticky left-0 bg-salmon-50 dark:bg-salmon-500/15 py-2 pr-2">TOTAL GASTOS</td>
              {d.total_gastos.map((v, i) => <Money key={i} v={v} bold tone="salmon" />)}
              <Money v={d.total_gastos_anio} bold tone="salmon" />
              <td colSpan={3} />
            </tr>
            <tr className="bg-verde-50 dark:bg-verde-500/15 font-semibold text-verde-700 dark:text-verde-300">
              <td className="sticky left-0 bg-verde-50 dark:bg-verde-500/15 py-2 pr-2">TOTAL INGRESOS</td>
              {d.total_ingresos.map((v, i) => <Money key={i} v={v} bold tone="verde" />)}
              <Money v={d.total_ingresos_anio} bold tone="verde" />
              <td colSpan={3} />
            </tr>
            <tr className="font-semibold">
              <td className="sticky left-0 bg-white dark:bg-slate-800 py-2 pr-2 text-slate-700 dark:text-slate-200">AHORRO DEL MES</td>
              {d.ahorro_mes.map((v, i) => <Money key={i} v={v} bold />)}
              <Money v={d.ahorro_anio} bold />
              <td colSpan={3} />
            </tr>
            <tr className="text-slate-500 dark:text-slate-400">
              <td className="sticky left-0 bg-white dark:bg-slate-800 py-2 pr-2 italic">Ahorro acumulado</td>
              {d.ahorro_acumulado.map((v, i) => <Money key={i} v={v} />)}
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  )
}
