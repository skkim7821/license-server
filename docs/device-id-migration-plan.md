# Device ID Migration Plan

## 0. 문서 목적
이 문서는 현재 `/license/verify`의 IP 기반 디바이스 판별을
컴퓨터 기준 식별값 기반으로 전환하기 위한 계획을 정리한다.

이번 문서의 목적은 바로 구현하는 것이 아니라,
아래 항목을 먼저 합의하는 데 있다.

- 서버가 어떤 값을 `컴퓨터`의 기준으로 볼지
- API 계약을 어떻게 바꿀지
- DB 스키마를 어떤 형태로 옮길지
- 관리자 화면/운영 데이터에 어떤 영향이 생길지
- 운영 중 전환 시 호환성 전략을 어떻게 가져갈지

## 1. 배경

### 1.1 현재 방식
현재 서버는 라이선스 검증 시 전달된 `ipAddr`와 요청 IP/프록시 헤더를 조합해
디바이스를 식별한다.

관련 코드:
- `apps/license-server/src/routes/license.ts`
- `apps/license-server/prisma/schema.prisma`
- `apps/license-server/src/routes/admin.ts`
- `apps/admin-web/src/pages/LicensesPage.tsx`

현재 구조 요약:
- `/license/verify` 요청: `{ licenseKey, ipAddr? }`
- 서버는 `ipAddr`, `x-forwarded-for`, `request.ip`, `socket.remoteAddress`를 조합해 최종 IP를 결정
- `LicenseDevice.ipAddr`에 저장
- `@@unique([licenseId, ipAddr])`로 중복 방지
- 관리자 화면에는 `deviceIps`로 노출

### 1.2 현재 방식의 문제
IP 기반 식별은 `컴퓨터 기준`과 맞지 않는다.

주요 문제:
- 동일한 컴퓨터도 네트워크가 바뀌면 다른 장치처럼 보일 수 있다
- 여러 컴퓨터가 NAT/VPN/프록시 뒤에서 같은 IP로 보일 수 있다
- 로컬/프록시 환경에서는 loopback 주소가 개입되어 예외 처리가 많아진다
- IP는 네트워크 위치 정보에 가깝고, 설치된 컴퓨터 자체를 안정적으로 대표하지 못한다

결론:
- `컴퓨터 한 대 = 한 식별값`이라는 정책을 원하면 IP는 적절한 기준이 아니다

## 2. 목표

### 2.1 핵심 목표
- 디바이스 제한 기준을 `IP`가 아니라 `컴퓨터 식별값`으로 전환
- 서버는 네트워크 정보 추론 없이 클라이언트가 전달한 식별값만으로 판정
- 디바이스 수 제한 정책(`maxDevices`)은 유지
- 기존 라이선스 검증 흐름과 에러 모델은 가능한 한 유지
- 앱 업데이트, 앱 재설치, OS 재설치, 네트워크 변경 후에도 가능한 한 동일한 `deviceId`가 유지되도록 설계

### 2.2 비목표
이번 변경에서 아직 확정하지 않는 것:
- 클라이언트 앱별 저장 위치/보안 강화 방식
- 디바이스 해제/교체 UX 상세 정책
- 안티탬퍼링/복제 방지의 고도화

## 3. 제안 방향

### 3.1 서버 표준 식별 필드
서버 기준의 표준 필드는 `deviceId`로 제안한다.

이유:
- `ipAddr`보다 의미가 명확하다
- `fingerprint`보다 중립적이다
- 클라이언트 구현이 해시 기반이든 UUID 기반이든 수용 가능하다

대안:
- `machineFingerprint`
- `fingerprint`

현재 추천:
- API/DB/어드민 전반에서 `deviceId` 사용

### 3.2 기본 원칙
- 서버는 `deviceId`를 opaque string으로 취급한다
- 서버는 `deviceId`를 직접 생성하지 않는다
- 서버는 IP fallback을 두지 않는다
- 동일 라이선스에서 같은 `deviceId`는 같은 컴퓨터로 본다
- 서로 다른 `deviceId`는 다른 컴퓨터로 본다

### 3.3 디바이스 핑거프린트 생성 원칙
클라이언트는 `deviceId`를 임의 문자열이 아니라,
일정한 규칙으로 만든 `안정적인 컴퓨터 식별값`으로 생성해야 한다.

