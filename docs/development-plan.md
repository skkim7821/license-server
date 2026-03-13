# License Server Development Plan

## 0. 문서 목적
이 문서는 현재 구현(SQLite + email 기반 검증)을 운영 가능한 최소 라이선스 서버(PostgreSQL + licenseKey 기반 검증 + 최소 관리자 운영 기능)로 전환하기 위한 단계별 실행 계획이다.

1차 목표 범위는 아래에 한정한다.
- PostgreSQL 기반으로 동작
- 이메일 대신 licenseKey로 검증
- 관리자 로그인 가능
- 관리자 화면(또는 관리자 API)에서 사용자 추가/수정, 라이선스 삭제/연장/만료/상태변경 가능
- 신규 서버에서 seed 데이터로 즉시 테스트 가능

## 진행 현황 (2026-03-12)
- Phase 2 완료: PostgreSQL 전환, baseline migration 정리, docker-compose postgres 반영
- Phase 3 완료: `/license/verify`를 `licenseKey` 전용으로 전환, 레거시 `email+productCode` 검증 경로 제거
- Phase 4 진행: `AdminUser` + JWT 로그인 구현 완료, `operator/super_admin` 권한 분기 적용
- Phase 5 진행: `seed:dev`/`seed:prod` 분리 및 bootstrap seed mode 도입
- Phase 7 진행: `apps/admin-web`(React + SCSS + Vite) 스캐폴드/로그인/사용자/라이선스 화면 및 API 연동 구현, 빌드 검증 완료

## 1. 현재 상태(코드 기준)

### 1.1 데이터 모델
현재 `prisma/schema.prisma`:
- `datasource db.provider = "postgresql"`
- `Product(code PK, name, maxDevices, defaultPeriod)`
- `License(id, licenseKey, email, productCode FK, expiresAt, status, maxDevices)`
  - 유니크: `@@unique([email, productCode])`
- `LicenseDevice(id, licenseId FK, ipAddr, createdAt)`
  - 유니크: `@@unique([licenseId, ipAddr])`
- `LicenseStatus`: `active | revoked | expired`

### 1.2 검증 로직
현재 `src/routes/license.ts`:
- `POST /license/verify` 입력: `licenseKey (+ ipAddr)` 우선, `email + productCode` 레거시 병행
- 조회 키: `licenseKey` 우선, 레거시 `(email, productCode)` fallback
- 만료시 `status=expired`로 갱신 후 거부
- `LicenseDevice`로 IP 기반 디바이스 제한 관리

### 1.3 관리자 기능
현재 `src/routes/admin.ts`:
- 인증: `/admin/login`(AdminUser 기반) + Bearer JWT
- 제공 API:
  - `POST /admin/login`
  - `POST /admin/products`
  - `GET /admin/products`
  - `POST /admin/licenses` (licenseKey 자동 생성)
  - `GET /admin/licenses` (email 오름차순)
  - `POST /admin/bulk/licenses`
  - `PATCH /admin/licenses/:id/extend`
  - `PATCH /admin/licenses/:id/status`
  - `DELETE /admin/licenses/:id`
- 미구현:
  - 관리자 계정/권한(Role) DB 모델
  - 사용자 엔티티 CRUD

### 1.4 DB 연결/초기화
현재 `src/db.ts`, `src/db/bootstrap.ts`:
- `@prisma/adapter-pg` 사용
- PostgreSQL migration 기반 bootstrap/reset 동작
- bootstrap seed는 `Product + License(licenseKey 포함) + LicenseDevice` 샘플 데이터 생성

### 1.5 구현 전 충돌 지점(선해결 필요)
- Prisma schema와 migration SQL의 컬럼 불일치(`ipAddr` vs `fingerprint`)
- migration 체계보다 `prisma db push` 중심 운영 경로(Dockerfile/bootstrap)
- DB 계층의 SQLite 어댑터 강결합(`@prisma/adapter-better-sqlite3`)
- 관리자 인증 정책이 JWT 중심으로 정리되어야 함
- 라이선스 검증/발급 API가 email+productCode 계약에 고정
- docker-compose 운영 구성이 SQLite 파일 볼륨 전제

## 2. 핵심 설계 결정(초안)

### 2.1 엔티티 구조
운영 전환 최소안:
- `User`
  - `id`, `email(유니크)`, `name`, `createdAt`, `updatedAt`
