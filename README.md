# License Server

간단한 배포 환경에서 동작하는 라이선스 발급/검증 API 서버입니다. Fastify 기반으로 API 문서(swagger)와 관리자/클라이언트 루트를 모두 제공하며 Prisma + PostgreSQL을 통해 라이선스 데이터 및 장치 상태를 관리합니다.

## 핵심 구성
- **Fastify + Swagger**: `/docs`에서 OpenAPI UI를 제공하며 `src/server.ts`에서 swagger/swagger-ui를 등록하고 있습니다.
- **Prisma + PostgreSQL**: `DATABASE_URL` 기준 PostgreSQL에 라이선스/제품/장치 정보를 저장합니다.
- **관리자 전용 엔드포인트**: `/admin/login`으로 로그인 후 Bearer 토큰으로 `/admin/products`, `/admin/licenses`, `/admin/bulk/licenses` 및 라이선스 운영 CRUD를 호출합니다. `ADMIN_JWT_SECRET`이 설정되면 DB 기반 관리자 계정 JWT가 우선 사용되고, `ADMIN_TOKEN`은 2026-04-30까지 fallback으로만 허용됩니다.
- **라이선스 API**: `/license/verify` 검증 API와 `/license/user-info` 사용자 구매 목록 조회 API를 제공합니다.

## 환경 변수
- `DATABASE_URL`: PostgreSQL 연결 문자열 (예: `postgresql://license:license@localhost:5532/license_server?schema=public`)
- `ADMIN_TOKEN`: 레거시 관리자 API 토큰(전환기간 fallback, 2026-04-30 종료 예정)
- `ADMIN_EMAIL`: 관리자 로그인 이메일 (`POST /admin/login`)
- `ADMIN_PASSWORD`: 관리자 로그인 비밀번호
- `ADMIN_JWT_SECRET`: 관리자 JWT 서명 키(설정 시 DB 기반 로그인 활성화)
- `ADMIN_JWT_EXPIRES_IN` (선택): JWT 만료 시간(기본 `12h`)
- `PORT` (선택): 서버가 열릴 포트(기본 3000).

환경 변수는 `.env`에 정의하고 `dotenv/config`로 `src/server.ts`, `prisma.config.ts`에서 자동 로드합니다.

## 설치 · 실행
1. 의존성 설치: `pnpm install`
2. 임시/데이터 디렉터리 확보: `pnpm run ensure-tmp` (실행 스크립트가 `./tmp`를 생성합니다)
3. DB 초기화: `pnpm run db:bootstrap` (개발 seed), 운영 초기화는 `pnpm run db:bootstrap:prod`
4. 개발 서버: `pnpm dev ▶ tsx watch src/server.ts`
5. 배포/빌드: `pnpm build` → `pnpm start`

## 추가 커맨드
- `pnpm test`: `vitest`를 이용한 단위 테스트 실행 (`src/routes/*.test.ts`)
- `pnpm run prisma`: Prisma CLI로 마이그레이션/스크립트 관리
- `pnpm run check:all`: schema validate + build + test 일괄 검증
- `pnpm run db:bootstrap:no-seed`: 샘플 데이터 없이 스키마만 초기화
- `pnpm run seed:dev`: 마이그레이션 없이 개발 seed만 재주입
- `pnpm run seed:prod`: 마이그레이션 없이 운영 seed(관리자 계정만) 적용
- `pnpm run frontend:dev`: React 관리자 UI(Vite) 개발 서버 실행 (`http://localhost:5174`)
- `pnpm run frontend:build`: React 관리자 UI 프로덕션 빌드 검증

진행 현황 추적 방법은 [`docs/progress-tracking.md`](/Users/skkim/testspace/license-server/docs/progress-tracking.md) 참고.
추가 기준 문서는 [`docs/phase0-decisions.md`](/Users/skkim/testspace/license-server/docs/phase0-decisions.md), [`docs/phase1-baseline.md`](/Users/skkim/testspace/license-server/docs/phase1-baseline.md), [`docs/admin-ui-parity-plan.md`](/Users/skkim/testspace/license-server/docs/admin-ui-parity-plan.md), [`docs/data-migration-playbook.md`](/Users/skkim/testspace/license-server/docs/data-migration-playbook.md) 참고.

## 서버 배포 (Docker Compose)
1. 서버에 코드 배포 후 루트 디렉터리 이동
2. 환경변수 준비:
  - 예: `ADMIN_TOKEN=your-strong-token` (fallback)
  - 예: `ADMIN_EMAIL=admin@example.com`
  - 예: `ADMIN_PASSWORD=your-strong-password`
  - 예: `ADMIN_JWT_SECRET=your-strong-jwt-secret`
3. 컨테이너 실행:
   - `docker compose up -d --build`
4. 로그 확인:
   - `docker compose logs -f license-server`
5. 접속 확인:
   - `http://서버IP/health`
   - `http://서버IP/docs`

`docker-compose.yml`은 `postgres_data` 볼륨을 사용하므로 컨테이너 재시작 후에도 PostgreSQL 데이터가 유지됩니다.

## Docker Fullstack 실행 (내부 테스트)
프론트/백엔드/DB를 한 번에 실행하려면:

```bash
pnpm docker:up
```

접속:
- Frontend(Admin Web): `http://localhost:5174`
- Backend Health: `http://localhost/health`
- Backend Docs: `http://localhost/docs`
- PostgreSQL(로컬 전용): `127.0.0.1:5532`

참고:
- 내부 테스트는 `docker-compose.dev.yml`을 사용합니다.
- 운영 배포는 `docker-compose.yml`을 사용합니다.
- Frontend는 Nginx reverse proxy로 `/admin`, `/license`, `/docs`, `/health`를 backend(`license-server`)로 전달합니다.
- 따라서 Frontend 코드의 상대경로 API 호출(`/admin/...`)을 그대로 사용합니다.

