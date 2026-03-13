# Phase 1 Baseline Snapshot (2026-03-12)

## 1) Prisma 스키마 ERD/필드 요약

## Entities
- `Product(code PK, name, maxDevices, defaultPeriod)`
- `User(id PK, email UNIQUE, name, createdAt, updatedAt)`
- `AdminUser(id PK, email UNIQUE, passwordHash, role, status, lastLoginAt, createdAt, updatedAt)`
- `License(id PK, licenseKey UNIQUE, email, userId FK, productCode FK, expiresAt, status, maxDevices, UNIQUE(email, productCode))`
- `LicenseDevice(id PK, licenseId FK, ipAddr, createdAt, UNIQUE(licenseId, ipAddr))`

## Relations
- `User 1:N License`
- `Product 1:N License`
- `License 1:N LicenseDevice`

## 2) 검증 흐름(`POST /license/verify`)
1. 요청 입력: `licenseKey` (필수), `ipAddr` (선택)
2. `licenseKey`로 `License` 조회
3. 상태 검사: `revoked`면 차단
4. 만료 검사: `expiresAt < now`면 `status=expired` 갱신 후 차단
5. 디바이스 검사:
   - 현재 등록 장치 수 >= `maxDevices` 이고 신규 IP면 차단
   - 신규 IP면 `LicenseDevice` 등록
6. 성공 응답: `valid`, `status`, `expiresAt`, `remainingDevices`

## 3) 관리자 API 기능/누락 목록

## 구현 완료
- 인증: `POST /admin/login` (JWT)
- Users: 생성/조회/수정/삭제
- Products: 생성/조회/수정/삭제
- Licenses: 생성/조회/연장/상태변경/삭제
- Bulk: `POST /admin/bulk/licenses`

## 남은 과제(운영 안정화 관점)
- 관리자 액션 감사 로그 저장(Phase 6)
- `/admin-ui` 레거시 제거 전 parity 최종 확인

## 4) 기준선 테스트 기록
- 실행 일시: 2026-03-12
- 명령: `pnpm test`
- 결과: `4 files`, `41 tests` 모두 통과
  - `src/routes/admin.test.ts`
  - `src/routes/license.test.ts`
  - `src/routes/health.test.ts`
  - `src/routes/admin-ui.test.ts`
