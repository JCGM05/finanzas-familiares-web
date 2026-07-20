import { useState } from 'react'
import { Card, ErrorBox, Loading, SectionTitle } from '../components/ui'
import { api } from '../lib/api'
import { fmtEur, fmtFecha, num } from '../lib/format'
import type { ImportPreview, ImportRow, TipoMovimiento } from '../lib/types'
import { useAsync } from '../lib/useAsync'

const TIPOS: { v: TipoMovimiento; label: string }[] = [
  { v: 'gasto', label: 'Gasto' },
  { v: 'ingreso_nomina', label: 'Ingreso nómina' },
  { v: 'ingreso_extra', label: 'Ingreso extra' },
]

interface EditRow {
  fecha: string
  concepto: string
  importe: string
  tipo: TipoMovimiento
  category_id: number
  reconocido: boolean
}

export default function Importar() {
  const cats = useAsync(() => api.categories(), [])
  const [parsed, setParsed] = useState<ImportRow[] | null>(null)
  const [saldoAnterior, setSaldoAnterior] = useState('')
  const [saldoReal, setSaldoReal] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [rows, setRows] = useState<EditRow[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const categorias = cats.data ?? []

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(null); setOkMsg(null); setPreview(null)
    setBusy(true)
    try {
      const filas = await api.importParse(file)
      setParsed(filas)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBusy(false)
    }
  }

  async function hacerPreview() {
    if (!parsed) return
    setErr(null); setBusy(true)
    try {
      const p = await api.importPreview({
        filas: parsed,
        saldo_anterior: saldoAnterior || '0',
        saldo_real_banco: saldoReal || null,
      })
      setPreview(p)
      setRows(
        p.filas.map((f) => ({
          fecha: f.fecha, concepto: f.concepto, importe: f.importe,
          tipo: f.tipo_sugerido, category_id: f.category_id_sugerida ?? 0, reconocido: f.reconocido,
        })),
      )
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBusy(false)
    }
  }

  async function confirmar() {
    if (rows.some((r) => !r.category_id)) return setErr('Asigna una categoría a todas las filas antes de confirmar')
    setErr(null); setBusy(true)
    try {
      const res = await api.importCommit(
        rows.map((r) => ({
          fecha: r.fecha, tipo: r.tipo, category_id: r.category_id,
          descripcion: r.concepto, importe: r.importe, pagado_con: 'cuenta_comun',
        })),
      )
      setOkMsg(
        `✓ Importados ${res.insertados} movimientos a Movimientos.` +
          (res.duplicados_saltados > 0 ? ` Se saltaron ${res.duplicados_saltados} que ya existían (duplicados).` : ''),
      )
      setParsed(null); setPreview(null); setRows([])
      setSaldoAnterior(''); setSaldoReal('')
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBusy(false)
    }
  }

  if (cats.loading) return <Loading />

  const inputCls = 'rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm focus:border-verde-500 focus:outline-none'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Importar del banco</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Sube el extracto (.xlsx o .csv). Casamos cada línea con tus movimientos, autocompletamos categoría y cuadramos el saldo antes de guardar.</p>
      </div>

      {okMsg && <div className="rounded-xl border border-verde-500 bg-verde-50 dark:bg-verde-500/15 p-3 text-sm text-verde-700 dark:text-verde-300">{okMsg}</div>}
      {err && <ErrorBox msg={err} />}

      {/* Paso 1: subir */}
      <Card>
        <SectionTitle>1 · Sube el extracto</SectionTitle>
        <div className="flex flex-wrap items-center gap-4">
          <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={onFile} className="text-sm" />
          {parsed && <span className="text-sm text-slate-500 dark:text-slate-400">{parsed.length} líneas leídas del fichero.</span>}
        </div>
      </Card>

      {/* Paso 2: saldos + preview */}
      {parsed && parsed.length > 0 && (
        <Card>
          <SectionTitle>2 · Saldos para el cuadre</SectionTitle>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm">Saldo anterior (antes de estos)
              <input className={`${inputCls} mt-1 block`} value={saldoAnterior} onChange={(e) => setSaldoAnterior(e.target.value)} placeholder="0,00" />
            </label>
            <label className="text-sm">Saldo real del banco (último apunte)
              <input className={`${inputCls} mt-1 block`} value={saldoReal} onChange={(e) => setSaldoReal(e.target.value)} placeholder="opcional" />
            </label>
            <button onClick={hacerPreview} disabled={busy} className="rounded-lg bg-verde-600 px-4 py-2 text-sm font-semibold text-white hover:bg-verde-700 disabled:opacity-50">
              {busy ? '…' : 'Previsualizar y cuadrar'}
            </button>
          </div>
        </Card>
      )}

      {busy && !preview && <Loading label="Procesando…" />}

      {/* Paso 3: preview + cuadre */}
      {preview && (
        <>
          {/* Cuadre + comprobación de mes */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionTitle>Cuadre con el banco</SectionTitle>
              <div className="space-y-1 text-sm">
                <Line k="Movimientos pegados" v={String(preview.movimientos_pegados)} />
                <Line k="Suma del extracto" v={fmtEur(preview.suma_extracto)} />
                <Line k="Sin categorizar" v={String(preview.sin_categorizar)} tone={preview.sin_categorizar > 0 ? 'salmon' : undefined} />
                <Line k="Saldo anterior" v={fmtEur(preview.saldo_anterior)} />
                <Line k="Saldo que debería quedar" v={fmtEur(preview.saldo_deberia_quedar)} />
                {preview.saldo_real_banco !== null && <Line k="Saldo real del banco" v={fmtEur(preview.saldo_real_banco)} />}
                {preview.diferencia !== null && (
                  <Line k="Diferencia" v={fmtEur(preview.diferencia)} tone={preview.cuadra ? 'verde' : 'salmon'} />
                )}
                {preview.cuadra !== null && (
                  <p className={`mt-2 font-semibold ${preview.cuadra ? 'text-verde-600' : 'text-salmon-600'}`}>
                    {preview.cuadra ? '✓ CUADRA con el banco' : '✗ NO cuadra: revisa los movimientos'}
                  </p>
                )}
              </div>
            </Card>
            <Card>
              <SectionTitle>Comprobación de mes</SectionTitle>
              <p className={`text-sm ${preview.comprobacion_mes.es_mes_nuevo ? 'text-verde-700 dark:text-verde-300' : 'text-salmon-600'}`}>
                {preview.comprobacion_mes.aviso}
              </p>
            </Card>
          </div>

          {/* Filas a importar */}
          <Card className="overflow-x-auto">
            <SectionTitle>3 · Revisa y confirma</SectionTitle>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Las filas en coral no se reconocieron: asígnales categoría y tipo.</p>
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  <th className="py-2 pr-2">Fecha</th><th className="py-2 px-2">Concepto</th>
                  <th className="py-2 px-2 text-right">Importe</th><th className="py-2 px-2">Tipo</th><th className="py-2 pl-2">Categoría</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-b border-slate-100 dark:border-slate-800 ${!r.reconocido ? 'bg-salmon-50 dark:bg-salmon-500/15' : ''}`}>
                    <td className="py-1.5 pr-2 whitespace-nowrap text-slate-500 dark:text-slate-400">{fmtFecha(r.fecha)}</td>
                    <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">{r.concepto}</td>
                    <td className={`py-1.5 px-2 text-right font-semibold ${num(r.importe) < 0 ? 'text-slate-800 dark:text-slate-100' : 'text-verde-600'}`}>{fmtEur(r.importe)}</td>
                    <td className="py-1.5 px-2">
                      <select value={r.tipo} onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, tipo: e.target.value as TipoMovimiento } : x))} className="rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-xs">
                        {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 pl-2">
                      <select value={r.category_id} onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, category_id: Number(e.target.value) } : x))} className={`rounded border px-2 py-1 text-xs ${!r.category_id ? 'border-salmon-500' : 'border-slate-300 dark:border-slate-600'}`}>
                        <option value={0}>Categoría…</option>
                        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex justify-end">
              <button onClick={confirmar} disabled={busy} className="rounded-lg bg-verde-600 px-5 py-2 text-sm font-semibold text-white hover:bg-verde-700 disabled:opacity-50">
                {busy ? '…' : `Confirmar e importar ${rows.length} movimientos`}
              </button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function Line({ k, v, tone }: { k: string; v: string; tone?: 'verde' | 'salmon' }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500 dark:text-slate-400">{k}</span>
      <span className={`font-semibold tabular-nums ${tone === 'verde' ? 'text-verde-600' : tone === 'salmon' ? 'text-salmon-600' : 'text-slate-700 dark:text-slate-200'}`}>{v}</span>
    </div>
  )
}
