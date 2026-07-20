// Tipos que reflejan los esquemas Pydantic del backend.

export type TipoMovimiento = 'gasto' | 'ingreso_nomina' | 'ingreso_extra'
export type PagadoCon = 'cuenta_comun' | 'efectivo' | 'julio_personal' | 'yanay_personal'

export interface EfectivoInfo {
  saldo_efectivo: string
  ingresos_mes: string
  gastos_mes: string
  ahorro_mes: string
}
export type TipoCategoria = 'recibo_fijo' | 'variable' | 'anual' | 'puntual' | 'ingreso'
export type GrupoCategoria = 'necesidad' | 'deseo' | 'puntual' | 'ingreso'

export interface Category {
  id: number
  nombre: string
  tipo: TipoCategoria
  grupo: GrupoCategoria
  dia_cargo: number | null
  presupuesto_mensual: string
  es_apoyo_suegros: boolean
  activa: boolean
  orden: number
}

export interface Transaction {
  id: number
  fecha: string
  tipo: TipoMovimiento
  category_id: number
  descripcion: string | null
  importe: string
  pagado_con: PagadoCon
  notas: string | null
  categoria_nombre: string | null
}

export interface NewTransaction {
  fecha: string
  tipo: TipoMovimiento
  category_id: number
  descripcion?: string | null
  importe: number | string
  pagado_con: PagadoCon
  notas?: string | null
}

export interface Goal {
  id: number
  nombre: string
  meta: string
  ahorrado: string
  fecha_objetivo: string | null
  orden: number
  progreso: number | null
  falta: string | null
  meses_restantes: number | null
  aportar_al_mes: string | null
}

export interface CategoryMonthRow {
  category_id: number
  nombre: string
  presupuesto: string
  gasto_real: string
  mes_anterior: string
  variacion: string
  restante: string
  pct_consumido: number | null
  es_apoyo_suegros: boolean
}

export interface ReciboRow {
  nombre: string
  dia: number | null
  previsto: string
  pagado: string
  estado: string
  es_apoyo_suegros: boolean
}

export interface BalanceComun {
  nominas_registradas: string
  paga_extra: string
  ingresos_extra: string
  total_ingresado: string
  gastos_comun: string
  gastos_puntuales: string
  ahorro_mes: string
  prevision_nominas: string
}

export interface MonthDashboard {
  anio: number
  mes: number
  ingresos: string
  gastos: string
  gastos_puntuales: string
  ahorro: string
  queda_por_gastar: string
  tasa_ahorro: number | null
  categorias: CategoryMonthRow[]
  recibos: ReciboRow[]
  balance_comun: BalanceComun
  necesidades: string
  deseos: string
  ahorro_regla: string
}

// ---------- Panel Anual ----------
export interface YearCategoryRow {
  category_id: number
  nombre: string
  es_apoyo_suegros: boolean
  meses: string[]
  total_anio: string
  media_mes: string
  presupuesto_anio: string
  desviacion: string
}

export interface YearDashboard {
  anio: number
  categorias: YearCategoryRow[]
  total_gastos: string[]
  total_ingresos: string[]
  ahorro_mes: string[]
  ahorro_acumulado: string[]
  total_gastos_anio: string
  total_ingresos_anio: string
  ahorro_anio: string
}

// ---------- Configuración ----------
export interface IncomeProfileDerived {
  id: number
  titular: string
  nomina_mensual: string
  num_pagas: number
  pct_a_comun: string
  bruto_anual: string
  aporta_al_mes: string
  dinero_libre: string
  meses_pagas_extra: string | null
}

export interface ConfigSummary {
  ingresos: IncomeProfileDerived[]
  ingreso_total_hogar: string
  disponible_comun_mes: string
  total_presupuestado: string
  ahorro_mensual_previsto: string
}

export interface AnnualExpense {
  id: number
  concepto: string
  importe_anual: string
  mes_cargo: number | null
  compania: string | null
  category_id: number | null
  provision_mensual: string
}

export interface SuegrosConfig {
  id: number
  meses_previstos: number
  fecha_desde: string
  coste_mensual: string
  fecha_hasta: string | null
  coste_total: string
  ahorro_al_terminar: string
}

// ---------- Patrimonio ----------
export type TipoPatrimonio = 'activo' | 'pasivo'

export interface NetWorthItem {
  id: number
  nombre: string
  tipo: TipoPatrimonio
  orden: number
}

export interface NetWorthEntry {
  id: number
  item_id: number
  anio: number
  mes: number
  importe: string
}

// ---------- Importar ----------
export interface ImportRow {
  fecha: string
  concepto: string
  importe: string
}

export interface ImportRowPreview {
  fecha: string
  concepto: string
  importe: string
  tipo_sugerido: TipoMovimiento
  category_id_sugerida: number | null
  categoria_sugerida: string | null
  reconocido: boolean
}

export interface ImportMonthCheck {
  mes: number | null
  anio: number | null
  ya_registrados: number
  es_mes_nuevo: boolean
  aviso: string
}

export interface ImportPreview {
  filas: ImportRowPreview[]
  movimientos_pegados: number
  suma_extracto: string
  sin_categorizar: number
  saldo_anterior: string
  saldo_deberia_quedar: string
  saldo_real_banco: string | null
  diferencia: string | null
  cuadra: boolean | null
  comprobacion_mes: ImportMonthCheck
}

export interface UserOut {
  id: number
  username: string | null
  display_name: string
  email: string
  mfa_enabled: boolean
  must_change_password: boolean
  is_admin: boolean
}

// Ficha de usuario en el panel de la cuenta de rescate
export interface AdminUser {
  id: number
  username: string | null
  display_name: string
  mfa_enabled: boolean
  must_change_password: boolean
  bloqueado: boolean
}

export interface BalanceSnapshotOut {
  id: number
  saldo_total: string
  saldo_retenido: string
  nota_retencion: string | null
  fecha: string
}

export interface SaldoInfo {
  saldo_total: string
  saldo_retenido: string
  saldo_disponible: string
  nota_retencion: string | null
  fecha: string
  colchon_meses: number | null
}
