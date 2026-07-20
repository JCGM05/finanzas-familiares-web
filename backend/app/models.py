import enum
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TipoMovimiento(str, enum.Enum):
    GASTO = "gasto"
    INGRESO_NOMINA = "ingreso_nomina"
    INGRESO_EXTRA = "ingreso_extra"


class PagadoCon(str, enum.Enum):
    CUENTA_COMUN = "cuenta_comun"   # banco (entra en la conciliación)
    EFECTIVO = "efectivo"           # dinero en mano (NO entra en el cuadre bancario)
    # Valores antiguos (ya no se ofrecen en la UI, se conservan por compatibilidad):
    JULIO_PERSONAL = "julio_personal"
    YANAY_PERSONAL = "yanay_personal"


class TipoCategoria(str, enum.Enum):
    RECIBO_FIJO = "recibo_fijo"
    VARIABLE = "variable"
    ANUAL = "anual"
    PUNTUAL = "puntual"
    INGRESO = "ingreso"


class GrupoCategoria(str, enum.Enum):
    NECESIDAD = "necesidad"
    DESEO = "deseo"
    PUNTUAL = "puntual"
    INGRESO = "ingreso"


class TipoPatrimonio(str, enum.Enum):
    ACTIVO = "activo"
    PASIVO = "pasivo"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    username: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(100))
    # MFA / TOTP (Authy, Microsoft Authenticator)
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    # Cuenta de rescate ("break-glass"): puede resetear contraseña/MFA de los
    # usuarios normales desde el panel de administración, NO accede a las
    # finanzas y está exenta del MFA obligatorio (solo contraseña robusta).
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # Bloqueo por intentos fallidos (estilo fail2ban)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    income_profile: Mapped["IncomeProfile"] = relationship(back_populates="user", uselist=False)
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="created_by")
    recovery_codes: Mapped[list["RecoveryCode"]] = relationship(back_populates="user")


class RecoveryCode(Base):
    """Códigos de recuperación de un solo uso, por si se pierde el móvil del MFA."""

    __tablename__ = "recovery_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    code_hash: Mapped[str] = mapped_column(String(255))
    used: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship(back_populates="recovery_codes")


class LoginAttempt(Base):
    """Registro de intentos de login para el bloqueo tipo fail2ban."""

    __tablename__ = "login_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), index=True)
    ok: Mapped[bool] = mapped_column(Boolean, default=False)
    # 'password' (paso de usuario/contraseña) o 'mfa' (paso del código)
    kind: Mapped[str] = mapped_column(String(16), default="password")
    ts: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Setting(Base):
    """Ajustes globales editables desde la web (clave/valor). P. ej. app_name."""

    __tablename__ = "settings"

    clave: Mapped[str] = mapped_column(String(50), primary_key=True)
    valor: Mapped[str] = mapped_column(String(255))


class IncomeProfile(Base):
    """Configuración filas 8-9 y 12-15: nómina, % a la común, pagas extra."""

    __tablename__ = "income_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    nomina_mensual: Mapped[float] = mapped_column(Numeric(10, 2))
    num_pagas: Mapped[int]
    pct_a_comun: Mapped[float] = mapped_column(Numeric(5, 4))
    # meses (1-12) en que se cobran pagas extra, si num_pagas > 12. Ej: [6, 12]
    meses_pagas_extra: Mapped[str | None] = mapped_column(String(50), nullable=True)

    user: Mapped["User"] = relationship(back_populates="income_profile")


