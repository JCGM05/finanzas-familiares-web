from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models import (
    GrupoCategoria,
    PagadoCon,
    TipoCategoria,
    TipoMovimiento,
    TipoPatrimonio,
)


# ---------- Categorías ----------
class CategoryBase(BaseModel):
    nombre: str
    tipo: TipoCategoria
    grupo: GrupoCategoria
    dia_cargo: int | None = None
    presupuesto_mensual: Decimal = Decimal("0")
    es_apoyo_suegros: bool = False
    activa: bool = True
    orden: int = 0


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    nombre: str | None = None
    tipo: TipoCategoria | None = None
    grupo: GrupoCategoria | None = None
    dia_cargo: int | None = None
    presupuesto_mensual: Decimal | None = None
    es_apoyo_suegros: bool | None = None
    activa: bool | None = None
    orden: int | None = None


class CategoryOut(CategoryBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Movimientos ----------
class TransactionBase(BaseModel):
    fecha: date
    tipo: TipoMovimiento
    category_id: int
    descripcion: str | None = None
    importe: Decimal
    pagado_con: PagadoCon
    notas: str | None = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    fecha: date | None = None
    tipo: TipoMovimiento | None = None
    category_id: int | None = None
    descripcion: str | None = None
    importe: Decimal | None = None
    pagado_con: PagadoCon | None = None
    notas: str | None = None


class TransactionOut(TransactionBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    categoria_nombre: str | None = None


# ---------- Objetivos ----------
class GoalBase(BaseModel):
    nombre: str
    meta: Decimal
    ahorrado: Decimal = Decimal("0")
    fecha_objetivo: date | None = None
    orden: int = 0


class GoalCreate(GoalBase):
    pass


class GoalUpdate(BaseModel):
    nombre: str | None = None
    meta: Decimal | None = None
    ahorrado: Decimal | None = None
    fecha_objetivo: date | None = None
    orden: int | None = None


class GoalOut(GoalBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    progreso: float | None = None
    falta: Decimal | None = None
    meses_restantes: int | None = None
    aportar_al_mes: Decimal | None = None


# ---------- Patrimonio ----------
class NetWorthItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    tipo: TipoPatrimonio
    orden: int


class NetWorthEntryUpsert(BaseModel):
    item_id: int
    anio: int
    mes: int
    importe: Decimal


class NetWorthEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    item_id: int
    anio: int
    mes: int
    importe: Decimal


# ---------- Config: ingresos y saldo ----------
class IncomeProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    nomina_mensual: Decimal
    num_pagas: int
    pct_a_comun: Decimal
    meses_pagas_extra: str | None = None


class IncomeProfileUpdate(BaseModel):
    nomina_mensual: Decimal | None = None
    num_pagas: int | None = None
    pct_a_comun: Decimal | None = None
    meses_pagas_extra: str | None = None


class BalanceSnapshotBase(BaseModel):
    saldo_total: Decimal
    saldo_retenido: Decimal = Decimal("0")
    nota_retencion: str | None = None
    fecha: date


class BalanceSnapshotCreate(BalanceSnapshotBase):
    pass


class BalanceSnapshotOut(BalanceSnapshotBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Dashboard ----------
class CategoryMonthRow(BaseModel):
    category_id: int
    nombre: str
    presupuesto: Decimal
    gasto_real: Decimal
    mes_anterior: Decimal
    variacion: Decimal            # gasto_real - mes_anterior (positivo = gastó más)
    restante: Decimal             # presupuesto - gasto_real
    pct_consumido: float | None   # gasto_real / presupuesto
    es_apoyo_suegros: bool = False  # para pintar la fila en lila


class ReciboRow(BaseModel):
    nombre: str
    dia: int | None
    previsto: Decimal
    pagado: Decimal
    estado: str                   # "Pagado" | "Pendiente"
    es_apoyo_suegros: bool = False


class BalanceComun(BaseModel):
    """Bloque 'Balance de la cuenta común' del Panel Mensual del Excel."""
    nominas_registradas: Decimal
    paga_extra: Decimal
    ingresos_extra: Decimal
    total_ingresado: Decimal
    gastos_comun: Decimal          # gastos recurrentes del mes (sin puntuales)
    gastos_puntuales: Decimal      # pagos únicos (compra casa, etc.), aparte
    ahorro_mes: Decimal            # ahorro real del mes = ingresos - gastos recurrentes
    prevision_nominas: Decimal     # referencia: lo que aportan de nómina a la común


class MonthDashboard(BaseModel):
    anio: int
    mes: int
    # KPIs (gastos y ahorro son del mes REAL: sin pagos puntuales)
    ingresos: Decimal
    gastos: Decimal                # gastos recurrentes del mes (sin puntuales)
    gastos_puntuales: Decimal      # pagos únicos, mostrados aparte
    ahorro: Decimal                # ingresos - gastos recurrentes
    queda_por_gastar: Decimal
    tasa_ahorro: float | None
    # detalle
    categorias: list[CategoryMonthRow]
    recibos: list[ReciboRow]
    balance_comun: BalanceComun
    # 50/30/20
    necesidades: Decimal
    deseos: Decimal
    ahorro_regla: Decimal


class EfectivoInfo(BaseModel):
    """Resumen de la 'caja' de efectivo (independiente del banco)."""
    saldo_efectivo: Decimal        # acumulado histórico: ingresos - gastos en efectivo
    ingresos_mes: Decimal          # ingresos en efectivo del mes
    gastos_mes: Decimal            # gastos en efectivo del mes
    ahorro_mes: Decimal            # ingresos_mes - gastos_mes


class SaldoInfo(BaseModel):
    saldo_total: Decimal
    saldo_retenido: Decimal
    saldo_disponible: Decimal
    nota_retencion: str | None
    fecha: date
    colchon_meses: float | None   # disponible / gasto mensual medio


# ---------- Panel Anual ----------
class YearCategoryRow(BaseModel):
    category_id: int
    nombre: str
    es_apoyo_suegros: bool
    meses: list[Decimal]          # 12 valores, gasto real de cada mes
    total_anio: Decimal
    media_mes: Decimal
    presupuesto_anio: Decimal     # presupuesto_mensual * 12
    desviacion: Decimal           # presupuesto_anio - total_anio


class YearDashboard(BaseModel):
    anio: int
    categorias: list[YearCategoryRow]
    total_gastos: list[Decimal]   # 12 valores
    total_ingresos: list[Decimal]  # 12 valores
    ahorro_mes: list[Decimal]     # 12 valores (ingresos - gastos por mes)
    ahorro_acumulado: list[Decimal]  # 12 valores (acumulado corrido)
    total_gastos_anio: Decimal
    total_ingresos_anio: Decimal
    ahorro_anio: Decimal


# ---------- Configuración: gastos anuales y apoyo suegros ----------
class AnnualExpenseBase(BaseModel):
    concepto: str
    importe_anual: Decimal
    mes_cargo: int | None = None
    compania: str | None = None
    category_id: int | None = None


class AnnualExpenseCreate(AnnualExpenseBase):
    pass


class AnnualExpenseUpdate(BaseModel):
    concepto: str | None = None
    importe_anual: Decimal | None = None
    mes_cargo: int | None = None
    compania: str | None = None
    category_id: int | None = None


class AnnualExpenseOut(AnnualExpenseBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    provision_mensual: Decimal = Decimal("0")   # se calcula en el router: importe_anual / 12


class SuegrosConfigBase(BaseModel):
    meses_previstos: int
    fecha_desde: date


class SuegrosConfigUpdate(BaseModel):
    meses_previstos: int | None = None
    fecha_desde: date | None = None


class SuegrosConfigOut(SuegrosConfigBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    coste_mensual: Decimal        # suma de categorías es_apoyo_suegros
    fecha_hasta: date | None      # fecha_desde + meses_previstos - 1
    coste_total: Decimal          # coste_mensual * meses_previstos
    ahorro_al_terminar: Decimal   # ahorro_mensual_previsto + coste_mensual


class IncomeProfileDerived(BaseModel):
    """Perfil de ingresos con los cálculos derivados del Excel."""
    id: int
    titular: str
    nomina_mensual: Decimal
    num_pagas: int
    pct_a_comun: Decimal
    bruto_anual: Decimal          # nomina * num_pagas
    aporta_al_mes: Decimal        # nomina * pct
    dinero_libre: Decimal         # nomina - aporta
    meses_pagas_extra: str | None


class ConfigSummary(BaseModel):
    """Valores derivados de Configuración (bloque 1 y totales del bloque 2)."""
    ingresos: list[IncomeProfileDerived]
    ingreso_total_hogar: Decimal          # suma nóminas mensuales
    disponible_comun_mes: Decimal         # suma de aporta_al_mes
    total_presupuestado: Decimal          # suma presupuesto_mensual (no ingreso)
    ahorro_mensual_previsto: Decimal      # disponible_comun - total_presupuestado


# ---------- Importar (conciliación bancaria) ----------
class ImportRowIn(BaseModel):
    fecha: date
    concepto: str
    importe: Decimal              # con signo: negativo = gasto, positivo = ingreso


class ImportPreviewRequest(BaseModel):
    filas: list[ImportRowIn]
    saldo_anterior: Decimal = Decimal("0")
    saldo_real_banco: Decimal | None = None


class ImportRowPreview(BaseModel):
    fecha: date
    concepto: str
    importe: Decimal
    tipo_sugerido: TipoMovimiento
    category_id_sugerida: int | None
    categoria_sugerida: str | None
    reconocido: bool              # True si se autocompletó por coincidencia


class ImportMonthCheck(BaseModel):
    mes: int | None
    anio: int | None
    ya_registrados: int
    es_mes_nuevo: bool
    aviso: str


class ImportPreviewResponse(BaseModel):
    filas: list[ImportRowPreview]
    movimientos_pegados: int
    suma_extracto: Decimal
    sin_categorizar: int
    saldo_anterior: Decimal
    saldo_deberia_quedar: Decimal
    saldo_real_banco: Decimal | None
    diferencia: Decimal | None
    cuadra: bool | None
    comprobacion_mes: ImportMonthCheck


class ImportCommitRow(BaseModel):
    fecha: date
    tipo: TipoMovimiento
    category_id: int
    descripcion: str | None = None
    importe: Decimal
    pagado_con: PagadoCon = PagadoCon.CUENTA_COMUN


class ImportCommitRequest(BaseModel):
    filas: list[ImportCommitRow]


class ImportCommitResponse(BaseModel):
    insertados: int
    duplicados_saltados: int = 0


# ---------- Autenticación ----------
class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    status: str            # "mfa_setup_required" | "mfa_required" | "ok"
    temp_token: str = ""
    # Solo para la cuenta de rescate (sin MFA): se entrega el token de acceso ya.
    access_token: str | None = None


class MfaCode(BaseModel):
    code: str


class MfaSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str
    qr_data_uri: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MfaSetupComplete(TokenResponse):
    # Se devuelven UNA sola vez, al configurar el MFA: el usuario debe guardarlos.
    recovery_codes: list[str]


class RecoveryStatus(BaseModel):
    remaining: int


class PasswordConfirm(BaseModel):
    password: str


class RecoveryCodesOut(BaseModel):
    recovery_codes: list[str]


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str | None
    display_name: str
    email: str
    mfa_enabled: bool
    must_change_password: bool
    is_admin: bool = False


# ---------- Administración (cuenta de rescate) ----------
class AdminUserOut(BaseModel):
    """Ficha de un usuario normal para el panel de administración."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str | None
    display_name: str
    mfa_enabled: bool
    must_change_password: bool
    bloqueado: bool = False   # derivado de locked_until (se rellena en el router)


class AdminResetPassword(BaseModel):
    admin_password: str       # el admin confirma SU contraseña
    new_password: str         # contraseña temporal para el usuario


class AdminConfirm(BaseModel):
    admin_password: str


class AppSettings(BaseModel):
    app_name: str


class AppNameUpdate(BaseModel):
    app_name: str
