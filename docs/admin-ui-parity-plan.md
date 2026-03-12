# `/admin-ui` Parity & Transition Plan (2026-03-12)

## Parity 점검 결과

## 공통 가능 기능
- 관리자 로그인
- 사용자 조회/생성/수정
- 제품 조회/생성/수정/삭제
- 라이선스 조회/생성/연장/상태변경/삭제

## React UI(`apps/admin-web`)에서 개선된 점
- 엔티티 분리(`Users`, `Products`, `Licenses`)로 운영 동선 명확화
- 대시보드에서 `Products` 메트릭/요약 제공

## `/admin-ui`가 남긴 의미
- 서버 내장 단일 페이지로 즉시 점검용 fallback 역할
- 기능 자체는 React UI로 대체 가능

## 전환 단계
1. 2026-03-12 ~ 2026-04-15: React UI를 기본 운영 UI로 사용, `/admin-ui`는 fallback 유지
2. 2026-04-16 ~ 2026-04-30: `/admin-ui` 사용 금지 공지 및 최종 스모크
3. 2026-05-01: `/admin-ui` 라우트/테스트 제거

## 제거 조건(Go/No-Go)
- React UI에서 운영 필수 액션(사용자/제품/라이선스 CRUD) 1주 이상 무장애
- 운영 담당자 1회 이상 실사용 검증 완료
- `/admin-ui` 직접 접근 로그 0건 확인
