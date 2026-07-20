from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.deps import get_db
from app.schemas import (
    AnnualExpenseCreate,
    AnnualExpenseOut,
    AnnualExpenseUpdate,
    BalanceSnapshotCreate,
    BalanceSnapshotOut,
    ConfigSummary,
    IncomeProfileOut,
    IncomeProfileUpdate,
    SuegrosConfigOut,
    SuegrosConfigUpdate,
)
from app.services import config as cfg_svc

router = APIRouter(prefix="/config", tags=["config"])


def _annual_out(e: models.AnnualExpense) -> AnnualExpenseOut:
    out = AnnualExpenseOut.model_validate(e)
    out.provision_mensual = (Decimal(str(e.importe_anual)) / 12).quantize(Decimal("0.01"))
    return out


@router.get("/income", response_model=list[IncomeProfileOut])
def list_income_profiles(db: Session = Depends(get_db)):
    return db.query(models.IncomeProfile).all()


@router.patch("/income/{profile_id}", response_model=IncomeProfileOut)
def update_income_profile(profile_id: int, payload: IncomeProfileUpdate, db: Session = Depends(get_db)):
    prof = db.get(models.IncomeProfile, profile_id)
    if not prof:
        raise HTTPException(404, "Perfil de ingresos no encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(prof, field, value)
    db.commit()
    db.refresh(prof)
    return prof


@router.get("/balance", response_model=BalanceSnapshotOut)
def current_balance(db: Session = Depends(get_db)):
    snap = (
        db.query(models.BalanceSnapshot)
        .order_by(models.BalanceSnapshot.fecha.desc(), models.BalanceSnapshot.id.desc())
        .first()
    )
    if not snap:
        raise HTTPException(404, "No hay ningún saldo registrado todavía")
    return snap


@router.post("/balance", response_model=BalanceSnapshotOut, status_code=201)
def add_balance_snapshot(payload: BalanceSnapshotCreate, db: Session = Depends(get_db)):
    snap = models.BalanceSnapshot(**payload.model_dump())
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return snap


# ---------- Resumen derivado (bloque 1 y totales del bloque 2 del Excel) ----------
@router.get("/summary", response_model=ConfigSummary)
def config_summary(db: Session = Depends(get_db)):
    return cfg_svc.build_summary(db)


# ---------- Gastos anuales (IBI, seguros...) ----------
@router.get("/annual-expenses", response_model=list[AnnualExpenseOut])
def list_annual_expenses(db: Session = Depends(get_db)):
    rows = db.query(models.AnnualExpense).order_by(models.AnnualExpense.id).all()
    return [_annual_out(e) for e in rows]


@router.post("/annual-expenses", response_model=AnnualExpenseOut, status_code=201)
def create_annual_expense(payload: AnnualExpenseCreate, db: Session = Depends(get_db)):
    e = models.AnnualExpense(**payload.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return _annual_out(e)


@router.patch("/annual-expenses/{expense_id}", response_model=AnnualExpenseOut)
def update_annual_expense(expense_id: int, payload: AnnualExpenseUpdate, db: Session = Depends(get_db)):
    e = db.get(models.AnnualExpense, expense_id)
    if not e:
        raise HTTPException(404, "Gasto anual no encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(e, field, value)
    db.commit()
    db.refresh(e)
    return _annual_out(e)


@router.delete("/annual-expenses/{expense_id}", status_code=204)
def delete_annual_expense(expense_id: int, db: Session = Depends(get_db)):
    e = db.get(models.AnnualExpense, expense_id)
    if not e:
        raise HTTPException(404, "Gasto anual no encontrado")
    db.delete(e)
    db.commit()


# ---------- Apoyo a los suegros (config temporal) ----------
def _suegros_out(db: Session, cfg: models.SuegrosSupportConfig) -> SuegrosConfigOut:
    return SuegrosConfigOut(
        id=cfg.id,
        meses_previstos=cfg.meses_previstos,
        fecha_desde=cfg.fecha_desde,
        **cfg_svc.suegros_derived(db, cfg),
    )


@router.get("/suegros", response_model=SuegrosConfigOut | None)
def get_suegros_config(db: Session = Depends(get_db)):
    cfg = db.query(models.SuegrosSupportConfig).first()
    if not cfg:
        return None
    return _suegros_out(db, cfg)


@router.patch("/suegros", response_model=SuegrosConfigOut)
def update_suegros_config(payload: SuegrosConfigUpdate, db: Session = Depends(get_db)):
    cfg = db.query(models.SuegrosSupportConfig).first()
    if not cfg:
        # Crear con valores por defecto si no existía
        cfg = models.SuegrosSupportConfig(
            meses_previstos=payload.meses_previstos or 1,
            fecha_desde=payload.fecha_desde or date.today(),
        )
        db.add(cfg)
    else:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(cfg, field, value)
    db.commit()
    db.refresh(cfg)
    return _suegros_out(db, cfg)