## 서버 운영 라이프사이클 커맨드
아래 명령은 현재 구성(포트 80, PostgreSQL 컨테이너, Docker Compose) 기준입니다.

### 1) 최초 1회 세팅
```bash
cd /opt/license-server
cat > .env <<'EOF'
ADMIN_TOKEN=change_me_to_strong_token
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change_me_password
ADMIN_JWT_SECRET=change_me_jwt_secret
EOF
```

GHCR private 이미지를 쓰는 경우:
```bash
echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
```

### 2) 첫 배포
Dockerfile build 방식:
```bash
docker compose up -d --build
```

GHCR image pull 방식:
```bash
docker compose pull
docker compose up -d
```

### 3) 상태 확인
```bash
docker compose ps
docker compose logs -f license-server
docker compose top
curl -fsS http://127.0.0.1/health
```

### 4) 업데이트 배포
image pull 방식:
```bash
docker compose pull
docker compose up -d
docker compose logs -f --tail=100 license-server
```

build 방식:
```bash
docker compose up -d --build
```

### 5) 롤백
`docker-compose.yml`의 `image` 태그를 이전 버전으로 변경 후:
```bash
docker compose pull
docker compose up -d
```

### 6) DB 백업/복구 (PostgreSQL)
백업:
```bash
docker exec license-server-postgres pg_dump -U license license_server > backup-db-$(date +%F-%H%M).sql
```

복구(서비스 중지 후):
```bash
docker compose down
docker compose up -d postgres
cat backup-db-YYYY-MM-DD-HHMM.sql | docker exec -i license-server-postgres psql -U license -d license_server
docker compose up -d
```

### 7) 재시작/중지/정리
```bash
docker compose restart license-server
docker compose stop
docker compose down
docker compose down --remove-orphans
```

### 8) 디스크 정리
```bash
docker image prune -f
docker container prune -f
```

주의: `docker volume prune -f`는 다른 프로젝트 볼륨도 지울 수 있으므로 신중히 사용하세요.

## API 요약
### 관리자 API (`/admin/*`, 보호됨)
- `POST /admin/login`: DB(`AdminUser`) 기반 로그인 후 JWT 반환, 실패 시 환경변수 정적 토큰 fallback
- `POST /admin/products`: 제품 코드/이름/기기 제한/기본 기간을 등록
- `GET /admin/products`: 등록된 제품 목록을 코드 오름차순으로 조회
- `POST /admin/users`: 사용자 생성(동일 이메일 존재 시 이름 갱신)
- `GET /admin/users`: 사용자 목록 조회
- `PATCH /admin/users/:id`: 사용자 이메일/이름 수정
- `POST /admin/licenses`: 이메일 + 제품 코드로 단일 라이선스를 발급 (제품 존재 필수)
- `GET /admin/licenses`: 발급된 라이선스 목록을 이메일 오름차순으로 조회
- `POST /admin/bulk/licenses`: 제품 등록과 다수 라이선스 발급을 동시에 수행
- `PATCH /admin/licenses/:id/extend`: 라이선스 만료일 연장
- `PATCH /admin/licenses/:id/status`: 라이선스 상태 변경(`active|revoked|expired`)
- `DELETE /admin/licenses/:id`: 라이선스 및 연결 디바이스 삭제

### 라이선스 검증 (`/license/verify`)
- 요청: `{ licenseKey }`, 선택: `ipAddr`
- 전달된 IP/헤더를 기준으로 디바이스 등록, 최대 허용 장치 수 초과시 403
- 만료되면 `status`를 `expired`로 갱신하고 403 반환
- 성공 시 `expiresAt`과 남은 디바이스 수(`remainingDevices`) 반환

### 사용자 구매 정보 (`/license/user-info`)
- 필수 쿼리: `email`, 선택 쿼리: `name`
- 이메일로 구매한 제품 목록을 반환하고, `name` 전달 시 제품명을 기준으로 필터링
- 일치 항목이 없으면 404(`not_found`) 반환

## Swagger · 문서
- 개발/테스트 시 `http://localhost:3000/docs`에서 swagger/ui 확인 가능
- 최소 관리자 UI(레거시 fallback): `http://localhost:3000/admin-ui` (2026-05-01 제거 예정)
- React 관리자 UI(신규): `http://localhost:5174` (`pnpm run frontend:dev`)

## 부트스트랩 + 스모크 절차
신규 서버/로컬에서 아래 순서로 바로 점검할 수 있습니다.

1. DB 마이그레이션 + 운영 seed(관리자 계정만):
```bash
pnpm run db:bootstrap:prod
```
2. 서버 실행:
```bash
pnpm dev
```
3. 기본 스모크:
```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/docs >/dev/null
curl -fsS http://127.0.0.1:3000/admin-ui >/dev/null
```
4. 관리자 로그인/API 점검:
   - 브라우저에서 `/admin-ui` 접속 후 로그인
   - 사용자/라이선스 목록 조회, 연장/상태변경/삭제 액션 수행

## 아키텍처 참고
- `src/routes/admin.ts`/`src/routes/license.ts`: Fastify 플러그인 방식으로 라우터 구성, `schema` 필드로 요청/응답 스펙을 정의
- `src/db.ts`: `PrismaClient` 연결 초기화와 재호출 방지용 `initialized` 플래그
- `generated/prisma/client`: Prisma Client 자동 생성 코드

## 다음 단계 추천
1. `ADMIN_TOKEN` fallback 제거 일정(2026-05-01) 기준으로 운영 환경 점검
2. Phase 6 항목(감사 로그/전환 리허설/복구 검증) 완료
