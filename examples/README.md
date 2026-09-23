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

## 20개 외곽선 테스트 세트

`01-soft-rectangle.svg`부터 `20-starburst.svg`까지는 모두 `240 × 160 mm` 물리 단위를 가진 단일 폐곡선입니다. 아래 공통 설정으로 실제 Chromium UI에서 업로드, 3개 공간 분할, `VALIDATED`, DXF/SVG 내보내기 활성화까지 자동 검증합니다.

- 포켓 수: `3`
- 최소 면적: `100 mm²`
- 최대 면적: `50000 mm²`
- 품질: `Extended`
- 포켓 사이 웹 폭: `4 mm`
- 외곽 여백: `6 mm`
- 재현 시드: 기본값은 `examples-<파일명>`, `07-l-corner.svg`와 `10-deep-v-notch.svg`는 `formfield-01`

| 파일 | 형태 | 주요 검증 특성 |
| --- | --- | --- |
| `01-soft-rectangle.svg` | 둥근 직사각형 | 완만한 볼록 코너 |
| `02-capsule.svg` | 캡슐 | 반원형 양 끝단 |
| `03-wide-ellipse.svg` | 넓은 타원 | 연속 곡률 |
| `04-slanted-trapezoid.svg` | 기울어진 사다리꼴 | 비직교 볼록 모서리 |
| `05-tapered-hexagon.svg` | 테이퍼 육각형 | 비대칭 볼록 다각형 |
| `06-chamfered-octagon.svg` | 모따기 팔각형 | 짧은 대각선 모서리 |
| `07-l-corner.svg` | L자 | 직각 오목 코너 |
| `08-u-channel.svg` | U자 채널 | 깊은 직사각 노치 |
| `09-t-silhouette.svg` | T자 | 양쪽 오목 코너 |
| `10-deep-v-notch.svg` | 깊은 V 노치 | 급격한 오목 각도 |
| `11-double-notch.svg` | 이중 노치 | 반복 오목 코너 |
| `12-wave-top.svg` | 물결 상단 | 베지어 곡선과 직선 혼합 |
| `13-organic-bean.svg` | 유기적 콩 모양 | 자유 곡선 |
| `14-asymmetric-pebble.svg` | 비대칭 조약돌 | 편심 곡률 |
| `15-hourglass.svg` | 모래시계 | 대칭 오목 허리 |
| `16-wide-cross.svg` | 넓은 십자 | 다수의 직각 오목 코너 |
| `17-crescent-bay.svg` | 초승달 만 | 곡선형 오목 영역 |
| `18-kidney-curve.svg` | 콩팥 곡선 | 매끄러운 비대칭 오목부 |
| `19-cog-outline.svg` | 톱니 외곽 | 반복 급각과 짧은 변 |
| `20-starburst.svg` | 별 폭발형 | 고곡률 급각 외곽 |

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
