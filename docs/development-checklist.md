# Development Checklist

`docs/development-plan.md` 기반 실행 체크리스트

## Phase 0. 충돌 해소(착수 게이트)
- [ ] schema와 migration SQL 불일치 해소 기준 확정(`ipAddr`/`fingerprint`)
- [ ] SQLite migration 이력 정리 및 Postgres baseline 전략 확정
- [ ] `db push` -> `migrate` 전환 계획 확정(Dockerfile/bootstrap 포함)
- [ ] `ADMIN_TOKEN` 제거/병행 시나리오 확정
- [ ] `license/verify` legacy 병행 여부와 종료 시점 확정
- [ ] Phase 0 완료 승인(Phase 1+ 착수 게이트)

## Phase 1. 현행 구조 동결 및 분석
- [ ] Prisma 스키마 ERD/필드 요약 문서화
- [ ] email 기반 검증 흐름도 작성
- [ ] 관리자 API 현행 기능/누락 기능 목록 확정
- [ ] 기준선 테스트 결과 기록

## Phase 2. PostgreSQL 전환
- [ ] Prisma datasource를 PostgreSQL로 변경
- [ ] SQLite 어댑터/파일 유틸 제거
- [ ] PostgreSQL migration 재생성
- [ ] docker-compose에 postgres 추가
- [ ] `.env.example`/README 환경변수 갱신
- [ ] 로컬 PostgreSQL에서 전체 테스트 통과

## Phase 3. licenseKey 중심 전환
- [ ] `User` 모델 추가
- [ ] `License.licenseKey` 유니크 필드 추가
- [ ] `License.userId` FK 추가
- [ ] licenseKey 생성 유틸 구현 및 테스트
- [ ] `/license/verify` 요청 스펙 변경
- [ ] 검증 로직을 licenseKey 기준으로 변경
- [ ] 기존 email 의존 로직 제거 또는 legacy 분리

## Phase 4. 관리자 인증/권한/CRUD
- [ ] `AdminUser` 모델 및 role 필드 추가
- [ ] 관리자 로그인 API 구현
- [ ] 인증 미들웨어(JWT/세션) 적용
- [ ] 사용자 생성/수정/조회 API 구현
- [ ] 라이선스 생성/삭제/연장/상태변경 API 구현
- [ ] 관리자 UI 로그인/목록/수정 액션 구현
- [ ] 권한별 접근제어 테스트 작성

## Phase 5. Seed/초기 데이터
- [ ] 개발용 seed 작성
- [ ] 운영용 seed 작성(최소 관리자만)
- [ ] seed 실행 명령 분리(`seed:dev`, `seed:prod`)
- [ ] 신규 서버 부트스트랩 문서화
- [ ] seed 이후 스모크 테스트 절차 문서화

## Phase 6. 운영 전환/안정화
- [ ] 기존 데이터 이관 스크립트 또는 절차 정리
- [ ] 관리자 액션 감사 로그 도입
- [ ] 전환 리허설 수행
- [ ] 백업/복구/롤백 시나리오 검증
