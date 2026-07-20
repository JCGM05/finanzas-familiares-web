"""Tests del efectivo: caja separada y que la importación bancaria lo ignora."""

from datetime import date
from decimal import Decimal

from app import models
from app.services import dashboard as svc
from app.services import importer as imp


def _add(db, fecha, tipo, catkey_id, importe, pagado_con):
    db.add(models.Transaction(fecha=fecha, tipo=tipo, category_id=catkey_id, importe=importe, pagado_con=pagado_con))
    db.commit()


def test_saldo_efectivo_y_flujo_mes(db):
    cat = db.query(models.Category).first()
    ef = models.PagadoCon.EFECTIVO
    # ingreso en efectivo 800 (salario en B) y gasto en efectivo 50, en julio
    _add(db, date(2026, 7, 4), models.TipoMovimiento.INGRESO_EXTRA, cat.id, 800, ef)
    _add(db, date(2026, 7, 10), models.TipoMovimiento.GASTO, cat.id, 50, ef)
    # un ingreso en efectivo de un mes anterior (cuenta al saldo, no al mes)
    _add(db, date(2026, 6, 1), models.TipoMovimiento.INGRESO_EXTRA, cat.id, 200, ef)

    info = svc.build_efectivo_info(db, 2026, 7)
    assert info.ingresos_mes == Decimal("800")
    assert info.gastos_mes == Decimal("50")
    assert info.ahorro_mes == Decimal("750")
    # saldo acumulado = 800 + 200 - 50
    assert info.saldo_efectivo == Decimal("950")


def test_importacion_ignora_efectivo(db):
    """Un movimiento en efectivo con misma fecha/importe que una línea del banco
    NO debe casarse ni contar en la conciliación."""
    cat = db.query(models.Category).first()
    # movimiento en efectivo de 69.69 el 05/07 (mismo importe que la hipoteca del banco)
    _add(db, date(2026, 7, 5), models.TipoMovimiento.GASTO, cat.id, Decimal("69.69"), models.PagadoCon.EFECTIVO)

    filas = imp.parse_file("e.csv", b"Fecha;Concepto;Importe\n05/07/2026;PRESTAMO;-69,69\n")
    prev = imp.build_preview(db, filas, Decimal("0"), None)
    fila = prev.filas[0]
    # Debe casar con la HIPOTECA (cuenta común), no con el gasto en efectivo
    assert fila.reconocido is True
    assert fila.categoria_sugerida == "Hipoteca + Seguro hogar"


def test_dashboard_comun_no_incluye_efectivo(db):
    """El panel mensual (cuenta común) no debe sumar gastos en efectivo."""
    cat = next(c for c in db.query(models.Category).all() if c.nombre.startswith("Comida"))
    antes = svc.build_month_dashboard(db, 2026, 7).gastos
    _add(db, date(2026, 7, 20), models.TipoMovimiento.GASTO, cat.id, 999, models.PagadoCon.EFECTIVO)
    despues = svc.build_month_dashboard(db, 2026, 7).gastos
    assert antes == despues  # el gasto en efectivo no afecta al panel de la común