핵심 원칙:
- 같은 컴퓨터에서는 앱 재실행 후에도 가능한 한 같은 값이 나와야 한다
- 같은 컴퓨터에서는 앱 재설치 후에도 가능한 한 같은 값이 나와야 한다
- 같은 컴퓨터에서는 OS 재설치 후에도 가능한 한 같은 값이 나와야 한다
- 네트워크가 바뀌어도 값이 바뀌지 않아야 한다
- 다른 컴퓨터에서는 다른 값이 나와야 한다
- 서버에는 원본 하드웨어 식별자가 아니라 해시된 결과만 보내는 것이 바람직하다
- 생성 규칙은 버전 관리되어야 한다
- 앱 버전, 빌드 번호, 설치 경로처럼 업데이트/재설치에 영향을 받는 값은 포함하지 않는다
- `installId`처럼 설치 단위로 새로 생기는 값은 기본 권장안에서 제외한다

## 4. 디바이스 핑거프린트 생성 가이드

이 섹션은 구현 가이드 초안이다.
클라이언트 담당자와 공유할 때 기본 문서로 사용한다.

### 4.1 권장 생성 전략
권장 방식은 `수집 가능한 하드웨어/펌웨어/OS 머신 식별 정보`를 조합한 뒤,
정규화 후 해시하는 방식이다.

권장 순서:
1. 머신 식별 정보 수집
2. 값 정규화
3. 버전 문자열 포함
4. 하나의 원문 문자열로 조합
5. `SHA-256` 해시
6. 서버에 해시 결과만 전송

예시 개념:

```text
raw = "v1|system_uuid|board_serial|bios_serial|os_machine_id|cpu_info|hostname"
deviceId = sha256(raw)
```

또는 버전이 보이게:

```text
deviceId = "v1_" + sha256(raw)
```

### 4.2 왜 `installId`를 기본안에서 제외하는가
이번 정책에서는 앱 재설치와 OS 재설치 후에도
가능하면 같은 `deviceId`를 유지하는 것이 목표다.

따라서 설치 시 새로 생성되는 `installId`는 기본 권장안에서 제외한다.

현재 권장 우선순위:

- 1순위: system UUID / BIOS UUID / board serial
- 2순위: OS 수준 machine id
- 3순위: CPU 정보 일부
- 4순위: hostname

설명:
- `installId`는 앱 재설치 시 값이 바뀔 수 있으므로 기본안에 넣지 않는다
- 디스크 serial은 교체/마이그레이션 영향이 커서 핵심값으로 권장하지 않는다

### 4.3 수집 후보값
후보값은 플랫폼 제약을 고려해 일부만 사용될 수 있다.
항상 모든 값을 요구하는 방식보다는,
`수집 가능한 값들만 조합`하는 방식이 안전하다.

권장 후보:
- 메인보드/시스템 UUID
- BIOS UUID 또는 시스템 시리얼
- OS machine id
- CPU 정보 일부
- 호스트명

권장하지 않음:
- 공인 IP
- 사설 IP
- MAC 주소 단독 사용
- 브라우저 user agent 류 값 단독 사용
- 앱 설치 시 생성한 UUID(`installId`)
- 설치 경로
- 앱 버전/빌드 번호

### 4.4 플랫폼별 우선순위 예시
실제 구현은 앱 런타임에 따라 달라질 수 있으나,
개념적으로는 아래 우선순위를 권장한다.

macOS:
- system UUID
- hardware serial
- hostname

Windows:
- machine guid
- baseboard/system uuid
- bios/system serial
- hostname

Linux:
- `/etc/machine-id`
- DMI product uuid 또는 board serial
- hostname

주의:
- 일부 값은 권한 문제로 비어 있을 수 있다
- 특정 값 하나에 강하게 의존하지 말고 조합해야 한다
- 운영체제 재설치 후에도 유지가 필요하면 `machine-id` 단독 의존은 피해야 한다

### 4.5 정규화 규칙
서로 다른 클라이언트 구현이 같은 컴퓨터에서 최대한 같은 값을 만들려면
정규화 규칙을 먼저 고정해야 한다.

권장 규칙:
- 문자열 trim
- 소문자 변환
- 빈 값 제거
- 구분자 충돌 방지
- 필드 순서 고정
- null/undefined/empty string 제외

예시:

```text
parts = [
  version,
  normalize(systemUuid),
  normalize(boardSerial),
  normalize(biosSerial),
  normalize(osMachineId),
  normalize(hostname),
].filter(Boolean)

raw = parts.join("|")
deviceId = "v1_" + sha256(raw)
```

### 4.6 해시 전송을 권장하는 이유
서버가 원본 하드웨어 값을 직접 저장하면
개인정보/민감정보 취급 범위가 불필요하게 커진다.

따라서 서버에는 아래만 전달하는 것을 권장한다.

