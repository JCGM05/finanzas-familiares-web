"""Tests de la lógica de cálculo del dashboard, con valores verificados vs. Excel."""

from decimal import Decimal

from app.services import config as cfg_svc
from app.services import dashboard as svc


def D(x):
    return Decimal(str(x))


def test_balance_comun_julio(db):
    d = svc.build_month_dashboard(db, 2026, 7)
    b = d.balance_comun
    assert b.nominas_registradas == D("2300")
    assert b.ingresos_extra == D("1600")
    assert b.paga_extra == D("0")          # julio no lleva paga extra
    assert b.total_ingresado == D("3900")


def test_ahorro_excluye_puntuales(db):
    d = svc.build_month_dashboard(db, 2026, 7)
    # gastos recurrentes = hipoteca 69.69 + comida 140 + compras 788 = 997.69
    assert d.gastos == D("997.69")
    assert d.gastos_puntuales == D("3178.30")   # compra vivienda, aparte
    # ahorro real del mes = 3900 - 997.69 (sin el pago puntual)
    assert d.ahorro == D("2902.31")


def test_regla_50_30_20(db):
    d = svc.build_month_dashboard(db, 2026, 7)
    assert d.necesidades == D("209.69")   # hipoteca 69.69 + comida 140
    assert d.deseos == D("788")           # compras hogar


def test_suegros_marcados(db):
    d = svc.build_month_dashboard(db, 2026, 7)
    suegros = [c for c in d.categorias if c.es_apoyo_suegros]
    assert [c.nombre for c in suegros] == ["Suegros · Alquiler"]


def test_comparativa_mes_anterior_vacia(db):
    # No hay datos de junio -> mes_anterior 0 y variación = gasto actual
    d = svc.build_month_dashboard(db, 2026, 7)
    hipo = next(c for c in d.categorias if c.nombre.startswith("Hipoteca"))
    assert hipo.mes_anterior == D("0")
    assert hipo.gasto_real == D("69.69")


def test_saldo_disponible_y_colchon(db):
    info = svc.build_saldo_info(db)
    assert info.saldo_disponible == D("12738.25")   # 21738.25 - 9000
    # colchón = disponible / presupuesto recurrente (725+500+150+230 = 1605)
    assert round(info.colchon_meses, 2) == round(12738.25 / 1605, 2)


def test_config_summary(db):
    s = cfg_svc.build_summary(db)
    assert s.ingreso_total_hogar == D("3043")           # 1563 + 1480
    assert s.disponible_comun_mes == D("2738.70")       # 90% de cada nómina
    assert s.total_presupuestado == D("1605")           # 725+500+150+0+230
    assert s.ahorro_mensual_previsto == D("1133.70")    # 2738.70 - 1605


def test_year_ingresos_con_pagas_extra(db):
    y = svc.build_year_dashboard(db, 2026)
    # Yanay cobra paga extra en junio(6) y diciembre(12): 1480 cada uno
    assert y.total_ingresos[5] == D("1480")    # junio
    assert y.total_ingresos[11] == D("1480")   # diciembre
    assert y.total_ingresos[6] == D("3900")    # julio (nóminas + extra)
