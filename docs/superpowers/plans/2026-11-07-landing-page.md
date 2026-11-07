# 몇점 랜딩 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사가 몇점을 이해하고 내려받게 하는 한 페이지 랜딩 사이트(`site/`)를 앱 모양을 흉내 낸 HTML 목업과 함께 만들고, 저장소 공개 전 개인정보 검토까지 마친다.

**Architecture:** `site/`는 빌드 도구 없는 정적 HTML·CSS·소량 JS. 앱 화면은 이미지가 아니라 HTML·CSS 목업(가짜 값)이고 CSS 애니메이션으로 살짝 움직인다. 문구·링크·글꼴·개인정보 규칙은 vitest 검사로 묶는다. 공개 전 저장소 전체 기록을 실제 학생 정보로 훑는 스캐너를 돌려 사용자에게 보고한다.

**Tech Stack:** HTML·CSS·바닐라 JS, vitest(기존), Python fontTools + brotli(설치 확인됨, 웹 글꼴 subset), `tsx`(신규 dev, 스캐너 실행), 확인용 Edge headless(설치된 것).

**Spec:** `docs/superpowers/specs/2026-11-06-landing-page-design.md`

## Global Constraints

- 실제 학생 정보(`sample_data/`의 이름·학번·점수·서명·실제 학교 이름)는 `site/`, 커밋 어디에도 들어가지 않는다. `sample_data/`는 "겹침 검사"에만 읽고, 실제 값을 화면·로그·커밋 메시지에 출력하지 않는다.
- 목업 가짜 값: 학교 `가온중학교`, 2026학년도 1학기 2학년 `2회고사` `과학`, 주인공 2반 7번 `윤하늘`. 다른 이름이 필요하면 지어낸 이름.
- 문구 고정값(스펙 사용자 결정):
  - 히어로 제목: `성적 확인은 PC로, 서명은 휴대폰으로.` (`PC로`, `휴대폰으로`에 형광펜)
  - 히어로 작은 글씨: `무료 · 관리자 권한 없이 설치 · 앱은 인터넷에 접속하지 않음`
  - 개인정보 핵심 문장: `서명 데이터는 노트북과 서명용 휴대폰 사이에서만 오갑니다.`
  - 핫스팟 안내: `노트북이 학교 Wi-Fi나 유선에 연결된 상태에서 핫스팟을 켭니다. 서명 데이터는 노트북과 휴대폰 사이에서만 오가고, 학교망이나 인터넷으로 나가지 않습니다.`
- 쓰면 안 되는 주장: 아이폰 지원, 고등학교 양식 지원, "모든 학교에서 된다", "관리자 권한 필요 없음"(설치로 한정), 석차·등수·백분위가 나오는 목업.
- 페이지 색: 바탕 `#fbf8f1`, 글씨 `#1d2b4f`, 형광펜 `#ffe27a`, 보조 글씨 `#4b5878`, 선 `#ece4d3`, 다운로드 버튼 남색 바탕 흰 글씨. 목업 속 앱 부분은 앱 색(`src/renderer/src/styles.css`의 `:root` 값).
- 글꼴: 학교안심 산뜻돋움 L(보통)·M(굵게), `site/fonts/`에 자체 포함. 외부 CDN·Google Fonts·추적 스크립트 금지.
- 외부로 나가는 링크는 이것만: GitHub 저장소(설정 상수), `https://www.instagram.com/trdoolee`, `https://blog.naver.com/trdoolee`, `https://copyright.keris.or.kr/wft/fntDwnldView?fntGrpId=GFT202301090000000000001`.
- 저장소 주소는 `site/config.js`의 `REPO` 상수 하나에만. 지금 값 `https://github.com/OWNER/scorecheck`(임시).
- 이용 조건 문구는 `src/renderer/src/components/AppFooter.tsx`의 네 줄 그대로.
- 커밋은 이 계획의 파일만 경로를 지정해서(`git commit -- <paths>`). 공개 저장소 생성, push, Release 업로드, Vercel 연결, 설치 파일 빌드는 사용자가 하거나 사용자가 명시적으로 요청할 때만.

## Review Focus

1. **목업 속 가짜 이름이 실제 학생과 겹침** → Task 1 `real-name guard` 테스트.
2. **휴대폰 너비(360px)에서 가로 스크롤·목업 잘림:** 교사가 링크를 폰으로 열 가능성이 높다 → Task 2 Step 4 확인.
3. **JS가 꺼졌거나 `REPO`가 임시값일 때 다운로드 버튼:** 죽은 링크가 되면 안 된다 → 기본 href `#install`, Task 1 테스트.
4. **문구를 고친 뒤 subset 글꼴에 없는 글자(두부 □)** → Task 1 `charset` 테스트.
5. **움직임에 민감한 사용자:** `prefers-reduced-motion`이면 애니메이션 없이 완성된 그림 → Task 2 테스트.

