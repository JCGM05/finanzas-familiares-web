"""Cálculos derivados de la hoja Configuración del Excel."""

from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.schemas import ConfigSummary, IncomeProfileDerived

Z = Decimal("0")


def _add_months(d: date, months: int) -> date:
    """Suma meses a una fecha sin dependencias externas (día = 1 en la práctica)."""
    m0 = d.month - 1 + months
    year = d.year + m0 // 12
    month = m0 % 12 + 1
    # día acotado por si el mes destino tiene menos días
    import calendar

    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def total_presupuestado(db: Session) -> Decimal:
    """Suma del presupuesto mensual de todas las categorías (excepto ingreso)."""
    total = (
        db.query(func.coalesce(func.sum(models.Category.presupuesto_mensual), 0))
        .filter(models.Category.tipo != models.TipoCategoria.INGRESO)
        .scalar()
    )
    return Decimal(str(total))


def coste_suegros(db: Session) -> Decimal:
    """Coste mensual del apoyo a los suegros = suma de sus categorías."""
    total = (
        db.query(func.coalesce(func.sum(models.Category.presupuesto_mensual), 0))
        .filter(models.Category.es_apoyo_suegros.is_(True))
        .scalar()
    )
    return Decimal(str(total))


def build_summary(db: Session) -> ConfigSummary:
    perfiles = db.query(models.IncomeProfile).join(models.User).all()
    ingresos: list[IncomeProfileDerived] = []
    ingreso_total = Z
    disponible_comun = Z
    for p in perfiles:
        nomina = Decimal(str(p.nomina_mensual))
        pct = Decimal(str(p.pct_a_comun))
        aporta = nomina * pct
        ingresos.append(
            IncomeProfileDerived(
                id=p.id,
                titular=p.user.display_name,
                nomina_mensual=nomina,
                num_pagas=p.num_pagas,
                pct_a_comun=pct,
                bruto_anual=nomina * p.num_pagas,
                aporta_al_mes=aporta,
                dinero_libre=nomina - aporta,
                meses_pagas_extra=p.meses_pagas_extra,
            )
        )
        ingreso_total += nomina
        disponible_comun += aporta

    presupuestado = total_presupuestado(db)
    return ConfigSummary(
        ingresos=ingresos,
        ingreso_total_hogar=ingreso_total,
        disponible_comun_mes=disponible_comun,
        total_presupuestado=presupuestado,
        ahorro_mensual_previsto=disponible_comun - presupuestado,
    )


def ahorro_mensual_previsto(db: Session) -> Decimal:
    s = build_summary(db)
    return s.ahorro_mensual_previsto


def suegros_derived(db: Session, cfg: models.SuegrosSupportConfig) -> dict:
    coste = coste_suegros(db)
    hasta = _add_months(cfg.fecha_desde, cfg.meses_previstos - 1) if cfg.meses_previstos else None
    return {
        "coste_mensual": coste,
        "fecha_hasta": hasta,
        "coste_total": coste * cfg.meses_previstos,
        "ahorro_al_terminar": ahorro_mensual_previsto(db) + coste,
    }
