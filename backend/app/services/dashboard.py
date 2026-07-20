"""
Réplica de las fórmulas del Excel (hojas Panel Mensual e Inicio) en Python.

Reglas clave que respetamos del Excel:
- El "gasto real" de una categoría suma solo movimientos de tipo Gasto pagados
  con la Cuenta común, del mes/año elegido (Panel Mensual!D8, SUMIFS).
- La comparativa con el mes anterior envuelve enero -> diciembre del año previo
  (Panel Mensual!E8, IF(mes=1, mes-1 con año-1, ...)).
- El colchón se calcula sobre el saldo DISPONIBLE real (total - retenido),
  no sobre el saldo total (Configuración!E21).
- Gasto personal de cada uno: movimientos pagados con su cuenta personal.
"""

from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.schemas import (
    BalanceComun,
    CategoryMonthRow,
    EfectivoInfo,
    MonthDashboard,
    ReciboRow,
    SaldoInfo,
    YearCategoryRow,
    YearDashboard,
)

Z = Decimal("0")


def _paga_extra_del_mes(db: Session, mes: int) -> Decimal:
    """Paga extra prevista de quien tenga meses_pagas_extra que incluya el mes."""
    total = Z
    for perfil in db.query(models.IncomeProfile).all():
        if perfil.meses_pagas_extra:
            meses = {int(m) for m in perfil.meses_pagas_extra.split(",") if m.strip().isdigit()}
            if mes in meses:
                total += Decimal(str(perfil.nomina_mensual))
    return total


def _prev_period(anio: int, mes: int) -> tuple[int, int]:
    return (anio - 1, 12) if mes == 1 else (anio, mes - 1)


def _sum_gastos_categoria(
    db: Session, category_id: int, anio: int, mes: int, pagado_con: models.PagadoCon
) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(models.Transaction.importe), 0))
        .filter(
            models.Transaction.category_id == category_id,
            models.Transaction.tipo == models.TipoMovimiento.GASTO,
            models.Transaction.pagado_con == pagado_con,
            func.extract("year", models.Transaction.fecha) == anio,
            func.extract("month", models.Transaction.fecha) == mes,
        )
        .scalar()
    )
    return Decimal(str(total))


def _sum_por_tipo(
    db: Session,
    tipo: models.TipoMovimiento,
    anio: int,
    mes: int,
    pagado_con: models.PagadoCon,
) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(models.Transaction.importe), 0))
        .filter(
            models.Transaction.tipo == tipo,
            models.Transaction.pagado_con == pagado_con,
            func.extract("year", models.Transaction.fecha) == anio,
            func.extract("month", models.Transaction.fecha) == mes,
        )
        .scalar()
    )
    return Decimal(str(total))


