# Progress Tracking Guide

아래 3가지를 보면 현재 진행 상태를 빠르게 파악할 수 있습니다.

## 1) 체크리스트 진행률 확인
- 파일: `docs/development-checklist.md`
- 완료된 항목은 `[x]`, 미완료 항목은 `[ ]`로 관리

## 2) 코드/테스트 정상 여부 확인
- 한 번에 실행:
```bash
pnpm run check:all
```
- 포함 항목:
  - Prisma schema validate
  - TypeScript build
  - Route tests

## 3) 현재 작업 변경점 확인
```bash
git status --short
git diff -- docs/development-checklist.md
```

## 배포 전 최소 스모크 체크
```bash
curl -fsS http://localhost:3000/health
curl -fsS http://localhost:3000/docs >/dev/null
```

관리자/라이선스 API 스모크는 `README.md`의 API 섹션과 함께 확인합니다.
