# License Status Refactor (Expired vs Operational Block)

## 1. 현재 구조의 문제점
- `expired`가 시간 만료와 운영 차단을 동시에 표현해 의미가 섞여 있었습니다.
- `/license/verify`에서 만료를 감지하면 DB `status`를 `expired`로 강제 업데이트해, 운영 상태와 계산 상태가 분리되지 않았습니다.
- 운영 차단(abuse, security risk 등)에 대한 사유/메모/담당자 기록이 없어 운영 추적이 어려웠습니다.
- Electron/클라이언트에서 만료와 운영 차단을 다른 UX로 안내하기 위한 정보가 부족했습니다.

## 2. 제안하는 데이터 모델
- `License.status`: `active | suspended | revoked | expired`
  - `expired`는 시간 만료 의미 전용(verify 시 계산 기준).
  - 운영 차단은 `suspended`/`revoked`로 표현.
- `License`에 운영 차단 메타데이터 추가:
  - `blockReason`: `abuse | manual_review | security_risk | server_impact | billing_issue | other`
  - `blockedAt`, `blockedBy`, `blockNote`
  - `unblockedAt`, `unblockedBy`, `unblockedNote`

## 3. API 변경점
- `/license/verify` 우선순위:
  1) 라이선스 존재 확인
  2) 운영 차단 확인(`suspended`, `revoked`)
  3) `expiresAt` 기반 시간 만료 확인
  4) 디바이스/IP 제한 확인
  5) 성공 처리
- `/license/verify` 실패 응답 reason:
  - `not_found`, `suspended`, `revoked`, `expired`, `max_devices_reached`
  - 운영 차단 시 `blockReason`, `blockNote` 포함
- 어드민 API:
  - `PATCH /admin/licenses/:id/suspend`
  - `PATCH /admin/licenses/:id/unsuspend`
  - `PATCH /admin/licenses/:id/status`는 `active|revoked`만 허용
  - `PATCH /admin/licenses/:id/extend`는 `expiresAt` 조정 중심, 레거시 `expired` 정리 목적 외에는 상태를 자동 변경하지 않음

## 4. 마이그레이션 전략
- 스키마 변경:
  - `LicenseStatus`에 `suspended` 추가
  - `LicenseBlockReason` enum 및 block/unblock 관련 컬럼 추가
- 데이터 이전:
  - 기존 `status=expired` + `expiresAt > now()`: 보수적으로 `suspended`로 이전
    - `blockReason=manual_review`, `blockedBy=migration`, `blockNote` 자동 기록
  - 기존 `status=expired` + `expiresAt <= now()`: `active`로 전환
    - 이후 만료는 verify 계산으로 `expired` 판정
- 자동 분류가 어려운 케이스(미래 만료인데 legacy expired)는 운영자가 수동 검토해 `unsuspend`/`revoked` 결정

## 5. 테스트 전략
- verify 테스트:
  - active + not expired => 성공
  - expired(시간 만료) => `reason: expired`
  - suspended => `reason: suspended` + block metadata
  - revoked => `reason: revoked`
  - max devices => `reason: max_devices_reached`
- admin 테스트:
  - suspend 성공
  - unsuspend 성공
  - extend 성공(레거시 expired 정리 케이스 포함)
  - status revoked 변경 시 block metadata 기본값 부여 확인

## 6. 실제 코드 변경
- Prisma:
  - `prisma/schema.prisma`
  - `prisma/migrations/20260314090000_split_expired_and_operational_block/migration.sql`
- Backend:
  - `src/routes/license.ts`: verify 우선순위/응답 reason 개선, 만료 DB overwrite 제거
  - `src/routes/admin.ts`: suspend/unsuspend API 추가, extend/status 정책 정리, 응답 status 계산(`expiresAt` 기반)
- Tests:
  - `src/routes/license.test.ts`
  - `src/routes/admin.test.ts`
- Admin Web 반영 포인트:
  - `apps/admin-web/src/types/api.ts`
  - `apps/admin-web/src/lib/api.ts`
  - `apps/admin-web/src/pages/LicensesPage.tsx`
  - `apps/admin-web/src/pages/DashboardPage.tsx`
  - `apps/admin-web/src/App.tsx`
- Legacy admin-ui 반영:
  - `src/routes/admin-ui.ts`