- `License`
  - `id`, `licenseKey(유니크)`, `userId(FK)`, `productCode(FK)`, `status`, `expiresAt`, `maxDevices`, `issuedAt`, `revokedAt?`
- `LicenseDevice`
  - `licenseId(FK)`, `fingerprint 또는 ipAddr`, `createdAt`
- `AdminUser`
  - `id`, `email(유니크)`, `passwordHash`, `role`, `status`, `lastLoginAt?`

참고:
- 이메일은 `User` 정보로 유지
- 검증 기준은 `licenseKey`로 일원화
- 기존 `License.email`은 제거 대상(마이그레이션 기간에는 임시 병행 가능)

### 2.2 관계 모델
- `User 1 : N License` 권장
- 이유: 고객별 다중 제품/다중 설치 정책 확장에 유리

### 2.3 라이선스 키 포맷
운영 최소안(가독성 + 유효성):
- 예시: `LIC-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX` (대문자, 숫자)
- 저장: 원문 저장 + 인덱스/유니크
- API 입력은 공백/하이픈 정규화 후 검증

### 2.4 상태 모델
- `active`: 정상 사용 가능
- `expired`: 만료
- `revoked`: 관리자 회수

상태 전이 원칙:
- 만료일 경과 시 `expired`
- 관리자 강제 중단 시 `revoked`
- 연장 시 `expired -> active` 가능 (정책으로 허용)

## 3. 단계별 실행 계획

## Phase 0. 충돌 해소(구현 시작 게이트)
목표: 이후 기능 구현 전에 현재 구조의 충돌 지점을 모두 제거

작업:
- 스키마/마이그레이션 정합성 복구
  - `schema.prisma`와 migration SQL 컬럼 정의 통일
  - 기존 sqlite migration 이력은 baseline 전략으로 재정렬
- DB 배포 경로 정리
  - 운영/CI 경로를 `db push` 중심에서 `migrate` 중심으로 전환
  - Dockerfile 실행 명령을 `prisma migrate deploy` 기반으로 변경
- DB 어댑터/초기화 분리
  - SQLite 전용 어댑터/유틸 제거 계획 확정
  - Postgres 전환 전/후 bootstrap 동작 분리
- API 계약 전환 전략 확정
  - `license/verify` email 계약의 폐기 일정 확정
  - 필요 시 `legacy` 경로 유지 기간 명시
- 인증 전환 전략 확정
  - 관리자 JWT 로그인 정책과 운영 절차 명시

완료 기준(DoD):
- 충돌 지점별 해결 방식(코드/운영/릴리즈 영향) 문서화 완료
- “Phase 1 이후 착수 가능” 상태로 승인

## Phase 1. 현행 구조 동결 및 분석
목표: 이메일 기반/SQLite 현행 동작을 기준선으로 고정

작업:
- 현재 엔티티/필드/인덱스 목록 문서화
- email 기반 검증 경로와 관리자 CRUD 범위 확정
- 테스트 기준선 확보(`pnpm test` 통과 상태 저장)

완료 기준(DoD):
- 현행 API 계약서(요청/응답/에러) 문서화
- 현행 제약사항(토큰 인증, email 유니크 키 등) 정리

## Phase 2. PostgreSQL 전환
목표: SQLite 의존 제거, PostgreSQL에서 동일 기능 동작

작업:
- Prisma datasource provider를 `postgresql`로 전환
- SQLite 전용 코드 제거
  - `@prisma/adapter-better-sqlite3` 제거
  - `src/db/config.ts`의 SQLite 파일 처리 로직 제거/대체
  - `src/db.ts`를 표준 PrismaClient 연결로 단순화
- 마이그레이션 재구성
  - 기존 SQLite 마이그레이션 잠금(provider=sqlite) 정리
  - PostgreSQL 기준 초기 migration 생성
- `docker-compose.yml`에 postgres 서비스 추가
- `.env` 예시를 PostgreSQL URL 기준으로 업데이트

완료 기준(DoD):
- 로컬에서 PostgreSQL로 서버 기동 성공
- `pnpm prisma migrate dev` / `pnpm prisma generate` 정상
- 기존 health/admin/license API 기본 동작 확인

## Phase 3. licenseKey 중심 데이터 모델 도입
목표: 검증 기준을 email -> licenseKey로 전환

