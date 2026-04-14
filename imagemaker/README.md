# Image Maker (숫자 이미지 생성)

## 요구사항

- Pillow로 숫자가 **중앙에** 적힌 **흰색 배경** 이미지를 대량 생성
- 기본 생성 범위: **1부터 1000까지**
- 파일명: `image_0001.jpg` 형식(기본 4자리 0패딩, 범위가 커지면 자릿수 자동 증가)
- 출력 폴더: `output/`
- 폰트: **맑은 고딕(Malgun Gothic)** 우선, 없으면 시스템 기본/대체 폰트
- 숫자 색: **검은색**
- **생성 소요 시간 측정**

## 실행 방법

1) Pillow 설치

```bash
python -m pip install Pillow
```

2) 이미지 생성 실행

```bash
python generate_numbers.py
```

실행 후 `output/` 폴더에 결과가 생성되며, 콘솔에 총 소요 시간과 장당 평균 시간이 출력됩니다.

### 1~5000 생성 예시

```bash
python generate_numbers.py --end 5000
```

## 작업기록

- `generate_numbers.py` 작성
  - Windows에서 `C:\Windows\Fonts\malgun.ttf` 등을 우선 사용
  - 폰트가 없으면 대체 폰트(Arial/DejaVuSans) → 최종적으로 Pillow 기본 폰트로 fallback
  - 텍스트는 `textbbox` 기준으로 중앙 정렬
  - 1000장 생성 전체 시간을 `time.perf_counter()`로 측정해 출력

- 실행 확인 (로컬 실행 결과)
  - 1000장 생성 완료: `output/image_0001.jpg` ~ `output/image_1000.jpg`
  - 소요 시간: **13.433초**
  - 장당 평균: **0.013433초**

- 실행 확인 (1~5000)
  - 5000장 생성 완료: `output/image_0001.jpg` ~ `output/image_5000.jpg`
  - 소요 시간: **114.973초**
  - 장당 평균: **0.022995초**