def build_month_dashboard(db: Session, anio: int, mes: int) -> MonthDashboard:
    p_anio, p_mes = _prev_period(anio, mes)
    comun = models.PagadoCon.CUENTA_COMUN

    categorias = (
        db.query(models.Category)
        .filter(models.Category.activa.is_(True))
        .order_by(models.Category.orden)
        .all()
    )

    filas: list[CategoryMonthRow] = []
    recibos: list[ReciboRow] = []
    necesidades = Z
    deseos = Z
    gastos_recurrentes = Z   # gastos "normales" del mes (sin puntuales)
    gastos_puntuales = Z     # pagos únicos (compra casa, etc.)
    queda_por_gastar = Z

    for cat in categorias:
        # las categorías de ingreso no son gasto: se saltan en el resumen de gasto
        if cat.tipo == models.TipoCategoria.INGRESO:
            continue

        gasto_real = _sum_gastos_categoria(db, cat.id, anio, mes, comun)
        mes_anterior = _sum_gastos_categoria(db, cat.id, p_anio, p_mes, comun)
        presupuesto = Decimal(str(cat.presupuesto_mensual))
        restante = presupuesto - gasto_real
        pct = float(gasto_real / presupuesto) if presupuesto != 0 else None

        filas.append(
            CategoryMonthRow(
                category_id=cat.id,
                nombre=cat.nombre,
                presupuesto=presupuesto,
                gasto_real=gasto_real,
                mes_anterior=mes_anterior,
                variacion=gasto_real - mes_anterior,
                restante=restante,
                pct_consumido=pct,
                es_apoyo_suegros=cat.es_apoyo_suegros,
            )
        )

        if cat.tipo == models.TipoCategoria.PUNTUAL:
            gastos_puntuales += gasto_real
        else:
            gastos_recurrentes += gasto_real
            queda_por_gastar += restante
        if cat.grupo == models.GrupoCategoria.NECESIDAD:
            necesidades += gasto_real
        elif cat.grupo == models.GrupoCategoria.DESEO:
            deseos += gasto_real

        if cat.tipo == models.TipoCategoria.RECIBO_FIJO:
            recibos.append(
                ReciboRow(
                    nombre=cat.nombre,
                    dia=cat.dia_cargo,
                    previsto=presupuesto,
                    pagado=gasto_real,
                    estado="Pagado" if gasto_real > 0 else "Pendiente",
                    es_apoyo_suegros=cat.es_apoyo_suegros,
                )
            )

    # --- Ingresos del mes (Balance de la cuenta común) ---
    nominas = _sum_por_tipo(db, models.TipoMovimiento.INGRESO_NOMINA, anio, mes, comun)
    extra = _sum_por_tipo(db, models.TipoMovimiento.INGRESO_EXTRA, anio, mes, comun)
    paga_extra = _paga_extra_del_mes(db, mes)

    ingresos = nominas + extra + paga_extra
    # El ahorro real del mes NO cuenta los pagos puntuales (compra casa, etc.),
    # que distorsionarían la foto del mes normal. Se muestran aparte.
    ahorro = ingresos - gastos_recurrentes
    tasa_ahorro = float(ahorro / ingresos) if ingresos != 0 else None

    # Previsión de nóminas (referencia): lo que aportan de nómina a la común
    prevision_nominas = Z
    for perfil in db.query(models.IncomeProfile).all():
        prevision_nominas += Decimal(str(perfil.nomina_mensual)) * Decimal(str(perfil.pct_a_comun))

    balance_comun = BalanceComun(
        nominas_registradas=nominas,
        paga_extra=paga_extra,
        ingresos_extra=extra,
        total_ingresado=ingresos,
        gastos_comun=gastos_recurrentes,
        gastos_puntuales=gastos_puntuales,
        ahorro_mes=ahorro,
        prevision_nominas=prevision_nominas,
    )

    return MonthDashboard(
        anio=anio,
        mes=mes,
        ingresos=ingresos,
        gastos=gastos_recurrentes,
        gastos_puntuales=gastos_puntuales,
        ahorro=ahorro,
        queda_por_gastar=queda_por_gastar,
        tasa_ahorro=tasa_ahorro,
        categorias=filas,
        recibos=recibos,
        balance_comun=balance_comun,
        necesidades=necesidades,
        deseos=deseos,
        ahorro_regla=ahorro,
    )


