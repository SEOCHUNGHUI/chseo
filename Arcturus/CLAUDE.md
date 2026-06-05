# Arcturus — Claude 작업 컨텍스트

웹 기반 서버 관리 패널. SSH 터미널 / Docker 컨테이너 관리 / DB 에디터.

---

## 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | React 18 + TypeScript + Vite |
| Terminal UI | xterm.js + FitAddon (WebSocket) |
| Backend | FastAPI + SQLAlchemy (sync) |
| Panel DB | PostgreSQL 16 (SQLAlchemy ORM) |
| Auth | JWT Bearer Token (python-jose) |
| SSH | paramiko (WebSocket 프록시) |
| Docker 제어 | docker SDK (`docker.sock` 마운트) |
| DB 에디터 드라이버 | psycopg2-binary (PG), pymysql (MySQL) |
| 프록시 | Nginx (리버스 프록시 + SPA 서빙) |
| 배포 | Docker Compose |

---

## 디렉토리 구조

```
Arcturus/
├── CLAUDE.md                  # 이 파일
├── README.md
├── .env                       # 비밀값 (Git 제외)
├── .env.example               # 환경변수 템플릿
├── docker-compose.yml
├── docs/
│   ├── SETUP.md
│   ├── TERMINAL.md
│   ├── CONTAINERS.md
│   └── DB_EDITOR.md
├── nginx/
│   ├── Dockerfile             # React 빌드 후 nginx로 서빙
│   └── nginx.conf             # /api/* → backend:8000, /ws/* → WebSocket
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py            # FastAPI app, lifespan, CORS, 라우터 등록
│       ├── config.py          # pydantic-settings, .env 로드
│       ├── database.py        # SQLAlchemy engine, SessionLocal, get_db
│       ├── models.py          # ORM 모델 (User, DBConnection)
│       ├── schemas.py         # Pydantic 스키마
│       ├── auth.py            # JWT, bcrypt, get_current_user Depends
│       ├── docker_client.py   # Docker SDK 싱글톤, list_containers, container_action
│       └── routers/
│           ├── auth.py        # POST /api/auth/login, GET /api/auth/me (IP rate limit)
│           ├── containers.py  # GET /api/containers, POST /api/containers/{id}/{action}
│           ├── db.py          # /api/db/* (연결 프로파일 CRUD, 쿼리 실행, 스키마)
│           └── ws.py          # WebSocket: /ws/logs/{id}, /ws/terminal/{id}, /ws/ssh
└── frontend/
    └── src/
        ├── api/client.ts      # apiFetch (JWT 자동 주입), wsUrl (token query param)
        ├── types.ts           # Container, User 등 공통 타입
        ├── App.tsx            # React Router (/, /login)
        ├── pages/
        │   ├── Login.tsx/css
        │   ├── Dashboard.tsx  # 레이아웃 shell: topbar + nav-sidebar + content
        │   ├── Dashboard.css
        │   ├── ContainersPage.tsx/css   # Docker 컨테이너 목록/로그/exec
        │   ├── TerminalPage.tsx/css     # SSH 서버 관리 + xterm.js
        │   └── DBEditorPage.tsx/css     # DB 에디터
        └── components/
            ├── Terminal.tsx/css         # exec 터미널 (xterm.js + ResizeObserver)
            └── LogViewer.tsx/css        # 컨테이너 로그 (tail -f 방식)
```

---

## 네트워크 구성

```
외부 :2943
   [nginx]  ── app 네트워크 ──  [backend]
                                    │
                              db 네트워크
                                    │
                              [postgres]
```

- `postgres`는 호스트 포트 노출 없음 — `db` 네트워크에서만 접근
- WebSocket은 Nginx에서 `proxy_read_timeout 86400s`로 장기 연결 유지

---

## 주요 환경 변수 (.env)

```env
PANEL_PORT=2943
POSTGRES_USER=...
POSTGRES_PASSWORD=...
POSTGRES_DB=...
DATABASE_URL=postgresql://user:pass@postgres:5432/dbname
JWT_SECRET=...          # 최소 32자 랜덤
JWT_EXPIRE_MINUTES=1440
ADMIN_USERNAME=admin
ADMIN_PASSWORD=...
ALLOWED_ORIGINS=["*"]
```

---

## 인증 흐름

```
POST /api/auth/login  →  JWT 발급  →  localStorage 저장
모든 API 요청: Authorization: Bearer <token>
WebSocket:    ?token=<token> (query param)
```

- `get_current_user` Depends → `HTTPBearer` → `decode_token` → DB에서 User 조회
- 로그인 실패: IP 기반 Rate Limit (5분 10회)

---

## 백엔드 패턴

### 새 라우터 추가 시

1. `backend/app/routers/new_router.py` 생성
2. `backend/app/main.py`에 import 후 `app.include_router(new_router.router)`
3. 인증이 필요하면 `_: User = Depends(get_current_user)` 추가

