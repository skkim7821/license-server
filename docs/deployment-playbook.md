# Deployment Playbook (Version Tag Policy)

이 문서는 배포 정책을 명확히 고정한다.

- `main` 브랜치 푸시는 배포 트리거가 아니다.
- 이미지 생성 기준은 `vX.Y.Z` Git tag 이다.
- 서버 반영은 운영자가 원하는 시간에 수동으로 실행한다.

## 1) 고정 운영 정책
1. 코드 반영
- 개발은 기존처럼 `main`에 병합한다.

2. 이미지 생성
- `vX.Y.Z` 태그 푸시 시에만 backend/admin-web 이미지를 생성한다.
- 운영 배포는 버전 태그 이미지(`vX.Y.Z`)만 사용한다.
- `main` 태그 이미지는 운영 배포 기준으로 사용하지 않는다.

3. 서버 배포
- 자동 배포는 금지한다.
- 배포는 `workflow_dispatch` 수동 실행만 허용한다.
- 운영자가 저사용 시간에 직접 실행한다.

## 2) CI/CD 설계 기준
1. `publish-ghcr.yml` (자동 이미지 생성)
- 트리거: `push.tags: v*`
- 역할: GHCR 이미지 빌드/푸시
- 결과 태그 예시:
  - `ghcr.io/<org>/<repo>:v1.4.2`
  - `ghcr.io/<org>/<repo>-admin-web:v1.4.2`

2. `deploy-manual.yml` (수동 배포)
- 트리거: `workflow_dispatch`
- 입력:
  - `backend_tag` (예: `v1.4.2`)
  - `admin_tag` (예: `v1.4.2`)
  - `confirm` (`DEPLOY_NOW`)
- 안전장치:
  - `confirm` 값 미일치 시 즉시 실패
  - `concurrency`로 동시 배포 차단
- 배포 동작:
  - compose 동기화
  - `docker compose pull`
  - `docker compose up -d --remove-orphans`
  - health check

## 3) 수동 배포 절차
1. 배포 전
- 대상 버전 태그 확정(`vX.Y.Z`)
- 서버 접속/리소스 확인(`free -h`, `df -h`)
- 점검 시간 확보

2. Actions 실행
- `Deploy Manual` 선택
- `backend_tag`, `admin_tag`에 동일 버전 입력
- `confirm=DEPLOY_NOW` 입력 후 실행

3. 배포 후 확인
- `docker compose -f deploy/docker-compose.prod.yml ps`
- `docker compose -f deploy/docker-compose.prod.yml logs --tail=100 license-server`
- `curl -fsS http://127.0.0.1/health`
- 도메인 접속 및 관리자 로그인 확인

## 4) 롤백 원칙
- 롤백은 “이전 정상 버전 태그” 재배포로 수행한다.
- 예: `v1.4.3` 장애 시 `v1.4.2`로 수동 배포 재실행.

## 5) Secrets/Variables 기준
필수:
- `SSH_PRIVATE_KEY` (Secret)
- `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `DEPLOY_PATH`
- `GHCR_USERNAME`, `GHCR_TOKEN`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`

선택(HTTPS):
- `SERVER_NAME`, `ENABLE_HTTPS`, `SSL_CERT_PATH`, `SSL_KEY_PATH`

원칙:
- 민감정보는 Secret, 운영값은 Variable 우선

## 6) 운영 기록 템플릿
```md
## Deploy Record - YYYY-MM-DD HH:mm (KST)
- Operator:
- Backend Tag:
- Admin Tag:
- Reason:
- Result: success | failed | rollback
- Incident/Notes:
```

## 7) 최종 점검 체크리스트
- [ ] 배포 대상이 `vX.Y.Z` 태그인지 확인
- [ ] 자동 배포 경로가 비활성화되어 있는지 확인
- [ ] 수동 배포에서 `confirm=DEPLOY_NOW`를 사용했는지 확인
- [ ] health check / 로그인 스모크 테스트 완료
- [ ] 배포 기록 작성 완료
