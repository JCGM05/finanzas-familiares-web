"""Fixtures de test: BD SQLite en memoria con datos conocidos (julio 2026),
cuyos totales están verificados contra el Excel original."""

import os
import sys
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import models  # noqa: E402
from app.models import Base  # noqa: E402


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    _seed(s)
    yield s
    s.close()


def _seed(s):
    # --- Usuarios + perfiles de ingresos ---
    julio = models.User(email="julio@x", username="julio", password_hash="x", display_name="Julio")
    yanay = models.User(email="yanay@x", username="yanay", password_hash="x", display_name="Yanay")
    s.add_all([julio, yanay])
    s.flush()
    s.add_all([
        models.IncomeProfile(user_id=julio.id, nomina_mensual=1563, num_pagas=12, pct_a_comun=0.9),
        models.IncomeProfile(user_id=yanay.id, nomina_mensual=1480, num_pagas=14, pct_a_comun=0.9, meses_pagas_extra="6,12"),
    ])

    # --- Categorías (subconjunto representativo) ---
    cats = {
        "hipoteca": models.Category(nombre="Hipoteca + Seguro hogar", tipo=models.TipoCategoria.RECIBO_FIJO, grupo=models.GrupoCategoria.NECESIDAD, dia_cargo=1, presupuesto_mensual=725, orden=1),
        "comida": models.Category(nombre="Comida / Supermercado", tipo=models.TipoCategoria.VARIABLE, grupo=models.GrupoCategoria.NECESIDAD, presupuesto_mensual=500, orden=2),
        "compras": models.Category(nombre="Compras hogar / Menaje", tipo=models.TipoCategoria.VARIABLE, grupo=models.GrupoCategoria.DESEO, presupuesto_mensual=150, orden=3),
        "vivienda": models.Category(nombre="Compra vivienda (puntual)", tipo=models.TipoCategoria.PUNTUAL, grupo=models.GrupoCategoria.PUNTUAL, presupuesto_mensual=0, orden=4),
        "suegros": models.Category(nombre="Suegros · Alquiler", tipo=models.TipoCategoria.RECIBO_FIJO, grupo=models.GrupoCategoria.NECESIDAD, dia_cargo=1, presupuesto_mensual=230, es_apoyo_suegros=True, orden=5),
        "ingresos": models.Category(nombre="Ingresos", tipo=models.TipoCategoria.INGRESO, grupo=models.GrupoCategoria.INGRESO, presupuesto_mensual=0, orden=6),
    }
    s.add_all(cats.values())
    s.flush()

    comun = models.PagadoCon.CUENTA_COMUN
    G = models.TipoMovimiento.GASTO
    N = models.TipoMovimiento.INGRESO_NOMINA
    E = models.TipoMovimiento.INGRESO_EXTRA
    movs = [
        (date(2026, 7, 5), G, "hipoteca", 69.69, comun),
        (date(2026, 7, 11), G, "comida", 100, comun),
        (date(2026, 7, 16), G, "comida", 40, comun),
        (date(2026, 7, 12), G, "compras", 788, comun),
        (date(2026, 7, 1), G, "vivienda", 3178.30, comun),
        (date(2026, 7, 3), N, "ingresos", 1300, comun),
        (date(2026, 7, 16), N, "ingresos", 1000, comun),
        (date(2026, 7, 16), E, "ingresos", 1600, comun),
    ]
    for fecha, tipo, catkey, importe, pc in movs:
        s.add(models.Transaction(fecha=fecha, tipo=tipo, category_id=cats[catkey].id, importe=importe, pagado_con=pc))

    s.add(models.BalanceSnapshot(saldo_total=21738.25, saldo_retenido=9000, fecha=date(2026, 7, 16)))
    s.commit()
