from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Memo, User

router = APIRouter(prefix="/api/memos", tags=["memos"])


class MemoCreate(BaseModel):
    title: str = ""
    content: str = ""


class MemoUpdate(BaseModel):
    title: str
    content: str


class MemoOut(BaseModel):
    id: int
    title: str
    content: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MemoSummary(BaseModel):
    id: int
    title: str
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[MemoSummary])
def list_memos(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Memo).order_by(Memo.updated_at.desc()).all()


@router.post("", response_model=MemoOut)
def create_memo(data: MemoCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    memo = Memo(title=data.title, content=data.content)
    db.add(memo)
    db.commit()
    db.refresh(memo)
    return memo


@router.get("/{memo_id}", response_model=MemoOut)
def get_memo(memo_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    memo = db.query(Memo).filter(Memo.id == memo_id).first()
    if not memo:
        raise HTTPException(status_code=404, detail="Memo not found")
    return memo


@router.put("/{memo_id}", response_model=MemoOut)
def update_memo(memo_id: int, data: MemoUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    memo = db.query(Memo).filter(Memo.id == memo_id).first()
    if not memo:
        raise HTTPException(status_code=404, detail="Memo not found")
    memo.title = data.title
    memo.content = data.content
    memo.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(memo)
    return memo


@router.delete("/{memo_id}")
def delete_memo(memo_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    memo = db.query(Memo).filter(Memo.id == memo_id).first()
    if not memo:
        raise HTTPException(status_code=404, detail="Memo not found")
    db.delete(memo)
    db.commit()
    return {"ok": True}