- `deviceId`: 해시된 최종 식별값
- 필요시 `deviceIdVersion`: 생성 규칙 버전

원본 값은 가능하면 클라이언트 내부에서만 사용하고 서버로 보내지 않는다.

### 4.7 포맷 권장안
문자열 포맷은 단순하고 버전 식별이 가능해야 한다.

권장 예시:

```text
v1_7f4d4b7d0d8d8b5f3e0b1d...
```

또는:

```json
{
  "deviceId": "v1_7f4d4b7d0d8d8b5f3e0b1d...",
  "deviceIdVersion": "v1"
}
```

현재 추천:
- 초기에는 `deviceId` 단일 필드만 사용
- 내부 문자열에 버전 prefix를 포함

## 5. 금지/비권장 사항

아래 방식은 가급적 피한다.

### 5.1 IP 기반 생성
금지 이유:
- 네트워크 변경에 취약
- 동일 네트워크의 여러 장치가 충돌할 수 있음
- `컴퓨터 기준`이라는 목표와 맞지 않음

### 5.2 MAC 주소 단독 사용
문제:
- 가상 어댑터, Wi-Fi/유선 전환, 권한 제한 등으로 흔들릴 수 있음
- 프라이버시 이슈가 큼

### 5.3 설치 UUID 단독 사용
문제:
- 앱 재설치나 저장소 삭제 시 값이 바뀔 수 있음
- 같은 컴퓨터라도 재등록으로 처리될 가능성이 큼

현재 정책:
- `installId`는 기본 권장안에서 제외
- 예외적인 fallback 후보로만 검토

### 5.4 디스크 식별자 중심 사용
문제:
- SSD/HDD 교체 시 값이 바뀔 수 있음
- 클론/마이그레이션 환경에서 일관성이 떨어질 수 있음
- 같은 컴퓨터 유지라는 정책과 충돌할 수 있음

현재 정책:
- 디스크 관련 값은 핵심 기준으로 쓰지 않는다
- 필요 시 보조값으로만 검토한다

### 5.5 원본 하드웨어 값 그대로 서버 저장
문제:
- 운영/보안 부담 증가
- 불필요하게 민감한 데이터가 서버에 남음

## 6. 권장 의사결정

현재 문서 기준의 권장안은 아래와 같다.

- 서버 필드명: `deviceId`
- 생성 위치: 클라이언트
- 생성 방식: 하드웨어/펌웨어/OS 머신 식별자 조합 후 해시
- 서버 전송값: 해시 결과만 전송
- 포맷: `v1_<sha256>`
- 서버 저장값: `deviceId`만 저장
- `installId`는 기본 권장안에서 제외

## 7. 클라이언트 구현 체크리스트

구현 담당자가 최소한 아래 항목을 확인해야 한다.

- 같은 컴퓨터에서 재실행 시 `deviceId`가 유지되는가
- 같은 컴퓨터에서 앱 재설치 후에도 `deviceId`가 유지되는가
- 같은 컴퓨터에서 OS 재설치 후에도 `deviceId`가 유지되는가
- 네트워크 변경 시 `deviceId`가 유지되는가
- 앱 업데이트 후 `deviceId`가 유지되는가
- 원본 하드웨어 값이 서버로 전송되지 않는가
- `deviceId` 생성 실패 시 예외 흐름이 정의되어 있는가

## 8. 운영 관점에서 정해야 할 정책

핑거프린트 생성 자체와 별개로 아래 정책을 같이 정해야 한다.

- OS 재설치 후 새 컴퓨터로 볼지 여부
- 메인보드/디스크 교체 시 새 컴퓨터로 볼지 여부
- 사용자가 장치 교체를 요청할 때 관리자 해제 절차를 둘지
- `deviceId`가 변경되었을 때 자동 교체를 허용할지

이 정책이 없으면 기술적으로 `deviceId`를 만들어도 운영 판단이 흔들린다.

현재 제안:
- 앱 재설치: 같은 컴퓨터로 간주
- OS 재설치: 가능한 한 같은 컴퓨터로 간주
- 메인보드 교체: 새 컴퓨터로 간주 가능성이 높음
- 디스크 교체: 새 컴퓨터로 보지 않는 방향을 우선 목표로 함

## 9. API 변경 초안

### 9.1 `/license/verify` 요청
현행:

```json
{
  "licenseKey": "LIC-XXXX-XXXX-XXXX-XXXX",
  "ipAddr": "203.0.113.10"
}
```

변경안:

```json
{
  "licenseKey": "LIC-XXXX-XXXX-XXXX-XXXX",
  "deviceId": "client-generated-stable-id"
}
```