class BalanceSnapshot(Base):
    """Configuración filas 19-22: saldo total / retenido, en una fecha dada.
    Se guarda histórico; el 'actual' es el de fecha más reciente."""

    __tablename__ = "balance_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    saldo_total: Mapped[float] = mapped_column(Numeric(12, 2))
    saldo_retenido: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    nota_retencion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Category(Base):
    """Configuración filas 28-49. Editable desde la web (crear/editar/borrar)."""

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True)
    tipo: Mapped[TipoCategoria] = mapped_column(Enum(TipoCategoria))
    grupo: Mapped[GrupoCategoria] = mapped_column(Enum(GrupoCategoria))
    dia_cargo: Mapped[int | None] = mapped_column(nullable=True)
    # Presupuesto mensual editable. Para categorías tipo ANUAL con gastos
    # anuales vinculados, el backend prioriza la suma de annual_expenses/12
    # sobre este valor si existen filas vinculadas.
    presupuesto_mensual: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    es_apoyo_suegros: Mapped[bool] = mapped_column(Boolean, default=False)
    activa: Mapped[bool] = mapped_column(Boolean, default=True)
    orden: Mapped[int] = mapped_column(default=0)

    annual_expenses: Mapped[list["AnnualExpense"]] = relationship(back_populates="category")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="category")


class AnnualExpense(Base):
    """Configuración filas 55-57: IBI, seguros de coche... Su provisión
    mensual (importe_anual / 12) alimenta el presupuesto de su categoría."""

    __tablename__ = "annual_expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    concepto: Mapped[str] = mapped_column(String(150))
    importe_anual: Mapped[float] = mapped_column(Numeric(10, 2))
    mes_cargo: Mapped[int | None] = mapped_column(nullable=True)
    compania: Mapped[str | None] = mapped_column(String(150), nullable=True)

    category: Mapped["Category"] = relationship(back_populates="annual_expenses")


class Transaction(Base):
    """Hoja Movimientos. Mes/año y grupo NO se guardan: se derivan de fecha
    y de category.grupo respectivamente, para no duplicar dato."""

    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    fecha: Mapped[date] = mapped_column(Date, index=True)
    tipo: Mapped[TipoMovimiento] = mapped_column(Enum(TipoMovimiento))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    importe: Mapped[float] = mapped_column(Numeric(10, 2))
    pagado_con: Mapped[PagadoCon] = mapped_column(Enum(PagadoCon))
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    category: Mapped["Category"] = relationship(back_populates="transactions")
    created_by: Mapped["User"] = relationship(back_populates="transactions")


class Goal(Base):
    """Hoja Objetivos, convertida de 6 tarjetas fijas a tabla libre."""

    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100))
    meta: Mapped[float] = mapped_column(Numeric(10, 2))
    ahorrado: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    fecha_objetivo: Mapped[date | None] = mapped_column(Date, nullable=True)
    orden: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class NetWorthItem(Base):
    """Catálogo de conceptos de la hoja Patrimonio (Cuenta común, Hipoteca...)."""

    __tablename__ = "net_worth_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True)
    tipo: Mapped[TipoPatrimonio] = mapped_column(Enum(TipoPatrimonio))
    orden: Mapped[int] = mapped_column(default=0)

    entries: Mapped[list["NetWorthEntry"]] = relationship(back_populates="item")


class NetWorthEntry(Base):
    """Hoja Patrimonio normalizada: concepto x año x mes -> importe.
    El Excel solo tenía 12 columnas (un año); aquí no hay límite de años."""

    __tablename__ = "net_worth_entries"
    __table_args__ = (UniqueConstraint("item_id", "anio", "mes", name="uq_net_worth_item_periodo"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("net_worth_items.id"))
    anio: Mapped[int]
    mes: Mapped[int]
    importe: Mapped[float] = mapped_column(Numeric(12, 2), default=0)

    item: Mapped["NetWorthItem"] = relationship(back_populates="entries")


class SuegrosSupportConfig(Base):
    """Configuración filas 60-66: parámetros del apoyo temporal a los
    suegros. El coste mensual se deriva de sumar las categorías con
    es_apoyo_suegros=True, no se guarda aquí."""

    __tablename__ = "suegros_support_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    meses_previstos: Mapped[int]
    fecha_desde: Mapped[date] = mapped_column(Date)
