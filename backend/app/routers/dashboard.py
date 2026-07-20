from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas import EfectivoInfo, MonthDashboard, SaldoInfo, YearDashboard
from app.services import dashboard as svc

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/efectivo", response_model=EfectivoInfo)
def efectivo(anio: int, mes: int, db: Session = Depends(get_db)):
    if not (1 <= mes <= 12):
        raise HTTPException(422, "mes debe estar entre 1 y 12")
    return svc.build_efectivo_info(db, anio, mes)


@router.get("/month", response_model=MonthDashboard)
def month_dashboard(anio: int, mes: int, db: Session = Depends(get_db)):
    if not (1 <= mes <= 12):
        raise HTTPException(422, "mes debe estar entre 1 y 12")
    return svc.build_month_dashboard(db, anio, mes)


@router.get("/year", response_model=YearDashboard)
def year_dashboard(anio: int, db: Session = Depends(get_db)):
    return svc.build_year_dashboard(db, anio)


@router.get("/saldo", response_model=SaldoInfo)
def saldo(db: Session = Depends(get_db)):
    info = svc.build_saldo_info(db)
    if info is None:
        raise HTTPException(404, "No hay ningún saldo registrado todavía")
    return info