---

### Task 1: 페이지 뼈대, 문구, 글꼴, 검사

**Files:**
- Create: `site/index.html`, `site/styles.css`, `site/main.js`, `site/config.js`
- Create: `site/fonts/santteut-L.woff2`, `site/fonts/santteut-M.woff2`, `site/fonts/charset.txt`, `site/fonts/OFL.txt`(= `resources/licenses/HakgyoansimSantteutdotum-OFL.txt` 복사)
- Create: `site/assets/icon.png`(= `resources/icon.png`)
- Create: `scripts/site/subset-fonts.py`
- Create: `tests/site.test.ts`

**Interfaces:**
- Produces:
  - `site/config.js` → `export const REPO = 'https://github.com/OWNER/scorecheck'`. `main.js`가 `[data-gh="releases"]`에 `${REPO}/releases/latest`, `[data-gh="repo"]`에 `REPO`, `[data-gh="privacy"]`에 `${REPO}/blob/main/PRIVACY.md`를 넣는다. `REPO`에 `OWNER`가 들어 있으면 그대로 둔다(기본 href `#install`).
  - 섹션 `id`(순서 고정): `top`(히어로), `flow`, `features`, `privacy`, `analysis`, `install`, `faq`. 목업 자리는 `<div class="mock" data-mock="hero|step-import|step-sign|step-pdf|hotspot|analysis">` — Task 2가 채운다. 이 작업에서는 빈 자리(높이만 잡힌 상자).

- [ ] **Step 1: 실패하는 테스트 작성 — `tests/site.test.ts`**

```ts
it('has the fixed copy', () => {
  for (const s of ['성적 확인은', '서명은', '무료 · 관리자 권한 없이 설치 · 앱은 인터넷에 접속하지 않음',
    '서명 데이터는 노트북과 서명용 휴대폰 사이에서만 오갑니다.',
    '노트북이 학교 Wi-Fi나 유선에 연결된 상태에서 핫스팟을 켭니다.'])
    expect(text).toContain(s)
})
it('makes no forbidden claims', () => {
  for (const s of ['아이폰 지원', '관리자 권한 필요 없음', '모든 학교에서', '석차:', '등수:', '백분위:']) expect(text).not.toContain(s)
})
it('has sections in order', () => expect(ids).toEqual(['top', 'flow', 'features', 'privacy', 'analysis', 'install', 'faq']))
it('loads nothing from outside', () => {
  // every src= and <link href> is a relative path that exists under site/
  // every absolute href is in the Global Constraints allowlist; GitHub URLs appear only in config.js
})
it('download links work without JS', () => {
  // every [data-gh] element has href="#install" in the HTML
})
it('subset font covers every character on the page', () => {
  // every non-ASCII char in index.html text is in site/fonts/charset.txt
})
it.skipIf(!hasSample)('real-name guard: no real student name in site/', () => {
  // real names from every sample_data xlsx via importFiles + readGrid; search all site/ text files; print only the count
  expect(hits).toBe(0)
})
```

Run: `npx vitest run tests/site.test.ts`
Expected: FAIL (`site/index.html` 없음)

- [ ] **Step 2: `index.html` + `styles.css` + `main.js` + `config.js` 작성**

섹션 내용·순서는 스펙 4절, 사실 제약은 스펙 5절. 결정 사항: `lang="ko"`, viewport 메타, `<title>몇점 — 성적 확인은 PC로, 서명은 휴대폰으로</title>`, description·og 메타(og 이미지는 `assets/icon.png`). 형광펜은 `background: linear-gradient(transparent 60%, #ffe27a 60%)`. 상단 메뉴 `position: sticky`, 폭 720px 미만에서는 메뉴 링크를 숨기고 [다운로드]만. 섹션 등장은 `IntersectionObserver`로 살짝 떠오르기. FAQ는 `<details>`. 히어로 버튼 [사용 흐름 보기]는 `#flow`.

설치 섹션: 준비물(Windows 노트북·PC, 무선랜, 안드로이드 + 크롬), 핫스팟 안내 고정 문장, 무선랜이 없으면 PC 화면 서명으로 대신 가능, 크롬 권한 경로 `설정 → 애플리케이션 → Chrome → 권한 → 근처 기기 → 허용`, SmartScreen `추가 정보 → 실행`, 처음 연결 때 방화벽 허용, [다운로드].

