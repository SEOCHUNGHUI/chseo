# DB 에디터 페이지 가이드

PostgreSQL 및 MySQL 데이터베이스에 직접 연결하여 SQL 쿼리를 실행하는 에디터입니다.

## 목차
1. [기능 개요](#기능-개요)
2. [DB 연결 프로파일 관리](#db-연결-프로파일-관리)
3. [DB 접속 방법](#db-접속-방법)
4. [SQL 에디터 사용법](#sql-에디터-사용법)
5. [테이블 브라우저](#테이블-브라우저)
6. [결과 테이블](#결과-테이블)
7. [보안 모델](#보안-모델)
8. [DB별 사용 가이드](#db별-사용-가이드)
9. [제한 사항](#제한-사항)

---

## 기능 개요

| 기능 | 설명 |
|------|------|
| 다중 DB 연결 프로파일 | PostgreSQL / MySQL 프로파일 저장 관리 |
| 비밀번호 미저장 | 비밀번호는 메모리에만 존재, 영구 저장 안 함 |
| SQL 에디터 | Ctrl+Enter 실행, Tab 들여쓰기 |
| 테이블 브라우저 | 스키마/테이블 목록 탐색, 클릭 시 쿼리 자동 입력 |
| 결과 테이블 | 최대 1000행, NULL 구분 표시 |
| 에러 표시 | SQL 문법 오류 시 상세 메시지 출력 |

---

## DB 연결 프로파일 관리

### 프로파일 추가

좌측 사이드바 상단 **+** 버튼 클릭.

| 필드 | 설명 | 예시 |
|------|------|------|
| 이름 | 식별용 라벨 | `프로덕션 MySQL` |
| DB 종류 | PostgreSQL 또는 MySQL 선택 | — |
| Host | DB 서버 주소 | `192.168.0.75` 또는 `mysql` |
| Port | DB 포트 (자동 입력) | PostgreSQL: `5432`, MySQL: `3306` |
| Username | DB 사용자명 | `mymy` |
| DB Name | 접속할 데이터베이스명 | `mymy` |

> **비밀번호는 이 폼에 없습니다.** 접속 시 매번 입력합니다.

### DB 종류 선택에 따른 자동 변경

| 선택 | 포트 자동 변경 | 쿼리 방언 |
|------|--------------|-----------|
| 🐘 PostgreSQL | 5432 | 쌍따옴표 식별자 (`"table_name"`) |
| 🐬 MySQL | 3306 | 백틱 식별자 (`` `table_name` ``) |

### Host 입력 가이드

| 상황 | 권장 Host 값 |
|------|-------------|
| Arcturus와 DB가 같은 Docker 네트워크 | 컨테이너 서비스명 (`mysql`, `postgres`) |
| 다른 네트워크이거나 외부 서버 | 서버 IP (`192.168.0.75`) |
| 클라우드 DB (RDS 등) | 엔드포인트 URL |

### 프로파일 저장 위치

연결 프로파일(이름, 호스트, 포트, 사용자명, DB명)은 **Arcturus 내부 PostgreSQL DB**에 저장됩니다. 비밀번호는 저장되지 않습니다.

---

## DB 접속 방법

1. 좌측 목록에서 프로파일 클릭
2. 비밀번호 모달에서 DB 비밀번호 입력
3. **연결** 클릭 (또는 Enter)
4. 연결 성공 시:
   - 프로파일에 🟢 **연결됨** 배지 표시
   - 좌측 하단에 테이블 브라우저 표시
   - SQL 에디터 활성화

### 연결 해제

좌측 **해제** 버튼 클릭. 메모리의 비밀번호도 함께 삭제됩니다.

---

## SQL 에디터 사용법

### 단축키

| 단축키 | 동작 |
|--------|------|
| `Ctrl + Enter` | 쿼리 실행 |
| `Tab` | 들여쓰기 (2칸 공백) |

### 실행 결과 정보

에디터 하단 툴바에 표시:
- **N행 · Xms** — SELECT 결과 행 수 및 실행 시간
- **N행 영향 · Xms** — INSERT/UPDATE/DELETE 영향받은 행 수 및 실행 시간
- **● 연결명 (DB명)** — 현재 연결 중인 DB 정보

### 에러 표시

SQL 문법 오류 또는 실행 오류 시 하단에 빨간색으로 에러 메시지가 표시됩니다.

---

## 테이블 브라우저

DB 연결 후 좌측 하단에 테이블 목록이 표시됩니다.

- **PostgreSQL** — `스키마명` > `테이블명` 계층 구조
- **MySQL** — 현재 접속 DB의 테이블 목록 (플랫)
- **뷰(View)** — `◈` 아이콘으로 구분

### 테이블 클릭 동작

테이블을 클릭하면 에디터에 SELECT 쿼리가 자동으로 입력됩니다.

```sql
-- PostgreSQL
SELECT * FROM "public"."users" LIMIT 100;

-- MySQL
SELECT * FROM `users` LIMIT 100;
```

---

## 결과 테이블

| 항목 | 설명 |
|------|------|
| **# 컬럼** | 행 번호 (1부터 시작) |
| **NULL** | null 값은 이탤릭체로 `NULL` 표시 |
| **최대 행 수** | 1000행으로 자동 제한 |
| **가로 스크롤** | 컬럼이 많으면 좌우 스크롤 |
| **헤더 고정** | 세로 스크롤 시 컬럼 헤더 유지 |

> 1000행 이상의 데이터가 필요하면 SQL에 `OFFSET`을 사용하거나 조건을 추가하세요.

---

## 보안 모델

### 비밀번호 처리 흐름

```
사용자 입력 (접속 모달)
      │  React state에만 보관 (localStorage/서버 저장 X)
      │
      │  HTTPS 암호화 전송 (쿼리 요청마다)
      ▼
백엔드 (비밀번호로 DB 연결 → 쿼리 실행 → 연결 즉시 종료)
      │
      │  비밀번호 폐기 (요청 처리 후)
      ▼
결과 JSON 반환
```

### 저장되는 정보

| 정보 | 저장 위치 | 비고 |
|------|-----------|------|
| 프로파일 이름 | Arcturus DB | 민감하지 않음 |
| Host / Port | Arcturus DB | 민감하지 않음 |
| Username | Arcturus DB | 민감하지 않음 |
| DB Name | Arcturus DB | 민감하지 않음 |
| **비밀번호** | **저장 안 함** | React state에만, 브라우저 새로고침 시 사라짐 |

### 위협 모델

| 위협 | 영향 | 대응 |
|------|------|------|
| Arcturus DB 탈취 | Host/포트/사용자명 노출, 비밀번호는 없음 | 비밀번호 미저장 정책 |
| 브라우저 메모리 탈취 | 접속 중인 비밀번호 노출 가능 | HTTPS 사용, 신뢰된 환경에서만 사용 |
| 네트워크 도청 | HTTPS로 보호 | SSL/TLS 적용 |
| 패널 미인가 접속 | DB 쿼리 실행 가능 | JWT 인증, 강력한 패널 비밀번호 |
| SQL Injection | 직접 SQL을 실행하는 에디터이므로 해당 없음 | 의도된 기능 |

### 브라우저 새로고침 시

비밀번호는 React state에만 존재하므로 **새로고침 후 재입력이 필요**합니다. 이는 의도된 보안 동작입니다.

---

## DB별 사용 가이드

### PostgreSQL

```sql
-- 테이블 목록
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

-- 테이블 구조
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users';

-- 인덱스 확인
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'users';

-- 실행 계획
EXPLAIN ANALYZE SELECT * FROM users WHERE id = 1;

-- DB 크기
SELECT pg_size_pretty(pg_database_size(current_database()));

-- 테이블 크기
SELECT pg_size_pretty(pg_total_relation_size('users'));
```

### MySQL

```sql
-- 테이블 목록
SHOW TABLES;

-- 테이블 구조
DESCRIBE tbl_login_log;
-- 또는
SHOW COLUMNS FROM tbl_login_log;

-- 인덱스 확인
SHOW INDEX FROM tbl_login_log;

-- 실행 계획
EXPLAIN SELECT * FROM tbl_login_log WHERE id = 1;

-- DB 크기 (MB)
SELECT
  table_schema AS 'DB',
  ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)'
FROM information_schema.tables
WHERE table_schema = DATABASE()
GROUP BY table_schema;

-- 프로세스 목록
SHOW PROCESSLIST;

-- 슬로우 쿼리 확인
SHOW VARIABLES LIKE 'slow_query%';
```

---

## 제한 사항

- **최대 1000행** — 더 많은 데이터는 SQL에 OFFSET/WHERE로 나눠서 조회
- **단일 쿼리 실행** — 세미콜론으로 구분된 여러 쿼리를 한 번에 실행 시 DB 드라이버 동작에 따라 첫 번째만 실행될 수 있음
- **트랜잭션 미지원** — BEGIN/COMMIT 없이 각 쿼리가 자동 커밋
- **파일 임포트/엑스포트 불가** — CSV 다운로드, SQL 파일 업로드 미지원
- **문법 하이라이팅 없음** — 현재 일반 텍스트 에디터 (향후 Monaco Editor 적용 고려)
- **쿼리 실행 시간 제한** — 긴 쿼리는 서버 타임아웃(기본 10초)에 의해 중단될 수 있음
