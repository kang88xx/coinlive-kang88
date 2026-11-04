# coinlive — 코인 시부레

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

## 현재 화면 (2026-11-04)

선택된 시안 A를 `site/index.html`에 적용했습니다. 붉은 객장·황동 장식, 고정된 5칸 시세 표시, 재미있는 벽 문구, 사각형 이름표와 평단 입력 패널을 사용합니다. `site/ui-a.css`가 화면 조작부를 담당합니다. `site/sian-a.html`·`site/sian-b.html`은 원래 제안 시안이며 수정하지 않았습니다. 디자인 기준은 `DESIGN.md`에 있습니다.

`SHOW_HIPSTER = false`로 동네 힙스터를 숨겨 두었습니다. 상단 왼쪽의 코루라이브 나가기 버튼과 만석 안내의 나가기 링크는 뺐습니다.

키보드 동작: Space 점프, Ctrl 권총 발사(섬광·반동·"탕!"·짧은 효과음). 터치 화면에서는 오른쪽 아래 점프·발사 버튼으로 같은 동작을 합니다. 앉기는 의자를 누르면 됩니다. 기존 가격 계산·평단 저장·이동·채팅 연결 방식은 유지합니다.

## 최초 미러에서 바꾼 것

- three.js CDN 스크립트 → `vendor/three.min.js`
- Google Fonts 스타일시트(DotGothic16, IBM Plex Sans KR) → `fonts/fonts.css` + `fonts/files/*.woff2`
- preconnect 링크 2개 제거

최초 미러의 원본은 `source/online.html`에 보관하고, 현재 실행 화면은 위 디자인 변경을 포함합니다.

## 동작 범위와 한계

페이지는 실행 시 아래 서버에 접속합니다.

- `https://api.hyperliquid.xyz/info` (비트코인·이더리움 시세, CORS 허용) — 동작함
- `https://api.korulive.com/anchor` (환율 기준값, CORS 허용) — 동작함
- `https://api.upbit.com/v1/ticker` (업비트 원화 시세) — 동작함. 배포 도메인에는 분당 요청 수 제한이 있어 15초마다 가져옵니다.
- 객장 채팅·캐릭터 동기화 웹소켓 — 원래의 `api.korulive.com` 서버는 다른 출처를 거부하므로, `worker/`의 자체 서버에 접속합니다 (아래).

## 채팅 서버 (`worker/`)

`site/index.html`이 쓰는 객장 프로토콜(hello/tick/full/cx, 상태 차분, 채팅 제한)을 그대로 구현한 서버입니다.

| 파일 | 내용 |
| --- | --- |
| `worker/src/room.js` | 방 로직 (플랫폼 독립). 정원 100명, 주소당 12연결, 채팅은 입장 1분 뒤부터 3초 간격 40자, 같은 말·링크·연락처·욕설 거부, 같은 페이지 키 재접속 시 이전 연결 교체. |
| `worker/src/index.js` | Cloudflare Worker + Durable Object (`GaekjangRoom`, 웹소켓 하이버네이션). 방 번호마다 객체 하나. |
| `worker/bun-server.js` | 같은 Room 클래스를 Bun으로 띄우는 로컬 개발 서버. |
| `worker/wrangler.toml` | 배포 설정. `ALLOWED_ORIGINS`에 허용 출처, `CHAT_WAIT_MS`에 채팅 대기 시간. |

로컬 테스트:

```sh
CHAT_WAIT_MS=0 LOG=1 bun worker/bun-server.js      # ws://127.0.0.1:8787
python3 -m http.server 4200 --directory site
# http://localhost:4200/?ws=ws://127.0.0.1:8787  (?ws= 는 localhost에서만 먹힘)
```

배포 (Cloudflare 계정 필요, 무료 플랜으로 충분):

```sh
cd worker
bun x wrangler@4 login      # 최초 1회, 브라우저 로그인
bun x wrangler@4 deploy     # https://coinlive-chat.<계정>.workers.dev
bun x wrangler@4 secret put SK_SECRET   # 선택: 차단용 발언자 키의 비밀값
```

배포 주소를 `site/index.html`의 `WS_BASE`에 넣으면 됩니다. 채팅 서버가 죽어 있으면 페이지는 10초 뒤 "혼자 보는 중"으로 표시하고 계속 재접속합니다.

## 검증 (2026-11-03, 헤드리스 Chromium 1440×900 / 390×844)

- WebGL 캔버스·three.js r128·3D 객장·LED 전광판·캐릭터 렌더 확인
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
