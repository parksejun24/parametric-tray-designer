# 검증 완료 입력 예제

`known-good-rectangle.svg`를 업로드하고 아래 값을 그대로 입력합니다.

- 포켓 수: `3`
- 최소 면적: `300 mm²`
- 최대 면적: `5000 mm²`
- 품질: `Extended`
- 재현 시드: `known-good-rectangle`
- 포켓 사이 웹 폭: `4 mm`
- 외곽 여백: `6 mm`

실제 Chromium UI에서 `VALIDATED`와 DXF/SVG 다운로드 활성화까지 검증했습니다.
다운로드된 DXF를 독립 파싱한 포켓 면적은 약 `4587.07`, `3073.12`, `3064.11 mm²`입니다.

## Vector 1.svg

`Vector 1.svg`에는 물리 단위가 없으므로 업로드 후 `1 도면 단위 = 1 mm`로 배율을 적용합니다.

- 포켓 수: `6`
- 최소 면적: `900 mm²`
- 최대 면적: `10000 mm²`
- 품질: `Extended`
- 재현 시드: `formfield-01`
- 포켓 사이 웹 폭: `4 mm`
- 외곽 여백: `6 mm`

이 조합은 실제 Chromium UI에서 6개 포켓 생성, `VALIDATED`, DXF/SVG 다운로드 활성화까지 검증합니다.

## Ellipse 1.svg

`Ellipse 1.svg`에도 물리 단위가 없으므로 업로드 후 `1 도면 단위 = 1 mm`로 배율을 적용합니다.

- 포켓 수: `6`
- 최소 면적: `900 mm²`
- 최대 면적: `10000 mm²`
- 품질: `Extended`
- 재현 시드: `formfield-01`
- 포켓 사이 웹 폭: `4 mm`
- 외곽 여백: `6 mm`

이 조합은 실제 Chromium UI에서 타원형 외곽의 6개 포켓 생성, `VALIDATED`, DXF/SVG 다운로드 활성화까지 검증합니다.
