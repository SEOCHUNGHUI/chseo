# Arcturus 세팅 매뉴얼

## 목차
1. [사전 요구사항](#사전-요구사항)
2. [설치 및 배포](#설치-및-배포)
3. [환경 변수](#환경-변수)
4. [네트워크 구성](#네트워크-구성)
5. [기존 Docker 스택과 통합](#기존-docker-스택과-통합)
6. [업데이트 방법](#업데이트-방법)
7. [트러블슈팅](#트러블슈팅)
8. [보안 체크리스트](#보안-체크리스트)

---

## 사전 요구사항

- Docker 20.10 이상
- Docker Compose v2 (`docker compose` 명령 지원)
- Git

---

## 설치 및 배포

### 1. 저장소 클론

```bash
git clone https://github.com/SEOCHUNGHUI/chseo.git
cd chseo/Arcturus
```

### 2. 환경 변수 설정

```bash
cp .env.example .env
vi .env   # 아래 환경 변수 섹션 참고
```

### 3. 최초 실행

```bash
docker compose up -d --build
```

최초 실행 시 자동으로 수행되는 작업:
- PostgreSQL 데이터베이스 및 테이블 생성
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`로 관리자 계정 생성
- `db_connections` 테이블 마이그레이션

### 4. 접속 확인

```
http://<서버IP>:2943
```

---

## 환경 변수

`.env` 파일에 아래 항목을 설정합니다.

```env
# 패널 접속 포트 (기본값: 2943)
PANEL_PORT=2943

# PostgreSQL (Arcturus 내부용)
POSTGRES_USER=your_pg_user
POSTGRES_PASSWORD=your_pg_password
POSTGRES_DB=your_pg_dbname
DATABASE_URL=postgresql://your_pg_user:your_pg_password@postgres:5432/your_pg_dbname

# JWT 인증
JWT_SECRET=your-very-long-random-secret-key   # 반드시 변경
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440                        # 로그인 유지 시간 (분)

# 관리자 계정 (최초 실행 시 자동 생성)
ADMIN_USERNAME=admin                           # 반드시 변경
ADMIN_PASSWORD=your-strong-password            # 반드시 변경
```

### 환경 변수 주의사항

| 항목 | 주의사항 |
|------|----------|
| `JWT_SECRET` | 최소 32자 이상의 랜덤 문자열 사용. 유출 시 전체 인증 무력화 |
| `ADMIN_PASSWORD` | 특수문자 포함 12자 이상 권장. `@` 문자는 `DATABASE_URL`에서 URL 인코딩(`%40`) 필요 |
| `DATABASE_URL` | `@postgres:5432` — `postgres`는 컨테이너 서비스명으로 고정 |
| `PANEL_PORT` | 방화벽에서 해당 포트 허용 필요 |

### JWT_SECRET 생성 예시

```bash
openssl rand -hex 32
# 또는
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

## 네트워크 구성

Arcturus는 보안을 위해 두 개의 내부 네트워크를 사용합니다.

```
외부 (인터넷/LAN)
      │ :2943
   [nginx]  ── app 네트워크 ──  [backend]
                                    │
                              db 네트워크
                                    │
                              [postgres]
```

| 네트워크 | 포함 컨테이너 | 설명 |
|----------|--------------|------|
| `app` | nginx, backend | 웹 트래픽 |
| `db` | backend, postgres | DB 통신 전용. 외부 노출 없음 |

PostgreSQL은 호스트에 포트를 노출하지 않으므로 `app` 네트워크에서는 접근 불가합니다.

---

## 기존 Docker 스택과 통합

기존에 다른 Docker Compose 스택(MySQL, Redis 등)이 실행 중인 경우:

### 포트 충돌 확인

```bash
# 사용 중인 포트 확인
ss -tlnp | grep -E '2943|5432'
```

### 외부 컨테이너에 DB 에디터로 접속할 때

Arcturus 백엔드 컨테이너에서 다른 DB 컨테이너로 접속하려면 같은 Docker 네트워크에 있거나, 호스트 IP를 사용해야 합니다.

**방법 1: 호스트 IP 사용** (네트워크 무관)
```
Host: 192.168.0.75  # 서버 내부 IP
Port: 3306          # 노출된 포트
```

**방법 2: 컨테이너명 사용** (같은 Docker 네트워크일 때)
```
Host: mysql         # 컨테이너 서비스명
Port: 3306
```

같은 네트워크로 연결하려면 `docker-compose.yml`에 외부 네트워크를 추가합니다:

```yaml
# Arcturus docker-compose.yml에 추가
networks:
  db:
  app:
  gemiso-network:        # 기존 스택의 네트워크명
    external: true

services:
  backend:
    networks:
      - db
      - app
      - gemiso-network   # 추가
```

---

## 업데이트 방법

```bash
# 코드 업데이트
git pull

# 전체 재빌드 (프론트엔드 변경 포함)
docker compose up -d --build

# 백엔드만 재빌드 (백엔드만 변경된 경우)
docker compose up -d --build backend
```

### 환경 변수 변경 시

`docker restart`나 `docker compose restart`는 환경 변수를 새로 읽지 않습니다.

```bash
docker compose up -d --force-recreate backend
```

---

## 트러블슈팅

### Bad Gateway (502)

```bash
# 백엔드 로그 확인
docker compose logs -f backend
```

주요 원인:
- `DATABASE_URL` 오류 (패스워드 특수문자, 사용자명 불일치)
- PostgreSQL 아직 준비 안 됨 (healthcheck 대기)

### 로그인 실패

- 최초 실행 후 `ADMIN_USERNAME`/`ADMIN_PASSWORD`로 로그인
- 비밀번호 변경 후 컨테이너 재생성 필요 (`--force-recreate`)
- 이미 계정이 생성된 상태면 DB 초기화 후 재생성: `docker compose down -v`

### PostgreSQL 역할(Role) 없음 오류

```bash
# 볼륨 초기화 (데이터 삭제됨 — 주의)
docker compose down -v
docker compose up -d --build
```

### 컨테이너 목록이 비어 있음

백엔드 컨테이너가 Docker 소켓에 접근 가능한지 확인:

```bash
docker compose exec backend docker ps
```

오류 발생 시 `docker-compose.yml`에 소켓 마운트 확인:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

---

## 보안 체크리스트

프로덕션 배포 전 반드시 확인하세요.

- [ ] `JWT_SECRET`을 기본값(`dev-secret-change-in-production`)에서 변경
- [ ] `ADMIN_PASSWORD`를 강력한 패스워드로 변경
- [ ] `PANEL_PORT`를 방화벽으로 내부망 또는 특정 IP만 허용
- [ ] HTTPS 적용 (Nginx에 SSL 인증서 추가 권장)
- [ ] `.env` 파일을 `.gitignore`에 추가하여 Git에 커밋되지 않도록 확인
- [ ] `docker.sock` 마운트의 위험성 인지 (아래 참고)

### docker.sock 마운트 보안 주의

Arcturus 백엔드는 `/var/run/docker.sock`을 마운트하여 컨테이너를 제어합니다. 이는 **사실상 호스트 루트 권한**을 부여하는 것과 동일합니다.

- Arcturus 패널에 인가된 사용자만 접근 가능하도록 방화벽 설정 필수
- 패널 계정을 공유하지 마세요
- 가능하면 VPN 또는 내부망에서만 접속하도록 구성
