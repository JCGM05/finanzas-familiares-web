import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, ErrorBox, Loading, SectionTitle } from '../components/ui'
import { usePeriod } from '../context/PeriodContext'
import { api } from '../lib/api'
import { fmtEur, fmtEur0, fmtPct, MESES, num } from '../lib/format'
import { useAsync } from '../lib/useAsync'

const DONUT = ['#10b981', '#fa8072', '#a78bfa', '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6', '#f97316']

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'verde' | 'salmon' }) {
  const color = tone === 'verde' ? 'text-verde-600' : tone === 'salmon' ? 'text-salmon-600' : 'text-slate-800 dark:text-slate-100'
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </Card>
  )
}

export default function Inicio() {
  const { anio, mes } = usePeriod()
  const dash = useAsync(() => api.monthDashboard(anio, mes), [anio, mes])
  const saldo = useAsync(() => api.saldo(), [])

  if (dash.loading || saldo.loading) return <Loading />
  if (dash.error) return <ErrorBox msg={`No se pudo cargar el panel: ${dash.error}`} />
  const d = dash.data!
  const s = saldo.data

  const gastos = d.categorias
    .filter((c) => num(c.gasto_real) > 0 && c.nombre !== 'Compra vivienda (puntual)')
    .map((c) => ({ name: c.nombre, value: num(c.gasto_real) }))
    .sort((a, b) => b.value - a.value)
  const top3 = gastos.slice(0, 3)

  const totalRegla = num(d.necesidades) + num(d.deseos) + Math.max(0, num(d.ahorro_regla))
  const pctRegla = (v: number) => (totalRegla > 0 ? v / totalRegla : 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Hola, Julio y Yanay 👋</h1>
        <p className="text-slate-500 dark:text-slate-400">{MESES[mes - 1]} de {anio}</p>
      </div>

      {/* Saldo disponible + colchón */}
      {s && (
        <Card className="bg-gradient-to-br from-verde-50 dark:from-slate-800 to-white dark:to-slate-900">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Saldo disponible real</p>
              <p className="mt-1 text-4xl font-bold text-verde-700 dark:text-verde-300">{fmtEur(s.saldo_disponible)}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Total {fmtEur(s.saldo_total)} · retenido {fmtEur(s.saldo_retenido)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Colchón</p>
              <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
                {s.colchon_meses
                  ? s.colchon_meses.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                  : '—'}{' '}
                meses
              </p>
            </div>
          </div>
          {s.nota_retencion && num(s.saldo_retenido) > 0 && (
            <div className="mt-3 rounded-lg bg-lila-50 dark:bg-lila-500/20 px-3 py-2 text-sm text-lila-600 dark:text-lila-300">
              ⚠ {s.nota_retencion}
            </div>
          )}
        </Card>
      )}

      {/* 5 KPIs (gastos y ahorro son del mes normal, sin pagos únicos) */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Kpi label="Ingresos" value={fmtEur0(d.ingresos)} tone="verde" />
        <Kpi label="Gastos del mes" value={fmtEur0(d.gastos)} tone="salmon" />
        <Kpi label="Ahorro" value={fmtEur0(d.ahorro)} tone={num(d.ahorro) >= 0 ? 'verde' : 'salmon'} />
        <Kpi label="Queda por gastar" value={fmtEur0(d.queda_por_gastar)} />
        <Kpi label="Tasa de ahorro" value={fmtPct(d.tasa_ahorro)} tone={num(d.ahorro) >= 0 ? 'verde' : 'salmon'} />
      </div>

      {/* Aviso de pagos puntuales del mes (no cuentan en el ahorro) */}
      {num(d.gastos_puntuales) > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-sm">
          <span className="text-slate-600 dark:text-slate-300">
            💠 Pagos únicos este mes (compra vivienda, etc.) — <span className="text-slate-400 dark:text-slate-500">no cuentan en el ahorro del mes</span>
          </span>
          <span className="font-bold text-slate-700 dark:text-slate-200">{fmtEur(d.gastos_puntuales)}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Donut: en qué se va el dinero */}
        <Card>
          <SectionTitle>En qué se va el dinero</SectionTitle>
          {gastos.length === 0 ? (
            <p className="py-8 text-center text-slate-400 dark:text-slate-500">Sin gastos registrados este mes.</p>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={gastos} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {gastos.map((_, i) => (
                      <Cell key={i} fill={DONUT[i % DONUT.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmtEur(num(v as number))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-full space-y-1">
                <p className="mb-1 text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Top 3 categorías</p>
                {top3.map((g, i) => (
                  <div key={g.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT[i] }} />
                      {g.name}
                    </span>
                    <span className="font-medium">{fmtEur(g.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Regla 50/30/20 */}
        <Card>
          <SectionTitle>Regla 50 / 30 / 20</SectionTitle>
          <div className="space-y-4 pt-2">
            {[
              { label: 'Necesidades', ideal: 0.5, val: num(d.necesidades), color: 'bg-verde-500' },
              { label: 'Deseos', ideal: 0.3, val: num(d.deseos), color: 'bg-salmon-500' },
              { label: 'Ahorro', ideal: 0.2, val: Math.max(0, num(d.ahorro_regla)), color: 'bg-lila-500' },
            ].map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{r.label}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {fmtPct(pctRegla(r.val))} <span className="text-slate-300">/ ideal {fmtPct(r.ideal)}</span>
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div className={`h-full rounded-full ${r.color}`} style={{ width: `${Math.min(100, pctRegla(r.val) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
