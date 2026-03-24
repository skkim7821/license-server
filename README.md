# License Server

간단한 배포 환경에서 동작하는 라이선스 발급/검증 API 서버입니다. Fastify 기반으로 API 문서(swagger)와 관리자/클라이언트 루트를 모두 제공하며 Prisma + PostgreSQL을 통해 라이선스 데이터 및 장치 상태를 관리합니다.

## 핵심 구성
- **Fastify + Swagger**: 개발/테스트(`NODE_ENV!=production`)에서만 `/docs` OpenAPI UI를 제공합니다.
- **Prisma + PostgreSQL**: `DATABASE_URL` 기준 PostgreSQL에 라이선스/제품/장치 정보를 저장합니다.
- **관리자 전용 엔드포인트**: `/admin/login`으로 로그인 후 Bearer JWT로 `/admin/products`, `/admin/licenses`, `/admin/bulk/licenses` 및 라이선스 운영 CRUD를 호출합니다.
- **라이선스 API**: `/license/verify` 검증 API와 `/license/user-info` 사용자 구매 목록 조회 API를 제공합니다.

## 환경 변수
- `DATABASE_URL`: PostgreSQL 연결 문자열 (예: `postgresql://license:license@localhost:5432/license_server?schema=public`)
- `ADMIN_EMAIL`: 관리자 로그인 이메일 (`POST /admin/login`)
- `ADMIN_PASSWORD`: 관리자 로그인 비밀번호
- `ADMIN_JWT_SECRET`: 관리자 JWT 서명 키(설정 시 DB 기반 로그인 활성화)
- `ADMIN_JWT_EXPIRES_IN` (선택): JWT 만료 시간(기본 `12h`)
- `PORT` (선택): 서버가 열릴 포트(기본 3000).

환경 변수는 `.env`에 정의하고 `dotenv/config`로 `apps/license-server/src/server.ts`, `apps/license-server/prisma.config.ts`에서 자동 로드합니다.

## 설치 · 실행
1. 의존성 설치: `pnpm install`
2. 임시/데이터 디렉터리 확보: `pnpm run ensure-tmp` (실행 스크립트가 `./tmp`를 생성합니다)
3. DB 초기화: `pnpm run db:bootstrap` (개발 seed), 운영 초기화는 `pnpm run db:bootstrap:prod`
4. 개발 서버: `pnpm dev ▶ pnpm --filter license-server dev`
5. 배포/빌드: `pnpm build` → `pnpm start`

로컬 통합 실행(비도커, backend+frontend):
- `pnpm dev:local`
- 이미 DB가 준비된 경우: `LOCAL_DEV_SKIP_BOOTSTRAP=1 pnpm dev:local`
- 기본 포트(`3000`, `5174`)가 사용 중이면 자동으로 다음 포트로 fallback
- `dev:local`은 `db:bootstrap:prod`를 사용해 관리자 계정(`ADMIN_EMAIL`/`ADMIN_PASSWORD`)만 seed합니다.

## 추가 커맨드
- `pnpm test`: `vitest`를 이용한 단위 테스트 실행 (`apps/license-server/src/routes/*.test.ts`)
- `pnpm run prisma`: Prisma CLI로 마이그레이션/스크립트 관리
- `pnpm run check:all`: schema validate + build + test 일괄 검증
- `pnpm run db:bootstrap:no-seed`: 샘플 데이터 없이 스키마만 초기화
- `pnpm run seed:dev`: 마이그레이션 없이 개발 seed만 재주입
- `pnpm run seed:prod`: 마이그레이션 없이 운영 seed(관리자 계정만) 적용
- `pnpm run frontend:dev`: React 관리자 UI(Vite) 개발 서버 실행 (`http://localhost:5174/`, 로컬 dev는 루트 경로 기준)
- `pnpm run frontend:build`: React 관리자 UI 프로덕션 빌드 검증

진행 현황 추적 방법은 [`docs/progress-tracking.md`](/Users/skkim/testspace/license-server/docs/progress-tracking.md) 참고.
추가 기준 문서는 [`docs/phase0-decisions.md`](/Users/skkim/testspace/license-server/docs/phase0-decisions.md), [`docs/phase1-baseline.md`](/Users/skkim/testspace/license-server/docs/phase1-baseline.md), [`docs/admin-ui-parity-plan.md`](/Users/skkim/testspace/license-server/docs/admin-ui-parity-plan.md), [`docs/data-migration-playbook.md`](/Users/skkim/testspace/license-server/docs/data-migration-playbook.md), [`docs/deployment-playbook.md`](/Users/skkim/testspace/license-server/docs/deployment-playbook.md) 참고.

