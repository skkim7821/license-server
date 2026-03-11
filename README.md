# License Server

간단한 배포 환경에서 동작하는 라이선스 발급/검증 API 서버입니다. Fastify 기반으로 API 문서(swagger)와 관리자/클라이언트 루트를 모두 제공하며 Prisma + Better SQLite3를 통해 라이선스 데이터 및 장치 상태를 관리합니다.

## 핵심 구성
- **Fastify + Swagger**: `/docs`에서 OpenAPI UI를 제공하며 `src/server.ts`에서 swagger/swagger-ui를 등록하고 있습니다.
- **Prisma + SQLite**: `./db/dev.db`에 라이선스/제품/장치 정보를 저장하며 `src/db.ts`에서 Better SQLite3 어댑터로 데이터베이스 연결을 초기화합니다.
- **관리자 전용 엔드포인트**: Bearer 토큰(환경변수 `ADMIN_TOKEN`)으로 보호되는 `/admin/products`, `/admin/licenses`, `/admin/bulk/licenses`에서 제품/라이선스 생성과 목록 조회를 제공합니다.
- **라이선스 API**: `/license/verify` 검증 API와 `/license/user-info` 사용자 구매 목록 조회 API를 제공합니다.

## 환경 변수
- `DATABASE_URL`: `file:./db/dev.db` 형식의 SQLite 연결 문자열.
- `ADMIN_TOKEN`: 관리자 API 호출 시 `Authorization: Bearer ${ADMIN_TOKEN}`으로 전달해야 합니다.
- `PORT` (선택): 서버가 열릴 포트(기본 3000).

환경 변수는 `.env`에 정의하고 `dotenv/config`로 `src/server.ts`, `prisma.config.ts`에서 자동 로드합니다.

## 설치 · 실행
1. 의존성 설치: `pnpm install`
2. 임시/데이터 디렉터리 확보: `pnpm run ensure-tmp` (실행 스크립트가 `./tmp`를 생성합니다)
3. DB 초기화: `pnpm run db:bootstrap` (이미 존재하는 경우 --reset 옵션으로 초기화)
4. 개발 서버: `pnpm dev ▶ tsx watch src/server.ts`
5. 배포/빌드: `pnpm build` → `pnpm start`

## 추가 커맨드
- `pnpm test`: `vitest`를 이용한 단위 테스트 실행 (`src/routes/*.test.ts`)
- `pnpm run prisma`: Prisma CLI로 마이그레이션/스크립트 관리
- `pnpm run db:bootstrap:no-seed`: 샘플 데이터 없이 스키마만 초기화

## 서버 배포 (Docker Compose)
1. 서버에 코드 배포 후 루트 디렉터리 이동
2. 환경변수 준비:
   - 예: `ADMIN_TOKEN=your-strong-token`
   - 필요 시 `DATABASE_URL`은 기본값(`file:./db/prod.db`) 유지 가능
3. 컨테이너 실행:
   - `docker compose up -d --build`
4. 로그 확인:
   - `docker compose logs -f license-server`
5. 접속 확인:
   - `http://서버IP:3000/health`
   - `http://서버IP:3000/docs`

`docker-compose.yml`은 `./db`를 `/app/db`로 마운트하므로 컨테이너 재시작 후에도 SQLite 데이터가 유지됩니다.

## API 요약
### 관리자 API (`/admin/*`, 보호됨)
- `POST /admin/products`: 제품 코드/이름/기기 제한/기본 기간을 등록
- `GET /admin/products`: 등록된 제품 목록을 코드 오름차순으로 조회
- `POST /admin/licenses`: 이메일 + 제품 코드로 단일 라이선스를 발급 (제품 존재 필수)
- `GET /admin/licenses`: 발급된 라이선스 목록을 이메일 오름차순으로 조회
- `POST /admin/bulk/licenses`: 제품 등록과 다수 라이선스 발급을 동시에 수행

### 라이선스 검증 (`/license/verify`)
- 필수: `{ email, productCode }`, 선택: `ipAddr`
- 전달된 IP/헤더를 기준으로 디바이스 등록, 최대 허용 장치 수 초과시 403
- 만료되면 `status`를 `expired`로 갱신하고 403 반환
- 성공 시 `expiresAt`과 남은 디바이스 수(`remainingDevices`) 반환

### 사용자 구매 정보 (`/license/user-info`)
- 필수 쿼리: `email`, 선택 쿼리: `name`
- 이메일로 구매한 제품 목록을 반환하고, `name` 전달 시 제품명을 기준으로 필터링
- 일치 항목이 없으면 404(`not_found`) 반환

## Swagger · 문서
- 개발/테스트 시 `http://localhost:3000/docs`에서 swagger/ui 확인 가능

## 아키텍처 참고
- `src/routes/admin.ts`/`src/routes/license.ts`: Fastify 플러그인 방식으로 라우터 구성, `schema` 필드로 요청/응답 스펙을 정의
- `src/db.ts`: `PrismaClient` + WAL 모드 SQL 설정, 이전 호출 방지를 위한 `initialized` 플래그
- `generated/prisma/client`: Prisma Client 자동 생성 코드

## 다음 단계 추천
1. `ADMIN_TOKEN` 강력한 값으로 설정 후 운영 환경에서 파일/시크릿 관리 적용
2. `DATABASE_URL`을 환경에 맞춰(예: 파일 경로 또는 sqlite 디렉터리) 조정하고 백업 정책 수립
