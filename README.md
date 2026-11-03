# coinlive — 코루라이브 객장 미러

https://korulive.com/online/ ("코루라이브 객장", 3D 전광판 객장 페이지)를 2026-11-03에 받아
로컬과 Vercel에서 그대로 실행되도록 만든 사본입니다. 분석 도구로 REA(`morluto/rea`)를
`rea/` 서브모듈로 같이 넣어 두었습니다.

## 폴더

| 경로 | 내용 |
| --- | --- |
| `site/` | 실행용 미러. `index.html` + `vendor/three.min.js`(r128) + `fonts/`(Google Fonts 499개 파일 로컬화). 외부 정적 자원 참조 0건. |
| `source/` | 원본 HTML(`online.html`)과 응답 헤더. 수정하지 않은 스냅샷. |
| `rea/` | [REA: Reverse Engineer Anything](https://github.com/morluto/rea) 소스 서브모듈 (`git submodule update --init`). |
| `vercel.json` | 정적 배포 설정. 빌드 없이 `site/`를 그대로 서빙. |

## 로컬 실행

```sh
python3 -m http.server 4200 --directory site
```

http://localhost:4200

## 원본에서 바꾼 것

- three.js CDN 스크립트 → `vendor/three.min.js`
- Google Fonts 스타일시트(DotGothic16, IBM Plex Sans KR) → `fonts/fonts.css` + `fonts/files/*.woff2`
- preconnect 링크 2개 제거

그 외 HTML, CSS, JS는 한 글자도 바꾸지 않았습니다.

## 동작 범위와 한계

페이지는 실행 시 원본 백엔드에 직접 접속합니다.

- `https://api.hyperliquid.xyz/info` (삼성전자·SK하이닉스 시세, CORS 허용) — 동작함
- `https://api.korulive.com/anchor` (환율·코스피 기준값, CORS 허용) — 동작함
- `wss://api.korulive.com/gaekjang/ws` (객장 채팅·개미 위치 동기화, Cloudflare Durable Object) —
  **korulive.com 이외 출처에서는 핸드셰이크가 거부됩니다.** 그래서 미러에서는 상단 상태가
  "연결 중"에 머물고 채팅 입력이 열리지 않습니다. 이 서버 코드는 공개되어 있지 않아 사본에
  포함할 수 없습니다. 채팅을 살리려면 `rea/`로 프로토콜을 분석해 자체 웹소켓 서버를 만들고
  `?ws=wss://...` 쿼리로 연결해야 합니다. (페이지가 이미 로컬 실행 시 `?ws=` 재지정을 지원합니다.)

## 검증 (2026-11-03, 헤드리스 Chromium 1440×900 / 390×844)

- WebGL 캔버스·three.js r128·3D 객장·LED 전광판·개미 캐릭터 렌더 확인
- DotGothic16, IBM Plex Sans KR 로컬 폰트 로드 확인
- 외부 요청 호스트: `api.hyperliquid.xyz`, `api.korulive.com` 뿐 (CDN·Google Fonts 요청 0건)
- 콘솔 오류: 웹소켓 핸드셰이크 거부 외 0건

## Vercel

- 저장소: https://github.com/kang88xx/coinlive-kang88
- 도메인: `coinlive.kang88.io` (DNS는 이미 Vercel을 가리킴)
- Vercel 대시보드에서 이 저장소를 Import하고 프로젝트 Domains에 `coinlive.kang88.io`를 추가하면 됩니다.
  Root Directory는 비워 두고 `vercel.json`이 `site/`를 서빙합니다.

## 알아둘 것

- 텍스트, 디자인, 로고, 3D 모델 코드는 전부 코루라이브(korulive.com)의 것입니다. 공개 배포 전에 권리 확인이 필요합니다.
- 페이지는 `localStorage`에 닉네임·색상·차단 목록(`gaemi-me`, `gaemi-dev`)을 저장합니다.
