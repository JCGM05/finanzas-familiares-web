import { Card, ErrorBox, Loading, SectionTitle } from '../components/ui'
import { usePeriod } from '../context/PeriodContext'
import { api } from '../lib/api'
import { fmtEur, fmtPct, MESES, num } from '../lib/format'
import { useAsync } from '../lib/useAsync'

function Variacion({ actual, anterior }: { actual: number; anterior: number }) {
  if (anterior === 0) return <span className="text-slate-400 dark:text-slate-500">{actual === 0 ? '—' : '▲ nuevo'}</span>
  const diff = actual - anterior
  if (diff === 0) return <span className="text-slate-400 dark:text-slate-500">=</span>
  const subeGasto = diff > 0
  return (
    <span className={subeGasto ? 'text-salmon-600' : 'text-verde-600'}>
      {subeGasto ? '▲' : '▼'} {fmtEur(Math.abs(diff))}
    </span>
  )
}

export default function PanelMensual() {
  const { anio, mes } = usePeriod()
  const { data, loading, error } = useAsync(() => api.monthDashboard(anio, mes), [anio, mes])

  if (loading) return <Loading />
  if (error) return <ErrorBox msg={error} />
  const d = data!
  const b = d.balance_comun

  const filas = d.categorias.filter(
    (c) => num(c.presupuesto) !== 0 || num(c.gasto_real) !== 0 || num(c.mes_anterior) !== 0,
  )

  const balanceRows: Array<{ label: string; value: string; strong?: boolean; tone?: 'verde' | 'salmon'; muted?: boolean }> = [
    { label: 'Nóminas registradas', value: fmtEur(b.nominas_registradas) },
    { label: 'Paga extra', value: num(b.paga_extra) ? fmtEur(b.paga_extra) : '—' },
    { label: 'Ingresos extra del mes', value: fmtEur(b.ingresos_extra) },
    { label: 'TOTAL INGRESADO', value: fmtEur(b.total_ingresado), strong: true },
    { label: 'Gastos del mes (sin puntuales)', value: '−' + fmtEur(b.gastos_comun), tone: 'salmon' },
    { label: 'AHORRO DEL MES', value: fmtEur(b.ahorro_mes), strong: true, tone: num(b.ahorro_mes) >= 0 ? 'verde' : 'salmon' },
    ...(num(b.gastos_puntuales) > 0
      ? [{ label: 'Pagos únicos (aparte)', value: '−' + fmtEur(b.gastos_puntuales), muted: true }]
      : []),
    { label: 'Previsión de nóminas (ref.)', value: fmtEur(b.prevision_nominas), muted: true },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        Panel mensual · <span className="text-verde-600">{MESES[mes - 1]} {anio}</span>
      </h1>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tabla de categorías */}
        <Card className="overflow-x-auto lg:col-span-2">
          <SectionTitle>Resumen por categoría (cuenta común)</SectionTitle>
          <p className="mb-2 text-xs text-lila-600 dark:text-lila-300">■ Las filas en lila son el apoyo temporal a los suegros.</p>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <th className="py-2 pr-2">Categoría</th>
                <th className="py-2 px-2 text-right">Presup.</th>
                <th className="py-2 px-2 text-right">Gasto real</th>
                <th className="py-2 px-2 text-right">Mes ant.</th>
                <th className="py-2 px-2 text-right">Restante</th>
                <th className="py-2 pl-2 text-right">% consum.</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => {
                const pct = c.pct_consumido
                const over = pct !== null && pct > 1
                return (
                  <tr
                    key={c.category_id}
                    className={`border-b border-slate-100 dark:border-slate-800 last:border-0 ${c.es_apoyo_suegros ? 'bg-lila-50 dark:bg-lila-500/20' : ''}`}
                  >
                    <td className={`py-2 pr-2 font-medium ${c.es_apoyo_suegros ? 'text-lila-600 dark:text-lila-300' : 'text-slate-700 dark:text-slate-200'}`}>
                      {c.nombre}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-500 dark:text-slate-400">{fmtEur(c.presupuesto)}</td>
                    <td className="py-2 px-2 text-right font-semibold">{fmtEur(c.gasto_real)}</td>
                    <td className="py-2 px-2 text-right">
                      <Variacion actual={num(c.gasto_real)} anterior={num(c.mes_anterior)} />
                    </td>
                    <td className={`py-2 px-2 text-right ${num(c.restante) < 0 ? 'text-salmon-600' : 'text-slate-500 dark:text-slate-400'}`}>
                      {fmtEur(c.restante)}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                          <div
                            className={`h-full rounded-full ${over ? 'bg-salmon-500' : 'bg-verde-500'}`}
                            style={{ width: `${pct === null ? 0 : Math.min(100, pct * 100)}%` }}
                          />
                        </div>
                        <span className={`w-12 ${over ? 'text-salmon-600' : 'text-slate-500 dark:text-slate-400'}`}>{fmtPct(pct)}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-bold">
                <td className="py-2 pr-2">TOTAL</td>
                <td className="py-2 px-2 text-right">{fmtEur(filas.reduce((a, c) => a + num(c.presupuesto), 0))}</td>
                <td className="py-2 px-2 text-right">{fmtEur(filas.reduce((a, c) => a + num(c.gasto_real), 0))}</td>
                <td />
                <td className="py-2 px-2 text-right">{fmtEur(filas.reduce((a, c) => a + num(c.restante), 0))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </Card>

        {/* Balance de la cuenta común */}
        <Card className="h-fit">
          <SectionTitle>Balance de la cuenta común</SectionTitle>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {balanceRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between py-2 text-sm">
                <span className={`${r.strong ? 'font-semibold text-slate-700 dark:text-slate-200' : r.muted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'}`}>
                  {r.label}
                </span>
                <span
                  className={`tabular-nums ${r.strong ? 'font-bold' : ''} ${
                    r.tone === 'verde' ? 'text-verde-600' : r.tone === 'salmon' ? 'text-salmon-600' : r.muted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'
                  }`}
                >
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recibos */}
      <Card>
        <SectionTitle>Recibos fijos del mes</SectionTitle>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {d.recibos.map((r) => (
            <div
              key={r.nombre}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-sm ${r.es_apoyo_suegros ? 'bg-lila-50 dark:bg-lila-500/20' : ''}`}
            >
              <span className={r.es_apoyo_suegros ? 'text-lila-600 dark:text-lila-300' : 'text-slate-700 dark:text-slate-200'}>
                {r.nombre} {r.dia && <span className="text-slate-400 dark:text-slate-500">· día {r.dia}</span>}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-slate-500 dark:text-slate-400">{fmtEur(r.previsto)}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.estado === 'Pagado' ? 'bg-verde-100 text-verde-700 dark:text-verde-300' : 'bg-salmon-100 text-salmon-600'
                  }`}
                >
                  {r.estado}
                </span>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
