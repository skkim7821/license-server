# Phase 0 Decisions (Resolved on 2026-03-12)

이 문서는 충돌 해소(Phase 0) 항목의 확정 기준을 기록한다.

## 1) schema vs migration 불일치
- 기준안: `LicenseDevice.ipAddr` 유지
- 사유: 현재 라우트/검증 코드(`src/routes/license.ts`)와 운영 로그 모두 IP 기반 식별을 사용
- 결과: baseline migration(`prisma/migrations/20260312010000_postgres_baseline/migration.sql`)과 schema를 `ipAddr`로 통일

## 2) `db push` -> `migrate` 전환
- 기준안: 모든 서버/부트스트랩 경로를 `prisma migrate deploy` 중심으로 고정
- 결과:
  - `src/db/bootstrap.ts`에서 `pnpm prisma migrate deploy` 실행
  - reset 경로는 `pnpm prisma migrate reset --force --skip-seed --skip-generate`
  - Docker/운영 문서도 migrate 기반으로 정리

## 3) 관리자 인증 정책
- 정책 확정일: 2026-03-12
- 현재 정책:
  - `AdminUser + JWT` 로그인(`/admin/login`) 단일 정책

## 4) `license/verify` legacy 정책
- 정책 확정일: 2026-03-12
- 기준안: `licenseKey` 단일 검증으로 확정
- 결과: 기존 `email + productCode` 검증 경로 제거, 문서/API 스펙을 `licenseKey` 기준으로 유지

## 5) Phase 0 종료 판단
- 위 4개 충돌 항목 모두 해결됨
- Phase 1~2 이후 작업 착수 게이트 충족으로 판단
