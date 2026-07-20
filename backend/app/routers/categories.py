from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.deps import get_db
from app.schemas import CategoryCreate, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(incluir_inactivas: bool = False, db: Session = Depends(get_db)):
    q = db.query(models.Category)
    if not incluir_inactivas:
        q = q.filter(models.Category.activa.is_(True))
    return q.order_by(models.Category.orden).all()


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db)):
    existe = db.query(models.Category).filter(models.Category.nombre == payload.nombre).first()
    if existe:
        raise HTTPException(409, f"Ya existe una categoría con el nombre '{payload.nombre}'")
    cat = models.Category(**payload.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, payload: CategoryUpdate, db: Session = Depends(get_db)):
    cat = db.get(models.Category, category_id)
    if not cat:
        raise HTTPException(404, "Categoría no encontrada")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cat, field, value)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.get(models.Category, category_id)
    if not cat:
        raise HTTPException(404, "Categoría no encontrada")
    tiene_mov = (
        db.query(models.Transaction)
        .filter(models.Transaction.category_id == category_id)
        .first()
    )
    if tiene_mov:
        # No borramos categorías con movimientos: se desactivan para no romper el histórico.
        cat.activa = False
        db.commit()
        raise HTTPException(
            409,
            "La categoría tiene movimientos asociados; se ha desactivado en lugar de borrarla.",
        )
    db.delete(cat)
    db.commit()