## 서버 배포 (Docker Compose)
1. 서버에 코드 배포 후 루트 디렉터리 이동
2. 환경변수 준비:
  - 예: `ADMIN_EMAIL=admin@example.com`
  - 예: `ADMIN_PASSWORD=your-strong-password`
  - 예: `ADMIN_JWT_SECRET=your-strong-jwt-secret`
3. 컨테이너 실행:
   - `docker compose up -d --build`
4. 로그 확인:
   - `docker compose logs -f license-server`
5. 접속 확인:
   - `http://서버IP/health`
   - 운영 환경에서는 `/docs` 비활성화

`deploy/docker/docker-compose.yml`은 `postgres_data` 볼륨을 사용하므로 컨테이너 재시작 후에도 PostgreSQL 데이터가 유지됩니다.

## 클라우드 이관용 표준 배포 절차
다른 클라우드/서버로 바로 옮길 때는 `deploy` 기준으로 동일하게 적용합니다.

1. 서버에 프로젝트 배치 후 배포 경로로 이동
```bash
cd /home/ubuntu/app
```
2. 환경변수 파일 준비
```bash
cp deploy/.env.prod.example .env
# .env 값 수정: ADMIN_*, GHCR_NAMESPACE, SERVER_NAME, ENABLE_HTTPS, SSL_*_PATH
```
3. (필요 시) GHCR 로그인
```bash
echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
```
4. 배포 실행
```bash
docker compose --env-file .env -f deploy/docker/docker-compose.prod.yml pull
docker compose --env-file .env -f deploy/docker/docker-compose.prod.yml up -d --remove-orphans
```
5. 확인
```bash
docker compose --env-file .env -f deploy/docker/docker-compose.prod.yml ps
curl -fsS http://127.0.0.1/health
```

메모:
- `ENABLE_HTTPS=true` 이고 인증서 파일이 있으면 HTTPS(443) 활성화.
- 인증서가 없으면 admin-web은 HTTP 모드로 자동 fallback.

## GitHub Actions 환경 변수 정리
설정 위치: GitHub 저장소 `Settings > Secrets and variables > Actions`

### 1) `publish-ghcr.yml` (main/태그 이미지 빌드·푸시)
- 트리거:
  - `main` 브랜치 푸시: `main`, `sha-...` 태그 이미지 발행(테스트용)
  - `v*` 태그 푸시: 릴리즈 태그 이미지 발행
- 별도 커스텀 환경변수는 필요 없습니다.
- 인증은 `secrets.GITHUB_TOKEN`을 사용합니다.

### 2) `deploy-manual.yml` (수동 배포)
- 트리거: `workflow_dispatch`
- 입력값(`inputs`) 3개가 먼저 필요합니다.

| Input | 예시 | 설명 |
|---|---|---|
| `backend_tag` | `main` | 백엔드 이미지 태그 (`ghcr.io/<namespace>/license-server:<tag>`) |
| `admin_tag` | `main` | 프론트(admin-web) 이미지 태그 (`ghcr.io/<namespace>/license-server-admin-web:<tag>`) |
| `confirm` | `DEPLOY_NOW` | 안전장치 문자열. 정확히 일치해야 배포 실행 |

메모:
- `backend_tag`, `admin_tag` 미입력 시 기본값은 `main`입니다.
- 추천 흐름: `main`으로 서버에서 먼저 검증 → 안정화 후 `vX.Y.Z` 태그 발행.

### 3) `deploy-manual.yml`가 읽는 Secrets/Variables (전체)
아래 키가 실제 배포 스크립트(`scripts/deploy/manual-deploy.sh`)에 전달됩니다.