작업:
- Prisma 스키마 변경
  - `User` 추가
  - `License.licenseKey` 추가(유니크)
  - `License.userId` 추가
  - 필요 시 기존 `License.email`을 deprecated 처리 후 제거
- 라이선스 키 생성 유틸 구현(충돌 재시도 포함)
- 검증 API 변경
  - `POST /license/verify` 입력을 `licenseKey (+device 식별값)`로 변경
  - 조회/검증/상태판단 로직을 licenseKey 기준으로 재작성
- `user-info` API도 `User`/`License` 관계 기반으로 정리
- 하위 호환 기간 필요 시:
  - 임시로 email 검증 엔드포인트 별도 유지(`v1`/`legacy`) 후 제거 일정 명시

완료 기준(DoD):
- licenseKey로만 검증 성공/실패/만료/revoked 케이스 테스트 통과
- licenseKey 유니크 보장 및 포맷 검증
- 기존 이메일은 사용자 정보 조회용으로만 사용

## Phase 4. 관리자 인증/권한 및 운영 CRUD
목표: 정적 토큰에서 관리자 계정 기반 인증으로 전환, 운영 필수 기능 제공

작업:
- 관리자 인증
  - `AdminUser` 기반 로그인 API 구현
  - 비밀번호 해시 저장(예: bcrypt/argon2)
  - 세션 또는 JWT 적용
  - role 기반 접근제어(`super_admin`, `operator` 최소 2단계 권장)
- 관리자 기능(API 우선)
  - 사용자 생성/수정/조회
  - 라이선스 생성
  - 라이선스 삭제
  - 라이선스 연장(만료일 변경)
  - 라이선스 만료 처리/상태 변경(active/expired/revoked)
  - 사용자-라이선스 연결/해제
- 관리자 UI(최소)
  - 로그인
  - 사용자 목록/생성/수정
  - 라이선스 목록/필터(만료 예정/만료/상태별)
  - 라이선스 상태 변경/연장/삭제 액션

완료 기준(DoD):
- 관리자 JWT 로그인 가능
- 관리자 권한 없는 요청 차단
- 운영 필수 CRUD가 UI 또는 API에서 모두 수행 가능

## Phase 5. Seed/초기 데이터 전략
목표: 새 서버에서 즉시 운영 점검 가능한 초기 상태 제공

작업:
- seed 정책 분리
  - 개발용 seed: 샘플 관리자/사용자/라이선스 충분히 생성
  - 운영용 seed: 최소 관리자 계정만 자동 생성(고객 데이터 미포함)
- seed 스크립트 재작성(PostgreSQL 기준)
  - 기본 관리자 1명 이상
  - 테스트 사용자
  - 테스트 라이선스(active/expired/revoked 각 1개 이상)
- 배포 절차에 seed 실행 단계 명시
  - 최초 배포 시만 실행할 항목과 재배포 항목 분리

완료 기준(DoD):
- 신규 DB에서 마이그레이션 + seed 후 즉시 로그인/조회/검증 테스트 가능
- 운영 seed가 고객 데이터 없이 안전하게 동작

## Phase 6. 운영 전환 및 안정화
목표: 운영 전환 리스크 최소화

작업:
- 데이터 마이그레이션 시나리오 정리
  - 기존 License(email) -> User + License(licenseKey) 매핑
- 모니터링/감사 로그 최소 적용
  - 관리자 로그인 실패/성공
  - 라이선스 상태 변경 이력
- 회귀 테스트 보강
  - 인증/인가, 검증 API, 상태 전이, 만료/연장 케이스

완료 기준(DoD):
- 운영 전환 체크리스트 완료
- 롤백 전략 및 백업 복구 절차 확인

## Phase 7. Frontend (React + SCSS + Vite)
목표: 기존 `/admin-ui` 인라인 페이지를 React 기반 운영 화면으로 전환

작업:
- Vite + React + TypeScript 프론트엔드 앱 생성 (`apps/admin-web` 권장)
- 스타일 체계 SCSS로 통일
  - 글로벌 토큰(`colors`, `spacing`, `typography`)을 `src/styles`에 분리
  - 컴포넌트 단위 SCSS 모듈 또는 페이지 단위 SCSS 규칙 확정
- API 클라이언트 계층 분리
  - `src/lib/api.ts`에서 공통 fetch 래퍼 구현
  - Bearer 토큰 주입/401 처리/에러 표준화
