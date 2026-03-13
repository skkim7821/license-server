# Docker Fullstack TODO (Frontend + Backend)

목표: Docker Compose만으로 PostgreSQL, Backend(Fastify), Frontend(React/Vite build 결과 서빙)가 함께 기동되고 운영 점검이 가능한 상태를 만든다.

## 0) 범위/완료 기준
- [ ] `docker compose up -d --build` 한 번으로 전체 스택 기동
- [ ] 브라우저에서 Frontend 접속 가능
- [ ] Frontend에서 `/admin/login`, `/admin/users`, `/admin/products`, `/admin/licenses` 호출 정상
- [ ] CORS/Proxy 이슈 없이 API 통신 성공
- [ ] 재기동 후 DB 데이터 유지 확인

## 1) Docker 이미지 전략 확정
- [x] Backend Dockerfile 유지(현재 방식 점검)
- [ ] Frontend 배포 방식 선택
  - [x] A안: Frontend 정적 빌드 + Nginx 컨테이너
  - [ ] B안: Backend가 Frontend static 파일 서빙
- [x] 최종안 선택 후 문서에 고정

## 2) Frontend 컨테이너화
- [x] `apps/admin-web/Dockerfile` 생성 (multi-stage build)
- [x] build stage에서 `pnpm --filter admin-web build` 수행
- [x] runtime stage에서 정적 파일 서빙 설정(Nginx 또는 node static)
- [x] 환경별 API endpoint 주입 방식 정의
  - [x] build-time (`VITE_API_BASE_URL`)
  - [x] runtime (entrypoint 치환) 중 하나 선택
  - [x] 선택: Nginx reverse proxy 기반 상대경로(`/admin`, `/license`) 유지

## 3) docker-compose 확장
- [x] `frontend` 서비스 추가
- [x] `depends_on`: `license-server` 연결
- [x] 외부 노출 포트 확정 (예: `5174:80` 또는 `8080:80`)
- [x] 네트워크 이름/서비스 DNS 기준으로 API URL 설정
- [ ] healthcheck 추가 (`frontend`, `license-server`, `postgres`)

## 4) Backend-Frontend 연동
- [ ] Backend CORS 정책 확인/수정 (frontend origin 허용)
- [ ] Frontend API base URL을 docker 네트워크 기준으로 연결
- [ ] 로그인 토큰 저장/전달 동작 실컨테이너에서 확인
- [ ] 에러 응답 포맷(401/403/409) UI 표시 확인

## 5) 환경 변수/시크릿 정리
- [ ] `.env`에 frontend 관련 변수 추가
- [ ] 운영용 `.env` 템플릿 분리(`.env.prod` 예시 문서화)
- [x] Docker 내부 DB 연결 문자열은 compose에서 고정(`postgres:5432`) 처리
- [x] 관리자 인증 JWT 전용 정책 반영
- [ ] `ADMIN_JWT_SECRET` 필수값 점검

## 6) 부트스트랩/마이그레이션 순서 고정
- [ ] 최초 기동 시 `prisma migrate deploy` 실행 보장
- [ ] seed 전략 반영 (`db:bootstrap:prod` 기준)
- [ ] 장애 시 재기동/롤백 절차 문서화

## 7) 검증 체크리스트 (수동 스모크)
- [ ] `docker compose ps`에서 모든 서비스 `healthy`
- [ ] `GET /health` 200
- [ ] Frontend 로그인 성공
- [ ] Users/Product/License CRUD 각각 1회 이상 성공
- [ ] 라이선스 검증 API(`/license/verify`) 정상 응답 확인
- [ ] 컨테이너 재시작 후 데이터 유지 확인

## 8) 문서 반영
- [ ] `README.md`에 fullstack compose 실행 절차 추가
- [ ] `docs/development-checklist.md`에 Docker fullstack 항목 추가
- [ ] 운영 인수인계용 커맨드 모음 업데이트

## 9) SSL/TLS 운영 정리 (클라우드 이관 대비)
- [x] Admin-web Nginx를 템플릿 기반으로 전환 (HTTP/HTTPS 런타임 선택)
- [x] `ENABLE_HTTPS`, `SERVER_NAME`, `SSL_CERT_PATH`, `SSL_KEY_PATH` 환경변수로 제어
- [x] 인증서 파일 미존재 시 HTTP 모드로 자동 fallback (컨테이너 기동 실패 방지)
- [x] 배포 워크플로우에서 SSL 관련 환경변수 전달
- [ ] 환경별 값 문서화
  - Oracle/LetsEncrypt 예시: `/etc/letsencrypt/live/<domain>/fullchain.pem`
  - Cloudflare Origin Cert 예시 경로