| Key | 권장 위치 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|
| `SSH_PRIVATE_KEY` | Secret | 예 | 없음 | 서버 SSH 접속 개인키 전체 문자열 |
| `SSH_HOST` | Variable | 예 | 없음 | 배포 대상 서버 호스트/IP |
| `SSH_PORT` | Variable | 예 | 없음 | SSH 포트 |
| `SSH_USER` | Variable | 예 | 없음 | SSH 사용자 |
| `DEPLOY_PATH` | Variable | 예 | 없음 | 서버 내 배포 루트 (예: `/home/ubuntu/app`) |
| `GHCR_USERNAME` | Variable | 예 | 없음 | GHCR 네임스페이스/로그인 사용자명 |
| `GHCR_TOKEN` | Secret | 예 | 없음 | 서버에서 `docker login ghcr.io`에 사용할 토큰 (`read:packages`) |
| `ADMIN_EMAIL` | Secret | 예 | 없음 | 운영 관리자 이메일(seed/upsert 기준) |
| `ADMIN_PASSWORD` | Secret | 예 | 없음 | 운영 관리자 비밀번호(seed 시 해시 갱신) |
| `ADMIN_JWT_SECRET` | Secret | 예 | 없음 | 관리자 JWT 서명키 |
| `SERVER_NAME` | Variable | 권장 | `_` | Nginx `server_name` (`lc.skkim.dev` 권장) |
| `ENABLE_HTTPS` | Variable | 권장 | `true` | `true/false/1/yes` |
| `SSL_CERT_PATH` | Variable | 권장 | `/etc/letsencrypt/live/lc.skkim.dev/fullchain.pem` | 인증서 경로 |
| `SSL_KEY_PATH` | Variable | 권장 | `/etc/letsencrypt/live/lc.skkim.dev/privkey.pem` | 개인키 경로 |

### 4) 우선순위 규칙 (중요)
`deploy-manual.yml`에서 아래 키는 `vars` 우선, 비어있으면 `secrets` fallback:
- `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `DEPLOY_PATH`, `GHCR_USERNAME`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`
- `SERVER_NAME`, `ENABLE_HTTPS`, `SSL_CERT_PATH`, `SSL_KEY_PATH`

즉, 같은 키를 Variables와 Secrets 둘 다 넣어두면 Variables 값이 먼저 사용됩니다.

### 5) 배포 중 서버에 생성되는 파일
배포 시 서버의 `${DEPLOY_PATH}/deploy/.env.prod`를 매번 덮어씁니다.
생성 키:
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`
- `GHCR_NAMESPACE`(=`GHCR_USERNAME`)
- `SERVER_NAME`, `ENABLE_HTTPS`, `SSL_CERT_PATH`, `SSL_KEY_PATH`
- `BACKEND_IMAGE_TAG`, `ADMIN_WEB_IMAGE_TAG`

### 6) 운영 체크리스트
- `DEPLOY_PATH`는 실제 존재하는 절대경로여야 함 (`deploy/docker/docker-compose.prod.yml` 업로드 대상).
- `GHCR_TOKEN`은 배포 서버에서 대상 이미지 pull 가능한 권한이어야 함.
- `.dev` 도메인 사용 시 HTTPS가 사실상 필수이므로 `SERVER_NAME`, 인증서 경로를 정확히 설정.
- `SSH_PRIVATE_KEY`는 공개키(`ssh-rsa ...`)가 아니라 개인키 원문이어야 함.

## Docker Fullstack 실행 (내부 테스트)
프론트/백엔드/DB를 한 번에 실행하려면:

```bash
pnpm docker:up
```

접속:
- Frontend(Admin Web): `http://localhost:5174`
- Backend Health: `http://localhost/health`
- Backend Docs(개발 전용): `http://localhost/docs`
- PostgreSQL(로컬 전용): `127.0.0.1:5432`

참고:
- 내부 테스트는 `deploy/docker/docker-compose.dev.yml`을 사용합니다.
- 운영 배포는 `deploy/docker/docker-compose.yml`을 사용합니다.
- Frontend는 Nginx reverse proxy로 `/admin`, `/license`, `/docs`, `/health`를 backend(`license-server`)로 전달합니다.
- 따라서 Frontend 코드의 상대경로 API 호출(`/admin/...`)을 그대로 사용합니다.

## 로컬 SSL 테스트 (Mac)
`mkcert`로 로컬 인증서를 만든 뒤 SSL 오버라이드 컴포즈를 사용합니다.

```bash
brew install mkcert nss
mkcert -install
mkdir -p deploy/certs
mkcert -cert-file deploy/certs/localhost.pem -key-file deploy/certs/localhost-key.pem localhost 127.0.0.1 ::1
docker compose -f deploy/docker/docker-compose.prod.yml -f deploy/docker/docker-compose.ssl-local.yml up -d
```