FAQ 답 고정 사실: 업무망 — "업무망에 연결된 학교 노트북에서 확인했습니다. 학교마다 무선·핫스팟 정책이 달라 안 될 수 있습니다." / 아이폰 — "안드로이드 크롬에서 확인했고, 아이폰은 아직 확인하지 못했습니다." / 양식 — "중학교 나이스 정기고사 교과목별 일람표·수행평가 강의실별 일람표로 확인했습니다. 고등학교 양식은 아직 확인 전입니다." / 폰 연결 안 됨 — `ERR_TOO_MANY_RETRIES`면 근처 기기 권한 / 방화벽 / 저장·삭제 — `PRIVACY.md` 3절 요약 / 석차 — 앱은 석차·등수·백분위를 만들지 않음.

푸터: `제작 두리쌤`, 이용 조건 네 줄, Instagram·블로그 링크, 개인정보 처리 안내(`data-gh="privacy"`), GitHub(`data-gh="repo"`), `글꼴: 학교안심 산뜻돋움 (KERIS, SIL OFL 1.1)` + `fonts/OFL.txt` + 배포처 링크.

- [ ] **Step 3: 글꼴 subset — `scripts/site/subset-fonts.py`**

`site/index.html`의 글자 + ASCII 인쇄 가능 문자 + 목업에 쓸 숫자·기호로 `site/fonts/charset.txt`를 쓰고 `pyftsubset resources/fonts/HakgyoansimSantteutdotum{L,M}.otf --text-file=site/fonts/charset.txt --flavor=woff2 --output-file=site/fonts/santteut-{L,M}.woff2`. `@font-face`는 앱처럼 L = weight 100–450, M = 451–900, `font-display: swap`.

Run: `python -I scripts/site/subset-fonts.py`
Expected: woff2 두 개, 각각 200KB 미만

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/site.test.ts && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "Landing page skeleton in site/: copy, sections, bundled font, checks" -- site scripts/site tests/site.test.ts
```

---

### Task 2: 앱 화면 목업과 움직임

**Files:**
- Modify: `site/index.html` — `data-mock` 자리 채우기
- Create: `site/mock.css` — 목업 전용 스타일(앱 색 토큰을 `.mock` 안에서만 정의)
- Modify: `tests/site.test.ts`

**Interfaces:**
- Consumes: Task 1의 `data-mock` 자리, `charset.txt`(목업 글자가 늘면 Task 1 Step 3 다시)

참고할 앱 화면(모양만): `src/renderer/src/screens/StudentView.tsx`(학생 화면: 이름, 본인 일람표 줄, 점수·평균과 차이, 문항별 결과, 한 줄 피드백, [서명하기]), `src/main/phone-page.ts`(폰 서명 화면: 위쪽 본인 줄, 서명 칸, 저장 버튼), `src/renderer/src/screens/ImportScreen.tsx`(파일 끌어다 놓기, 검증 결과), `src/renderer/src/screens/PdfScreen.tsx`, `src/renderer/src/screens/AnalysisScreen.tsx`, `src/renderer/src/styles.css`.

목업별 결정:
- `hero`: 노트북 틀 안 학생 화면(윤하늘, 2반 7번, 과학 86.4점, 학급 평균과 +12.1 같은 차이 표시, 문항 칸 몇 개 맞음/틀림, 한 줄 피드백, [서명하기]) + 오른쪽 아래에 폰 틀(위쪽 본인 줄, 서명 칸). 폰 서명은 SVG path의 `stroke-dashoffset` 애니메이션으로 그려진다. 6초 주기, 사이에 2초 멈춤.
- `step-import`: 파일 아이콘 3개가 상자 안으로 떨어지고 "검증 통과 ✓" 줄이 나타난다.
- `step-sign`: 작은 학생 화면 → 폰 화살표 → 서명.
- `step-pdf`: 일람표 표 모양(가짜 행 5~6개, 맨 오른쪽 `비고` 열) 비고칸에 서명이 차례로 나타난다.
- `hotspot`: 인라인 SVG. 노트북 ⇄ (핫스팟 WPA2) ⇄ 휴대폰 사이 점선이 흐르고, 바깥에 `학교망` `인터넷` `서버`가 ✕ 표시와 함께 연결되지 않은 모습.
- `analysis`: 문항별 정답률 막대 8~10개(가짜 값), 하나에 "매력적인 오답 ③" 꼬리표. 학생 이름 없음.
- QR 모양이 필요하면 무작위 사각형 무늬(실제 QR 아님).
- 모든 애니메이션은 CSS만. `@media (prefers-reduced-motion: reduce)`에서 `animation: none`이고 완성된 상태(서명 다 그려짐)로 보인다.
- 목업은 `aria-hidden="true"`이고 옆 글이 내용을 설명한다.

- [ ] **Step 1: 테스트 추가 — `tests/site.test.ts`**

```ts
it('fills every mock slot', () => {
  for (const m of ['hero', 'step-import', 'step-sign', 'step-pdf', 'hotspot', 'analysis'])
    expect(mockHtml(m).trim().length).toBeGreaterThan(200)
})
it('turns animation off for reduced motion', () => {
  expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[^}]*\{[^]*animation:\s*none/)
})
it('mock names are the fixed fake ones', () => expect(text).toContain('윤하늘'))
```

Run: `npx vitest run tests/site.test.ts` → 새 테스트 FAIL

- [ ] **Step 2: `mock.css` + 목업 HTML 작성**

- [ ] **Step 3: 글자 늘었으면 subset 다시, 테스트 통과**

Run: `python -I scripts/site/subset-fonts.py && npx vitest run tests/site.test.ts`
Expected: PASS

- [ ] **Step 4: 눈으로 확인**

Run: `python -m http.server 5050 -d site`(백그라운드) 후
`"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --hide-scrollbars --window-size=1440,4000 --screenshot=<scratchpad>\desk.png http://localhost:5050/` 와 `--window-size=360,6000 --screenshot=<scratchpad>\phone.png` 로 찍어 Read로 본다.
Expected: 360px에서 목업이 잘리지 않고 가로 스크롤 없음, 글꼴이 학교안심 산뜻돋움, 두부 글자 없음, 앱처럼 보이는 목업.

