# License Server Development Plan

## 0. 문서 목적
이 문서는 현재 구현(SQLite + email 기반 검증)을 운영 가능한 최소 라이선스 서버(PostgreSQL + licenseKey 기반 검증 + 최소 관리자 운영 기능)로 전환하기 위한 단계별 실행 계획이다.

1차 목표 범위는 아래에 한정한다.
- PostgreSQL 기반으로 동작
- 이메일 대신 licenseKey로 검증
- 관리자 로그인 가능
- 관리자 화면(또는 관리자 API)에서 사용자 추가/수정, 라이선스 삭제/연장/만료/상태변경 가능
- 신규 서버에서 seed 데이터로 즉시 테스트 가능

## 1. 현재 상태(코드 기준)

### 1.1 데이터 모델
현재 `prisma/schema.prisma`:
- `datasource db.provider = "sqlite"`
- `Product(code PK, name, maxDevices, defaultPeriod)`
- `License(id, email, productCode FK, expiresAt, status, maxDevices)`
  - 유니크: `@@unique([email, productCode])`
- `LicenseDevice(id, licenseId FK, ipAddr, createdAt)`
  - 유니크: `@@unique([licenseId, ipAddr])`
- `LicenseStatus`: `active | revoked | expired`

### 1.2 검증 로직
현재 `src/routes/license.ts`:
- `POST /license/verify` 입력: `email + productCode (+ ipAddr)`
- 조회 키: `(email, productCode)`
- 만료시 `status=expired`로 갱신 후 거부
- `LicenseDevice`로 IP 기반 디바이스 제한 관리

### 1.3 관리자 기능
현재 `src/routes/admin.ts`:
- 인증: 정적 토큰 `ADMIN_TOKEN` (Bearer)
- 제공 API:
  - `POST /admin/products`
  - `GET /admin/products`
  - `POST /admin/licenses` (email 기반 발급)
  - `GET /admin/licenses` (email 오름차순)
  - `POST /admin/bulk/licenses`
- 미구현:
  - 관리자 계정/권한(Role) 모델
  - 라이선스 수정/연장/만료처리/삭제 API
  - 사용자 엔티티 CRUD

### 1.4 DB 연결/초기화
현재 `src/db.ts`, `src/db/bootstrap.ts`:
- `@prisma/adapter-better-sqlite3` 사용
- SQLite 전용 디렉터리/파일 처리 로직 존재
- bootstrap seed는 `Product + License(email) + LicenseDevice` 샘플 데이터 생성

### 1.5 구현 전 충돌 지점(선해결 필요)
- Prisma schema와 migration SQL의 컬럼 불일치(`ipAddr` vs `fingerprint`)
- migration 체계보다 `prisma db push` 중심 운영 경로(Dockerfile/bootstrap)
- DB 계층의 SQLite 어댑터 강결합(`@prisma/adapter-better-sqlite3`)
- 관리자 인증이 정적 `ADMIN_TOKEN`에 고정되어 로그인/권한 모델과 충돌
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
- 예시: `LIC-XXXX-XXXX-XXXX-XXXX` (대문자, 숫자)
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
  - `ADMIN_TOKEN` 제거 시점과 관리자 로그인 도입 시점 명시

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
- 정적 `ADMIN_TOKEN` 없이 관리자 로그인 가능
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

## 4. 구현 체크리스트

## 4.1 Phase 1 체크리스트
- [ ] 현재 Prisma 스키마 ERD/필드 요약 문서화
- [ ] email 기반 검증 흐름도 작성
- [ ] 관리자 API 현행 기능/누락 기능 목록 확정
- [ ] 기준선 테스트 결과 기록

## 4.2 Phase 2 체크리스트
- [ ] Prisma datasource를 PostgreSQL로 변경
- [ ] SQLite 어댑터/파일 유틸 제거
- [ ] PostgreSQL migration 재생성
- [ ] docker-compose에 postgres 추가
- [ ] `.env.example`/README 환경변수 갱신
- [ ] 로컬 PostgreSQL에서 전체 테스트 통과

## 4.3 Phase 3 체크리스트
- [ ] `User` 모델 추가
- [ ] `License.licenseKey` 유니크 필드 추가
- [ ] `License.userId` FK 추가
- [ ] licenseKey 생성 유틸 구현 및 테스트
- [ ] `/license/verify` 요청 스펙 변경
- [ ] 검증 로직을 licenseKey 기준으로 변경
- [ ] 기존 email 의존 로직 제거 또는 legacy 분리

## 4.4 Phase 4 체크리스트
- [ ] `AdminUser` 모델 및 role 필드 추가
- [ ] 관리자 로그인 API 구현
- [ ] 인증 미들웨어(JWT/세션) 적용
- [ ] 사용자 생성/수정/조회 API 구현
- [ ] 라이선스 생성/삭제/연장/상태변경 API 구현
- [ ] 관리자 UI 로그인/목록/수정 액션 구현
- [ ] 권한별 접근제어 테스트 작성

## 4.5 Phase 5 체크리스트
- [ ] 개발용 seed 작성
- [ ] 운영용 seed 작성(최소 관리자만)
- [ ] seed 실행 명령 분리(`seed:dev`, `seed:prod` 등)
- [ ] 신규 서버 부트스트랩 문서화
- [ ] seed 이후 스모크 테스트 절차 문서화

## 4.6 Phase 6 체크리스트
- [ ] 기존 데이터 이관 스크립트 또는 절차 정리
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

## 6. 즉시 착수 TODO (다음 작업 단위)
- [ ] schema vs migration 불일치 항목 확정 및 기준안 선택(`ipAddr` 또는 `fingerprint`)
- [ ] `db push` 사용 지점을 `migrate` 체계로 치환하는 변경안 작성
- [ ] `ADMIN_TOKEN` 제거/병행 기간 정책 확정
- [ ] `license/verify` legacy 병행 여부 및 종료 시점 확정
- [ ] Phase 0 완료 기준 승인 후 Phase 2 착수