### 9.2 검증 규칙
- `licenseKey` 필수
- `deviceId` 필수
- 공백 제거 후 빈 문자열이면 `missing_fields`
- 대소문자 정규화 여부는 별도 결정

### 9.3 응답
성공/실패 응답 포맷은 가능하면 그대로 유지한다.

유지 대상:
- `valid`
- `expiresAt`
- `remainingDevices`
- 실패 `reason`

즉, 클라이언트가 바뀌는 핵심은 `요청 필드`이고,
응답 구조는 최소 변경으로 유지하는 방향이다.

## 10. 데이터 모델 변경 초안

### 10.1 Prisma 모델 변경
현행:

```prisma
model LicenseDevice {
  id        String   @id @default(cuid())
  licenseId String
  ipAddr    String
  createdAt DateTime @default(now())
  license   License  @relation(fields: [licenseId], references: [id])

  @@unique([licenseId, ipAddr])
}
```

변경안:

```prisma
model LicenseDevice {
  id        String   @id @default(cuid())
  licenseId String
  deviceId  String
  createdAt DateTime @default(now())
  license   License  @relation(fields: [licenseId], references: [id])

  @@unique([licenseId, deviceId])
}
```

### 10.2 관리자 응답 모델
현행:
- `deviceIps`

변경안:
- `deviceIds`

필요시 운영 화면 표시명은 사용자 친화적으로 조정 가능:
- `등록된 컴퓨터`
- `등록된 디바이스`
- `등록된 식별값`

## 11. 서버 로직 변경 계획

### 11.1 제거 대상
`apps/license-server/src/routes/license.ts`에서 아래 로직은 제거 대상이다.

- `x-forwarded-for` 해석
- `request.ip` / `socket.remoteAddress` fallback
- loopback 주소 예외 처리
- IP 정규화 함수
- IP 기반 countable device 판별

### 11.2 신규 로직
서버는 다음 절차로 단순화한다.

1. `licenseKey` 정규화
2. `deviceId` 정규화
3. 라이선스 조회
4. 상태/만료 검증
5. 기존 등록 `deviceId` 존재 여부 확인
6. 없으면 `maxDevices` 비교 후 등록
7. `remainingDevices` 반환

### 11.3 정규화 원칙 초안
- 앞뒤 공백 제거
- 빈 문자열 거부
- 필요시 길이 제한 추가

아직 미정:
- 대소문자를 서버에서 통일할지
- 허용 문자 집합을 제한할지
- 해시 문자열 포맷을 강제할지

## 12. 테스트 변경 계획

### 12.1 `license.test.ts`
변경 대상:
- `ipAddr` 기반 테스트를 `deviceId` 기준으로 교체
- `x-forwarded-for` fallback 테스트 제거
- loopback 예외 테스트 제거

유지/대체 테스트:
- 같은 `deviceId` 재검증 시 성공
- 새로운 `deviceId` 등록 시 성공
- `maxDevices` 초과 시 `max_devices_reached`
- `deviceId` 누락 시 `missing_fields`

### 12.2 `admin.test.ts`
변경 대상:
- `deviceIps` 응답 검증을 `deviceIds`로 교체
- 테스트 fixture의 `ipAddr`를 `deviceId`로 교체

## 13. 문서 및 UI 변경 계획

변경 대상:
- `README.md`
- `docs/phase0-decisions.md`
- `docs/phase1-baseline.md`
- 필요시 `docs/development-plan.md`
- `apps/admin-web/src/types/api.ts`
- `apps/admin-web/src/pages/LicensesPage.tsx`

변경 내용:
- `IP 기반 디바이스 제한` 문구 제거
- `컴퓨터 식별값 기반 디바이스 제한`으로 수정
- 운영 화면에서 `deviceIps` 대신 `deviceIds` 또는 더 읽기 쉬운 라벨 사용

## 14. 호환성 및 마이그레이션 전략

이 항목은 구현 전 반드시 결정해야 한다.

### 옵션 A. 즉시 전환
정의:
- 서버를 `deviceId` 전용으로 즉시 전환
- 기존 `ipAddr` 입력은 더 이상 받지 않음

장점:
- 코드가 가장 단순하다
- 의미가 섞이지 않는다
- 운영 기준이 명확하다

단점:
- 클라이언트도 동시에 배포되어야 한다
- 구버전 클라이언트는 즉시 실패할 수 있다

### 옵션 B. 짧은 병행 기간 운영
정의:
- 일정 기간 `deviceId` 우선, 구버전 `ipAddr`는 임시 허용
- 이후 `ipAddr` 제거

