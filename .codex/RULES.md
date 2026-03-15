# Coding Rules

AI는 다음 규칙을 준수한다.

## Code Quality

- 명확한 변수명 사용
- 작은 함수 유지
- single responsibility 원칙 유지

## File Size

가능하면

- 300~500 lines 이하 유지

큰 파일은 분리한다.

## Function Size

함수는 가능한

- 30~50 lines 이하

## Reusability

새 코드를 작성하기 전에 반드시 확인한다.

- 기존 util
- helper
- component

## Error Handling

모든 외부 입력은 검증한다.

- API input
- user input
- database input

## Security

다음 사항을 항상 검토한다.

- injection
- unsafe data handling
- secrets exposure

## Side Effects

가능하면

- pure function 사용
- global state 최소화
