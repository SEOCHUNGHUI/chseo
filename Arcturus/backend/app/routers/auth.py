import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, verify_password
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

_failed: dict[str, list[float]] = defaultdict(list)
_WINDOW = 300   # 5분
_MAX = 10       # 최대 시도 횟수


def _rate_check(ip: str) -> None:
    now = time.monotonic()
    _failed[ip] = [t for t in _failed[ip] if now - t < _WINDOW]
    if len(_failed[ip]) >= _MAX:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts")


def _rate_fail(ip: str) -> None:
    _failed[ip].append(time.monotonic())


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    _rate_check(ip)
    user = db.query(User).filter(User.username == body.username, User.is_active.is_(True)).first()
    if not user or not verify_password(body.password, user.password_hash):
        _rate_fail(ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    _failed.pop(ip, None)
    return TokenResponse(access_token=create_access_token(user.username))


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user
