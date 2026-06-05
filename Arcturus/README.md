# Arcturus 서버 관리 패널

웹 기반 서버 관리 패널입니다. SSH 터미널, Docker 컨테이너 관리, DB 에디터 기능을 제공합니다.

## 기술 스택

| 구성 요소 | 기술 |
|-----------|------|
| 프론트엔드 | React + TypeScript + Vite |
| 백엔드 | FastAPI + SQLAlchemy |
| 패널 DB | PostgreSQL 16 |
| 터미널 | xterm.js + WebSocket |
| 인증 | JWT (Bearer Token) |
| 컨테이너 | Docker Compose |
| 리버스 프록시 | Nginx |

## 문서

| 문서 | 설명 |
|------|------|
| [세팅 매뉴얼](docs/SETUP.md) | 설치, 환경 변수, 배포 가이드 |
| [터미널 가이드](docs/TERMINAL.md) | SSH 터미널 사용법 및 보안 안내 |
| [컨테이너 가이드](docs/CONTAINERS.md) | Docker 컨테이너 관리 기능 안내 |
| [DB 에디터 가이드](docs/DB_EDITOR.md) | DB 연결 및 SQL 실행 안내 |

## 빠른 시작

```bash
git clone https://github.com/SEOCHUNGHUI/chseo.git
cd chseo/Arcturus
cp .env.example .env    # .env 편집 필수
docker compose up -d --build
```

패널 접속: `http://<서버IP>:2943`