장점:
- 운영 전환 리스크가 낮다
- 클라이언트 순차 배포가 가능하다

단점:
- 서버 로직이 한동안 복잡해진다
- `컴퓨터 기준`과 `IP 기준`이 혼재한다
- 저장 필드/정책이 애매해질 수 있다

### 옵션 C. DB 필드는 `deviceId`로 바꾸되, 구버전 IP를 임시 문자열로 수용
정의:
- 저장 컬럼은 `deviceId` 하나로 통합
- 구버전 클라이언트가 보내는 IP도 임시로 같은 컬럼에 저장

장점:
- 스키마 전환은 빠르다

단점:
- 데이터 의미가 섞인다
- 운영자가 목록을 봤을 때 식별값 품질이 일관되지 않다
- 장기적으로 기술 부채가 된다

현재 추천:
- 운영 중이면 옵션 B
- 아직 외부 배포 전이거나 통제 가능한 환경이면 옵션 A
- 옵션 C는 가능하면 피한다

## 15. 기존 데이터 처리 전략

기존 `LicenseDevice.ipAddr` 데이터는 새 `deviceId`와 의미가 다르다.

따라서 기본 원칙은 다음으로 제안한다.

- 기존 IP 데이터를 새 `deviceId`로 자동 승격하지 않는다
- 전환 시점 이후부터 새 등록은 `deviceId`만 사용한다
- 필요시 기존 등록 장치를 초기화하는 운영 공지를 동반한다

검토 포인트:
- 기존 라이선스의 등록 디바이스를 유지해야 하는지
- 전환 시 전체 `LicenseDevice`를 비울지
- 사용자 재인증 비용을 감수할지

## 16. 클라이언트 구현 관련 가정

서버 계획 수립을 위해 현재 다음을 가정한다.

- 클라이언트는 실행 환경별로 비교적 안정적인 `deviceId`를 생성할 수 있다
- 같은 컴퓨터에서는 앱 업데이트, 앱 재설치, OS 재설치 후에도 가능한 한 동일한 `deviceId`를 보낸다
- 다른 컴퓨터에서는 다른 `deviceId`가 생성된다

아직 미정인 세부 항목:
- OS/하드웨어 정보 조합 후 해시 방식
- Electron/데스크톱 앱 환경에서의 실제 수집 범위

이 부분은 서버 구현 전에 별도 합의가 필요하다.

## 17. 구현 순서 제안

1. 문서 합의
2. 필드명 확정: `deviceId` vs `machineFingerprint`
3. 호환성 전략 확정: 즉시 전환 vs 병행 기간
4. Prisma schema + migration 작성
5. `/license/verify` 라우트 변경
6. admin 응답/화면 변경
7. 테스트 갱신
8. README/docs 정리
9. 로컬 검증

## 18. 구현 전 결정이 필요한 항목

아래는 구현 착수 전에 반드시 결정해야 한다.

1. 서버 표준 필드명을 `deviceId`로 할지 `machineFingerprint`로 할지
2. `deviceId`를 필수값으로 강제할지
3. 구버전 `ipAddr` 클라이언트를 병행 지원할지
4. 기존 `LicenseDevice` 데이터를 유지할지 초기화할지
5. 관리자 화면에서 식별값을 그대로 노출할지 일부 마스킹할지
6. `deviceId` 길이/문자 제약을 둘지

## 19. 현재 권장안

현재 시점의 권장안은 아래와 같다.

- 표준 필드명: `deviceId`
- `/license/verify` 요청: `{ licenseKey, deviceId }`
- DB 컬럼: `LicenseDevice.deviceId`
- 관리자 응답: `deviceIds`
- 서버는 IP fallback 제거
- 기존 IP 데이터는 자동 승격하지 않음
- 운영 환경이면 짧은 병행 기간 후 완전 전환
- 클라이언트는 `installId` 없이 하드웨어/펌웨어/OS 식별값 조합으로 `deviceId` 생성
- 목표 안정성: 앱 업데이트, 앱 재설치, OS 재설치, 네트워크 변경에도 가능한 한 동일한 `deviceId` 유지

## 20. 다음 단계
이 문서를 기준으로 아래를 함께 확정하면 된다.

- 필드명
- 병행 지원 여부
- 기존 데이터 처리 방식
- Electron 클라이언트에서 어떤 소스 값을 읽어 `deviceId`를 만들지

합의가 끝나면 그 다음 단계에서 구현 계획을 코드 변경 단위로 다시 쪼갠다.