def build_year_dashboard(db: Session, anio: int) -> YearDashboard:
    """Panel Anual: matriz categoría × 12 meses del año (solo cuenta común)."""
    comun = models.PagadoCon.CUENTA_COMUN
    categorias = (
        db.query(models.Category)
        .filter(models.Category.activa.is_(True))
        .order_by(models.Category.orden)
        .all()
    )

    filas: list[YearCategoryRow] = []
    total_gastos = [Z] * 12

    for cat in categorias:
        if cat.tipo == models.TipoCategoria.INGRESO:
            continue
        meses = [_sum_gastos_categoria(db, cat.id, anio, m, comun) for m in range(1, 13)]
        total_anio = sum(meses, Z)
        presupuesto = Decimal(str(cat.presupuesto_mensual))
        filas.append(
            YearCategoryRow(
                category_id=cat.id,
                nombre=cat.nombre,
                es_apoyo_suegros=cat.es_apoyo_suegros,
                meses=meses,
                total_anio=total_anio,
                media_mes=total_anio / 12,
                presupuesto_anio=presupuesto * 12,
                desviacion=presupuesto * 12 - total_anio,
            )
        )
        for i in range(12):
            total_gastos[i] += meses[i]

    # Ingresos por mes: nóminas + extra + paga extra prevista de ese mes
    total_ingresos = []
    for m in range(1, 13):
        nominas = _sum_por_tipo(db, models.TipoMovimiento.INGRESO_NOMINA, anio, m, comun)
        extra = _sum_por_tipo(db, models.TipoMovimiento.INGRESO_EXTRA, anio, m, comun)
        total_ingresos.append(nominas + extra + _paga_extra_del_mes(db, m))

    ahorro_mes = [total_ingresos[i] - total_gastos[i] for i in range(12)]
    acumulado = []
    corrido = Z
    for i in range(12):
        corrido += ahorro_mes[i]
        acumulado.append(corrido)

    return YearDashboard(
        anio=anio,
        categorias=filas,
        total_gastos=total_gastos,
        total_ingresos=total_ingresos,
        ahorro_mes=ahorro_mes,
        ahorro_acumulado=acumulado,
        total_gastos_anio=sum(total_gastos, Z),
        total_ingresos_anio=sum(total_ingresos, Z),
        ahorro_anio=sum(ahorro_mes, Z),
    )


def build_efectivo_info(db: Session, anio: int, mes: int) -> EfectivoInfo:
    """Caja de efectivo: saldo acumulado (todo el histórico) y flujo del mes.
    Los ingresos son movimientos tipo ingreso_* y los gastos tipo gasto,
    todos con pagado_con = efectivo."""
    ef = models.PagadoCon.EFECTIVO
    ingreso_tipos = [models.TipoMovimiento.INGRESO_NOMINA, models.TipoMovimiento.INGRESO_EXTRA]

    def _sum(tipos, anio_f=None, mes_f=None) -> Decimal:
        q = db.query(func.coalesce(func.sum(models.Transaction.importe), 0)).filter(
            models.Transaction.pagado_con == ef,
            models.Transaction.tipo.in_(tipos),
        )
        if anio_f is not None:
            q = q.filter(func.extract("year", models.Transaction.fecha) == anio_f)
        if mes_f is not None:
            q = q.filter(func.extract("month", models.Transaction.fecha) == mes_f)
        return Decimal(str(q.scalar()))

    ingresos_hist = _sum(ingreso_tipos)
    gastos_hist = _sum([models.TipoMovimiento.GASTO])
    ingresos_mes = _sum(ingreso_tipos, anio, mes)
    gastos_mes = _sum([models.TipoMovimiento.GASTO], anio, mes)

    return EfectivoInfo(
        saldo_efectivo=ingresos_hist - gastos_hist,
        ingresos_mes=ingresos_mes,
        gastos_mes=gastos_mes,
        ahorro_mes=ingresos_mes - gastos_mes,
    )


def build_saldo_info(db: Session) -> SaldoInfo | None:
    snap = (
        db.query(models.BalanceSnapshot)
        .order_by(models.BalanceSnapshot.fecha.desc(), models.BalanceSnapshot.id.desc())
        .first()
    )
    if snap is None:
        return None

    total = Decimal(str(snap.saldo_total))
    retenido = Decimal(str(snap.saldo_retenido))
    disponible = total - retenido

    # Gasto mensual de referencia: presupuesto de categorías recurrentes
    # (todo lo que no sea puntual ni ingreso). Base del colchón, como en el Excel.
    gasto_ref = (
        db.query(func.coalesce(func.sum(models.Category.presupuesto_mensual), 0))
        .filter(
            models.Category.tipo.notin_(
                [models.TipoCategoria.PUNTUAL, models.TipoCategoria.INGRESO]
            )
        )
        .scalar()
    )
    gasto_ref = Decimal(str(gasto_ref))
    colchon = float(disponible / gasto_ref) if gasto_ref != 0 else None

    return SaldoInfo(
        saldo_total=total,
        saldo_retenido=retenido,
        saldo_disponible=disponible,
        nota_retencion=snap.nota_retencion,
        fecha=snap.fecha,
        colchon_meses=colchon,
    )
