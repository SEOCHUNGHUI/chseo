import asyncio

import psycopg2
import psycopg2.extras
import pymysql
import pymysql.cursors
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import DBConnection, User
from app.schemas import (
    DBConnectionCreate,
    DBConnectionOut,
    QueryRequest,
    QueryResult,
    SchemaRequest,
)

router = APIRouter(prefix="/api/db", tags=["db"])

_SCHEMA_SQL = {
    "postgresql": """
        SELECT table_schema, table_name, table_type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY table_schema, table_name
    """,
    "mysql": """
        SELECT table_schema, table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        ORDER BY table_name
    """,
}


def _connect_pg(host, port, user, password, dbname):
    return psycopg2.connect(
        host=host, port=port, user=user, password=password,
        dbname=dbname, connect_timeout=10,
    )


def _connect_mysql(host, port, user, password, dbname):
    return pymysql.connect(
        host=host, port=port, user=user, password=password,
        database=dbname, connect_timeout=10,
        charset="utf8mb4", autocommit=False,
    )


def _run_query(host: str, port: int, user: str, password: str, dbname: str, db_type: str, sql: str) -> dict:
    try:
        if db_type == "mysql":
            conn = _connect_mysql(host, port, user, password, dbname)
            cursor_cls = pymysql.cursors.Cursor
        else:
            conn = _connect_pg(host, port, user, password, dbname)
            cursor_cls = None

        try:
            with (conn.cursor(cursor_cls) if cursor_cls else conn.cursor()) as cur:
                cur.execute(sql)
                if cur.description:
                    columns = [desc[0] for desc in cur.description]
                    rows = cur.fetchmany(1000)
                    conn.commit()
                    return {"columns": columns, "rows": [list(r) for r in rows], "rowcount": len(rows)}
                else:
                    conn.commit()
                    return {"columns": [], "rows": [], "rowcount": cur.rowcount or 0}
        finally:
            conn.close()
    except Exception as exc:
        return {"columns": [], "rows": [], "rowcount": 0, "error": str(exc)}


def _run_schema(host: str, port: int, user: str, password: str, dbname: str, db_type: str) -> dict:
    sql = _SCHEMA_SQL.get(db_type, _SCHEMA_SQL["postgresql"])
    return _run_query(host, port, user, password, dbname, db_type, sql)


def _get_conn_or_404(conn_id: int, db: Session) -> DBConnection:
    conn = db.query(DBConnection).filter(DBConnection.id == conn_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    return conn


@router.get("/connections", response_model=list[DBConnectionOut])
def list_connections(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(DBConnection).order_by(DBConnection.created_at).all()


@router.post("/connections", response_model=DBConnectionOut)
def create_connection(
    data: DBConnectionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    conn = DBConnection(**data.model_dump())
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


@router.delete("/connections/{conn_id}")
def delete_connection(conn_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    conn = _get_conn_or_404(conn_id, db)
    db.delete(conn)
    db.commit()
    return {"ok": True}


@router.post("/query", response_model=QueryResult)
async def execute_query(
    data: QueryRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    conn = _get_conn_or_404(data.connection_id, db)
    result = await asyncio.to_thread(
        _run_query, conn.host, conn.port, conn.username, data.password, conn.dbname, conn.db_type, data.sql
    )
    return result


@router.post("/schema")
async def fetch_schema(
    data: SchemaRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    conn = _get_conn_or_404(data.connection_id, db)
    result = await asyncio.to_thread(
        _run_schema, conn.host, conn.port, conn.username, data.password, conn.dbname, conn.db_type
    )
    return result
