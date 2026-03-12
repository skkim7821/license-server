# Data Migration Playbook (SQLite -> PostgreSQL)

작성일: 2026-03-12

## 목표
- 기존 SQLite 기반 데이터를 PostgreSQL 운영 DB로 안전하게 이전
- 대상: `products`, `users`, `licenses`, `license_devices` 성격의 데이터

## 전제
- 최종 스키마는 PostgreSQL baseline migration 기준
- 검증 기준은 `licenseKey` 단일 기준

## 절차

1. **원본 백업 고정**
- SQLite 파일 백업 2본 생성
- 백업 파일 해시(sha256) 기록

2. **매핑 규칙 확정**
- `email` 단독 데이터는 `users.email`로 매핑
- 라이선스 키가 없는 레코드는 새 키 발급
- 제품 코드 소문자/공백은 대문자 normalize

3. **사전 검증(SQL/스크립트)**
- 중복 이메일 확인
- 중복 제품 코드 확인
- 만료/상태 불일치 레코드 확인

4. **스테이징 이전**
- 스테이징 PostgreSQL에 migration 적용
- 변환 스크립트로 bulk insert
- 검증 API 스모크(유효/만료/revoked/장치수 제한)

5. **프로덕션 컷오버**
- 서비스 쓰기 중지
- 최종 증분 export/import
- `pnpm run db:bootstrap:no-seed`로 스키마 보장
- 마이그레이션 데이터 주입 후 읽기/검증 점검

6. **컷오버 검증**
- 관리자 로그인
- 사용자/제품/라이선스 건수 대조
- 임의 라이선스 10건 샘플 검증

7. **롤백**
- 이상 징후 시 PostgreSQL 데이터 폐기
- SQLite 기반 이전 버전 재기동
- 컷오버 전 백업 기준으로 재시도

## 검증 체크 포인트
- 제품 코드 유니크 위반 0건
- 라이선스 키 유니크 위반 0건
- 사용자 이메일 유니크 위반 0건
- 샘플 검증 성공률 100%