- 인증 플로우 구현
  - 로그인 페이지(`/login`)
  - 토큰 저장(localStorage) + 보호 라우트
  - 로그아웃 처리
- 관리자 화면 구현(최소)
  - 대시보드 개요(사용자 수/라이선스 수/만료 임박 수)
  - 사용자 페이지: 목록/생성/수정
  - 라이선스 페이지: 목록/필터/연장/상태 변경/삭제
- 백엔드 연동 방식 확정
  - 개발 환경: Vite proxy(`/admin`, `/license` -> backend)
  - 배포 환경: backend 정적 서빙 또는 별도 Nginx 배포 중 하나 선택
- 기존 `/admin-ui` 라우트는 fallback으로 유지 후 전환 완료 시 제거

완료 기준(DoD):
- React 앱에서 로그인 후 운영 필수 CRUD가 가능
- SCSS 기준 스타일 구조(글로벌 + 페이지/컴포넌트)가 정리됨
- `pnpm dev`(backend) + `pnpm --filter admin-web dev`(frontend) 동시 개발 가능
- 최소 e2e 시나리오(로그인 -> 사용자 생성 -> 라이선스 상태 변경) 수동 검증 완료

## 4. 구현 체크리스트

## 4.1 Phase 1 체크리스트
- [x] 현재 Prisma 스키마 ERD/필드 요약 문서화
- [x] email 기반 검증 흐름도 작성
- [x] 관리자 API 현행 기능/누락 기능 목록 확정
- [x] 기준선 테스트 결과 기록

## 4.2 Phase 2 체크리스트
- [x] Prisma datasource를 PostgreSQL로 변경
- [x] SQLite 어댑터/파일 유틸 제거
- [x] PostgreSQL migration 재생성
- [x] docker-compose에 postgres 추가
- [x] `.env.example`/README 환경변수 갱신
- [ ] 로컬 PostgreSQL에서 전체 테스트 통과

## 4.3 Phase 3 체크리스트
- [x] `User` 모델 추가
- [x] `License.licenseKey` 유니크 필드 추가
- [x] `License.userId` FK 추가
- [x] licenseKey 생성 유틸 구현 및 테스트
- [x] `/license/verify` 요청 스펙 변경
- [x] 검증 로직을 licenseKey 기준으로 변경
- [x] 기존 email 의존 로직 제거 또는 legacy 분리

## 4.4 Phase 4 체크리스트
- [x] `AdminUser` 모델 및 role 필드 추가
- [x] 관리자 로그인 API 구현
- [x] 인증 미들웨어(JWT/세션) 적용
- [x] 사용자 생성/수정/조회 API 구현
- [x] 라이선스 생성/삭제/연장/상태변경 API 구현
- [x] 관리자 UI 로그인/목록/수정 액션 구현
- [x] 권한별 접근제어 테스트 작성

## 4.5 Phase 5 체크리스트
- [x] 개발용 seed 작성
- [x] 운영용 seed 작성(최소 관리자만)
- [x] seed 실행 명령 분리(`seed:dev`, `seed:prod` 등)
- [x] 신규 서버 부트스트랩 문서화
- [x] seed 이후 스모크 테스트 절차 문서화

## 4.6 Phase 6 체크리스트
- [x] 기존 데이터 이관 스크립트 또는 절차 정리
- [ ] 관리자 액션 감사 로그 도입
- [ ] 전환 리허설 수행
- [ ] 백업/복구/롤백 시나리오 검증

## 5. 우선 구현 순서(실행 큐)
1. 충돌 해소(Phase 0)
2. PostgreSQL 전환(Phase 2)
3. licenseKey 데이터 모델/검증 API 전환(Phase 3)
4. 관리자 인증 전환 + 운영 CRUD(Phase 4)
5. seed 전략 분리 및 배포 자동화(Phase 5)
6. 운영 전환 리허설(Phase 6)
7. React + SCSS + Vite 프론트엔드 전환(Phase 7)

## 6. 즉시 착수 TODO (다음 작업 단위)
- [x] schema vs migration 불일치 항목 확정 및 기준안 선택(`ipAddr` 또는 `fingerprint`)
- [x] `db push` 사용 지점을 `migrate` 체계로 치환하는 변경안 작성
- [x] 관리자 인증 JWT 단일 정책 확정
- [x] `license/verify` legacy 병행 여부 및 종료 시점 확정
- [x] Phase 0 완료 기준 승인 후 Phase 2 착수