접속 확인:
- `https://localhost/health`
- `https://localhost/license-console-k9/`

## 서버 운영 라이프사이클 커맨드
아래 명령은 현재 구성(포트 80, PostgreSQL 컨테이너, Docker Compose) 기준입니다.

### 1) 최초 1회 세팅
```bash
cd /opt/license-server
cat > .env <<'EOF'
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
`deploy/docker/docker-compose.yml`의 `image` 태그를 이전 버전으로 변경 후:
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
- `POST /admin/login`: DB(`AdminUser`) 기반 로그인 후 JWT 반환
- `POST /admin/products`: 제품 코드/이름/기기 제한/기본 기간을 등록
- `GET /admin/products`: 등록된 제품 목록을 코드 오름차순으로 조회
- `POST /admin/users`: 사용자 생성(동일 이메일 존재 시 이름 갱신)
- `GET /admin/users`: 사용자 목록 조회
- `PATCH /admin/users/:id`: 사용자 이메일/이름 수정
- `POST /admin/licenses`: 이메일 + 제품 코드로 단일 라이선스를 발급 (제품 존재 필수)
- `GET /admin/licenses`: 발급된 라이선스 목록을 이메일 오름차순으로 조회
- `POST /admin/bulk/licenses`: 제품 등록과 다수 라이선스 발급을 동시에 수행
- `PATCH /admin/licenses/:id/extend`: 라이선스 만료일 연장
- `PATCH /admin/licenses/:id/status`: 라이선스 상태 변경(`active|revoked`, 운영차단 해제/영구차단 보조용)
- `PATCH /admin/licenses/:id/suspend`: 운영 차단 적용(`suspended`) + 차단 사유/메모/담당자 기록
- `PATCH /admin/licenses/:id/unsuspend`: 운영 차단 해제(`active`) + 해제 이력 기록
- `DELETE /admin/licenses/:id`: 라이선스 및 연결 디바이스 삭제

### 라이선스 검증 (`/license/verify`)
- 요청: `{ licenseKey }`, 선택: `ipAddr`
- 판정 순서: `not_found` -> `suspended/revoked` -> 시간 만료(`expiresAt`) -> 디바이스 제한 -> 성공
- 시간 만료는 DB `status` 갱신 없이 계산으로만 판단 (`expired`는 시간 만료 의미로만 사용)
- 운영 차단 시 `blockReason`, `blockNote`를 함께 반환
- 전달된 IP/헤더를 기준으로 디바이스 등록, 최대 허용 장치 수 초과 시 `reason=max_devices_reached` 반환
- 성공 시 `expiresAt`과 남은 디바이스 수(`remainingDevices`) 반환
- 실패 reason 예시: `expired`, `suspended`, `revoked`, `max_devices_reached`, `not_found`
- 상세 리팩터링/마이그레이션 의도: `docs/license-status-refactor.md`

### 사용자 구매 정보 (`/license/user-info`)
- 필수 쿼리: `email`, 선택 쿼리: `name`
- 이메일로 구매한 제품 목록을 반환하고, `name` 전달 시 제품명을 기준으로 필터링
- 일치 항목이 없으면 404(`not_found`) 반환

## Swagger · 문서
- 개발/테스트 시 `http://localhost:3000/docs`에서 swagger/ui 확인 가능
- 최소 관리자 UI(레거시 fallback): `http://localhost:3000/admin-ui` (2026-05-01 제거 예정)
- React 관리자 UI(신규): `http://localhost:5174/` (`pnpm run frontend:dev`, 프로덕션/Nginx에서는 `/license-console-k9/` 경유)

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
- `apps/license-server/src/routes/admin.ts`/`apps/license-server/src/routes/license.ts`: Fastify 플러그인 방식으로 라우터 구성, `schema` 필드로 요청/응답 스펙을 정의
- `apps/license-server/src/db.ts`: `PrismaClient` 연결 초기화와 재호출 방지용 `initialized` 플래그
- `apps/license-server/generated/prisma/client`: Prisma Client 자동 생성 코드

## 다음 단계 추천
1. 관리자 계정 운영 절차(비밀번호 로테이션/비활성화 계정 처리) 문서화
2. Phase 6 항목(감사 로그/전환 리허설/복구 검증) 완료