- [ ] **Step 5: 사용자에게 보여 주기**

두 스크린숏 경로와 로컬 주소(`http://localhost:5050/`)를 알려 주고 문구·목업 피드백을 받는다. 고친 뒤 Step 3·4 다시.

- [ ] **Step 6: Commit**

```bash
git commit -m "Landing page: animated HTML mockups of the student screen, phone signing, PDF, hotspot" -- site tests/site.test.ts
```

---

### Task 3: 공개 전 개인정보 검토

**Files:**
- Create: `scripts/privacy-scan.ts`
- Modify: `package.json` — devDependency `tsx`
- Output (커밋 안 함): scratchpad의 보고서

**Interfaces:**
- Consumes: `sample_data/`(로컬에만), 저장소 전체 git 기록, `src/core/import`의 `readGrid`·`importFiles`
- Produces: `npx tsx scripts/privacy-scan.ts` → 표준 출력에 종류별 건수와 위치. 실제 값은 가려서(`김○수`, 학번은 앞 4자리만)

- [ ] **Step 1: 검사어 목록 (메모리 안에서만)**

`sample_data/`의 모든 xlsx를 읽어 이름, 학번, 제목 줄의 학교 이름(`…중학교`)을 모은다.

- [ ] **Step 2: 훑기**

대상: `git log --all -p --text`(모든 커밋 diff, 삭제된 파일 포함), 현재 추적 파일 + 공개 때 추가될 미추적 파일(`git status`의 `??`, 예 `.dorms-check/`, `font/`), `git log --all --name-only`의 바이너리(xlsx·pdf·png·jpg·캡처 파일) 목록, 무시 폴더(`sample_data/`, `scripts/phase0/out/`)가 과거에 커밋된 적 있는지.

- [ ] **Step 3: 실행 후 보고하고 멈춤**

Run: `npx tsx scripts/privacy-scan.ts > <scratchpad>/privacy-scan.txt`
걸린 위치(커밋 해시·파일·줄)와 종류를 사용자에게 요약하고 **멈춘다**. 처리(파일 수정, 기록 다시 쓰기, 파일 제외)는 사용자가 정한다. 기록 다시 쓰기는 사용자 승인 없이 하지 않는다.

- [ ] **Step 4: Commit (스캐너만)**

```bash
git commit -m "Privacy scan: check the whole git history for real student data before going public" -- scripts/privacy-scan.ts package.json package-lock.json
```

---

### Task 4: 공개 준비 문서

**Files:**
- Modify: `README.md` — 맨 위에 랜딩 페이지 주소 자리, "설치" 절에 Releases 링크 자리
- Create: `docs/publishing.md`

`docs/publishing.md`(순서 고정):
1. Task 3 보고서 처리 완료 확인
2. GitHub에 공개 저장소 만들고 push
3. `site/config.js`의 `REPO`를 실제 주소로 바꾸고 커밋·push
4. 설치 파일 빌드(`npm run dist`) → GitHub Release `v0.8.0` 만들고 `release/ScoreCheck-Setup-0.8.0.exe` 첨부
5. Vercel: New Project → 이 저장소 → Root Directory `site` → Framework `Other`, Build Command 없음 → Deploy
6. 배포 주소를 README 맨 위에 적기

- [ ] **Step 1: 작성 후 Commit**

```bash
git commit -m "Publishing checklist for GitHub, Releases and Vercel" -- README.md docs/publishing.md
```

에이전트는 2~6번을 실행하지 않는다. 사용자가 요청하면 그때 한 단계씩.
