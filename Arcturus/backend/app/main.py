from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.config import settings
from app.database import Base, SessionLocal, engine
from app.models import User
from app.routers import auth, containers, db, memo, sftp, system, ws


def seed_admin():
    db: Session = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == settings.admin_username).first()
        if not existing:
            db.add(
                User(
                    username=settings.admin_username,
                    password_hash=hash_password(settings.admin_password),
                    is_active=True,
                )
            )
            db.commit()
    finally:
        db.close()


def migrate():
    with engine.connect() as conn:
        try:
            conn.execute(
                text("ALTER TABLE db_connections ADD COLUMN db_type VARCHAR(20) NOT NULL DEFAULT 'postgresql'")
            )
            conn.commit()
        except Exception:
            pass  # 이미 컬럼이 존재하는 경우


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_admin()
    migrate()
    yield


app = FastAPI(title="Arcturus Panel", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(containers.router)
app.include_router(db.router)
app.include_router(memo.router)
app.include_router(sftp.router)
app.include_router(system.router)
app.include_router(ws.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
