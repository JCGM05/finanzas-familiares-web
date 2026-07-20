import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, ErrorBox, Loading, SectionTitle } from '../components/ui'
import { usePeriod } from '../context/PeriodContext'
import { api } from '../lib/api'
import { fmtEur, fmtEur0, num } from '../lib/format'
import type { NetWorthItem } from '../lib/types'
import { useAsync } from '../lib/useAsync'

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const key = (item: number, mes: number) => `${item}-${mes}`

export default function Patrimonio() {
  const { anio } = usePeriod()
  const items = useAsync(() => api.netWorthItems(), [])
  const entries = useAsync(() => api.netWorthEntries(anio), [anio])
  const [valores, setValores] = useState<Record<string, string>>({})

  // Cargar entradas en el estado local cuando llegan
  useEffect(() => {
    if (!entries.data) return
    const v: Record<string, string> = {}
    for (const e of entries.data) v[key(e.item_id, e.mes)] = e.importe
    setValores(v)
  }, [entries.data])

  const activos = (items.data ?? []).filter((i) => i.tipo === 'activo')
  const pasivos = (items.data ?? []).filter((i) => i.tipo === 'pasivo')

  const totalMes = (lista: NetWorthItem[], mes: number) =>
    lista.reduce((a, it) => a + num(valores[key(it.id, mes)]), 0)

  const netoPorMes = useMemo(
    () => MESES_CORTOS.map((_, i) => totalMes(activos, i + 1) - totalMes(pasivos, i + 1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [valores, items.data],
  )

  const chartData = MESES_CORTOS.map((m, i) => ({ mes: m, neto: netoPorMes[i] }))

  async function guardar(item_id: number, mes: number, raw: string) {
    const importe = Number(raw || 0)
    setValores((v) => ({ ...v, [key(item_id, mes)]: raw }))
    try {
      await api.upsertNetWorthEntry({ item_id, anio, mes, importe })
    } catch {
      /* si falla, se mantiene el valor local; se reintenta al reeditar */
    }
  }

  if (items.loading || entries.loading) return <Loading />
  if (items.error) return <ErrorBox msg={items.error} />

  const cellInput = 'w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-right tabular-nums hover:border-slate-200 focus:border-verde-500 focus:bg-white focus:outline-none'

  const renderFilas = (lista: NetWorthItem[]) =>
    lista.map((it) => (
      <tr key={it.id} className="border-b border-slate-100 dark:border-slate-800">
        <td className="sticky left-0 bg-white dark:bg-slate-800 py-1 pr-2 font-medium text-slate-700 dark:text-slate-200">{it.nombre}</td>
        {MESES_CORTOS.map((_, i) => (
          <td key={i} className="px-1 py-1 text-right">
            <input
              type="number"
              step="0.01"
              defaultValue={valores[key(it.id, i + 1)] ?? ''}
              onBlur={(e) => {
                if ((e.target.value || '') !== (valores[key(it.id, i + 1)] ?? '')) guardar(it.id, i + 1, e.target.value)
              }}
              className={cellInput}
              placeholder="—"
            />
          </td>
        ))}
      </tr>
    ))

  const totalRow = (label: string, lista: NetWorthItem[], cls: string) => (
    <tr className={`font-semibold ${cls}`}>
      <td className={`sticky left-0 py-1.5 pr-2 ${cls}`}>{label}</td>
      {MESES_CORTOS.map((_, i) => {
        const t = totalMes(lista, i + 1)
        return <td key={i} className="px-2 py-1.5 text-right tabular-nums">{t === 0 ? '—' : fmtEur(t)}</td>
      })}
    </tr>
  )

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        Patrimonio neto · <span className="text-verde-600">{anio}</span>
      </h1>
      <p className="text-xs text-slate-400 dark:text-slate-500">Escribe a fin de mes lo que tenéis y debéis. El neto se calcula solo.</p>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500">
              <th className="sticky left-0 bg-white dark:bg-slate-800 py-2 pr-2 text-left uppercase">Concepto</th>
              {MESES_CORTOS.map((m) => <th key={m} className="px-2 py-2 text-right font-medium">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-verde-50 dark:bg-verde-500/15 text-xs font-semibold uppercase text-verde-700 dark:text-verde-300"><td colSpan={13} className="py-1 pl-2">Activos (lo que tenéis)</td></tr>
            {renderFilas(activos)}
            {totalRow('Total activos', activos, 'bg-verde-50 dark:bg-verde-500/15 text-verde-700 dark:text-verde-300')}
            <tr className="bg-salmon-50 dark:bg-salmon-500/15 text-xs font-semibold uppercase text-salmon-700 dark:text-salmon-300"><td colSpan={13} className="py-1 pl-2">Pasivos (lo que debéis)</td></tr>
            {renderFilas(pasivos)}
            {totalRow('Total pasivos', pasivos, 'bg-salmon-50 dark:bg-salmon-500/15 text-salmon-700 dark:text-salmon-300')}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-800 font-bold text-white">
              <td className="sticky left-0 bg-slate-800 py-2 pr-2">PATRIMONIO NETO</td>
              {netoPorMes.map((n, i) => <td key={i} className="px-2 py-2 text-right tabular-nums">{n === 0 ? '—' : fmtEur(n)}</td>)}
            </tr>
          </tfoot>
        </table>
      </Card>

      <Card>
        <SectionTitle>Evolución del patrimonio neto</SectionTitle>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis tickFormatter={(v) => fmtEur0(v)} tick={{ fontSize: 12, fill: '#64748b' }} width={80} />
            <Tooltip formatter={(v) => fmtEur(num(v as number))} />
            <Line type="monotone" dataKey="neto" stroke="#059669" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