### DB 모델 추가/변경 시

- `models.py`에 모델 추가 → `main.py`의 `lifespan`에서 `Base.metadata.create_all` 자동 실행
- **기존 테이블에 컬럼 추가**는 `create_all`이 적용 안 됨 → `migrate()` 함수에 `ALTER TABLE` 추가 (main.py 참고)
- alembic 미사용, 수동 마이그레이션

### DB 쿼리 (라우터 내에서)

```python
# Sync SQLAlchemy
db: Session = Depends(get_db)
db.query(Model).filter(...).all()
db.add(obj); db.commit(); db.refresh(obj)

# 외부 DB 실행 (DB 에디터) — 블로킹이므로 thread로 감쌈
result = await asyncio.to_thread(_run_query, host, port, ...)
```

---

## 프론트엔드 패턴

### 페이지 추가 시

1. `frontend/src/pages/NewPage.tsx` + `NewPage.css` 생성
2. `Dashboard.tsx`의 `Page` 타입에 추가
3. nav-sidebar에 버튼 추가
4. content 영역에 `{page === "new" && <NewPage />}` 추가

### API 호출

```ts
// REST
const data = await apiFetch<T>("/api/some/path");
const data = await apiFetch<T>("/api/path", { method: "POST", body: JSON.stringify({...}) });

// WebSocket
const ws = new WebSocket(wsUrl("/ws/some/path"));
```

- `apiFetch`: 401이면 자동 로그아웃 + /login 리다이렉트
- `wsUrl`: `?token=<jwt>` 자동 추가

### xterm.js 사용 시 주의사항

- **FitAddon은 DOM 요소가 `display:none`이면 크기 측정 불가** → `display:none` 대신 `position:absolute` overlay 방식 사용
- **ResizeObserver** 로 컨테이너 크기 변화 감지 (`window.resize` 이벤트보다 정확)
- `term.open(el)` 이후 `fit.fit()` 호출 필수

---

## WebSocket 엔드포인트 (ws.py)

| 경로 | 기능 | 인증 |
|------|------|------|
| `/ws/logs/{container_id}` | 컨테이너 로그 스트리밍 | JWT query param |
| `/ws/terminal/{container_id}` | Docker exec 셸 | JWT query param |
| `/ws/terminal` | 호스트 셸 (/bin/bash) | JWT query param |
| `/ws/ssh` | SSH 프록시 (paramiko) | JWT query param |

- WS 인증: `_authenticate_ws(websocket)` — `?token=` 파라미터 검사
- exec 터미널: `docker exec` → raw socket → select() 루프
- SSH: paramiko channel → select() 루프
- resize 이벤트: `{ type: "resize", rows: N, cols: N }` JSON 텍스트로 전송

---

## DB 에디터 보안 정책

- **비밀번호 저장 안 함** — React state에만 보관, 서버에 저장 X
- 프로파일(host/port/user/dbname)만 Arcturus DB에 저장
- 쿼리마다 비밀번호를 request body에 포함하여 HTTPS로 전송
- 최대 1000행 반환으로 서버 부하 제한

---

## Docker 컨테이너 관리 (docker_client.py)

- Docker 클라이언트 싱글톤 (`_client`), ping() 실패 시 재연결
- `c.name` 으로 컨테이너 이름 추출 (attrs["Names"]보다 신뢰성 높음)
- ports: `c.ports` 딕셔너리 파싱 → `"hostport:containerport"` 형식으로 포맷

---

## 배포 명령어

```bash
# 전체 빌드 (프론트+백 변경)
docker compose up -d --build

# 백엔드만 재빌드
docker compose up -d --build backend

# 환경변수 변경 적용 (restart는 env 재로드 안 됨)
docker compose up -d --force-recreate backend

# 로그 확인
docker compose logs -f backend
docker compose logs -f nginx

# DB 초기화 (데이터 삭제)
docker compose down -v && docker compose up -d --build
```

---

## 알려진 이슈 및 결정사항

| 항목 | 결정 | 이유 |
|------|------|------|
| `allow_credentials=False` | CORS 설정 | `allow_origins=["*"]`와 `credentials=True` 동시 불가 |
| `bcrypt==4.0.1` | passlib 1.7.4 호환 | 4.2.1은 API 변경으로 충돌 |
| `asyncio.to_thread` | Docker SDK 블로킹 I/O | FastAPI async 루프 블로킹 방지 |
| FitAddon position:absolute | xterm 숨김 처리 | display:none이면 fit 측정 불가 |
| exec resize try/except | ws.py | resize 실패 시 WebSocket 전체 종료 방지 |
| MySQL `ssl_disabled=True` | pymysql | MySQL 8.x SSL negotiation 오류 방지 |
| db_type 컬럼 ALTER TABLE | main.py migrate() | alembic 없이 단순 마이그레이션 |
