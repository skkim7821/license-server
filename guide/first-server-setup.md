# First Server Setup Guide (Production)

이 문서는 서버를 처음 세팅해서 `license-server`, `admin-web`, `edge-proxy`를 운영 배포하기 위한 최소 절차를 정리한다.

## 1) Server Base Setup

1. Ubuntu 패키지 업데이트
2. Docker Engine + Docker Compose Plugin 설치
3. 배포 계정 생성 (예: `deploy`) 및 `docker` 그룹 권한 부여
4. 방화벽 오픈: `22`, `80`, `443`
5. 서버 시간/타임존 확인

## 2) DNS Setup

1. 운영 도메인(예: `skkim.dev`)을 서버 공인 IP로 A/AAAA 레코드 연결
2. DNS 전파 확인 (`dig`, `nslookup`)

## 3) HTTPS Certificate Setup

현재 구조는 `edge-proxy`가 서버에 있는 인증서 파일을 직접 참조하므로, 인증서가 먼저 준비되어야 한다.

1. `certbot` 설치
2. 도메인 인증서 발급
3. 인증서 경로 확인
   - `SSL_CERT_PATH` 예: `/etc/letsencrypt/live/<domain>/fullchain.pem`
   - `SSL_KEY_PATH` 예: `/etc/letsencrypt/live/<domain>/privkey.pem`
4. 자동 갱신 타이머 확인 (`certbot.timer`)

## 4) Deploy Path and SSH

1. 서버에 배포 디렉터리 생성 (예: `/home/deploy/app`)
2. `deploy` 계정이 해당 경로와 Docker를 사용할 수 있는지 권한 확인
3. 로컬/CI에서 SSH 키 접속 확인 (`manual-deploy.sh` 기준)

## 5) GHCR Access

1. 서버에서 `docker login ghcr.io` 가능한 자격 증명 준비
2. GitHub Actions Secrets/Vars 확인
   - `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `DEPLOY_PATH`
   - `GHCR_USERNAME`, `GHCR_TOKEN`
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`
   - `SERVER_NAME`, `ENABLE_HTTPS`, `SSL_CERT_PATH`, `SSL_KEY_PATH`

## 6) Image Strategy

1. 운영에서 사용할 이미지 태그 결정 (`main` 또는 고정 태그)
2. 필수 값
   - `BACKEND_IMAGE_TAG`
   - `ADMIN_WEB_IMAGE_TAG`
3. 권장: 실제 운영 배포는 SHA/릴리즈 태그로 고정

## 7) First Deploy

1. GHCR에 이미지가 존재하는지 확인 (`publish-ghcr.yml` 완료)
2. 배포 실행
   - `bash scripts/deploy/manual-deploy.sh`
3. 배포 확인
   - `docker compose ps`
   - `https://<SERVER_NAME>/health`
   - `https://<SERVER_NAME>/license-console-k9/`

## 8) Post-Deploy Ops

1. 기본 점검 명령 준비
   - `docker compose logs -f edge-proxy`
   - `docker compose logs -f admin-web`
   - `docker compose logs -f license-server`
2. 장애 시 태그 롤백 절차 문서화
3. 인증서 만료 모니터링(알림) 추가

## Quick Checklist

- [ ] Docker/Compose 설치 완료
- [ ] DNS 연결 완료
- [ ] 인증서 발급/경로 확인 완료
- [ ] SSH/배포 경로 권한 확인 완료
- [ ] GHCR pull 가능 확인 완료
- [ ] 필수 env 값 세팅 완료
- [ ] 이미지 태그 확정 완료
- [ ] 첫 배포 및 URL 검증 완료
