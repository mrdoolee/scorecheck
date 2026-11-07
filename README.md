# 몇점 (ScoreCheck) — 성적 확인·서명 데스크톱 앱

교사가 나이스 성적 파일을 가져와 학생에게 PC 화면으로 성적을 보여 주고, 학생이 교사 휴대폰이나 태블릿 PC에 서명하면, 원본 일람표 PDF의 비고칸에 서명을 얹은 새 PDF를 만드는 Windows 앱입니다. 모든 처리는 이 PC와, PC 핫스팟으로 직접 연결한 교사 휴대폰(또는 태블릿 PC) 안에서만 이루어집니다(인터넷·학교망을 거치지 않음).

소개 페이지: [sc-trdoolee.vercel.app](https://sc-trdoolee.vercel.app) · 내려받기: [GitHub Releases 최신 버전](../../releases/latest)

설계 문서: [설계_청사진.md](설계_청사진.md)

## 사용 흐름

앱 화면 왼쪽 아래 **📖 사용 설명**에 같은 내용이 단계별로 있습니다(`src/shared/guide.ts`).

1. **① 성적 입력** — 나이스에서 받은 파일을 이름 그대로 끌어다 놓기. 받는 곳은 「파일 넣기」 화면에도 나옵니다(`src/shared/neis-files.ts`).
   - 정기고사
     - [필수] 교과목별 학생답 정오표: [성적] → [지필평가조회/통계] → [지필평가조회] → [교과목별학생답정오표] → 저장 (XLS Data). 반마다 한 파일
     - [필수] 교과목별 일람표(강의실별): [성적] → [지필평가조회/통계] → [지필평가조회] → [교과목별일람표조회-강의실별] → 저장 (PDF). 반마다 한 파일. 서명을 넣을 원본
     - [선택] 교과목별 일람표(전체학급): [성적] → [지필평가조회/통계] → [지필평가조회] → [교과목별일람표조회-전체학급] → 저장 (XLS Data). 넣으면 학년 평균을 학년 전체로 계산
   - 수행평가
     - [필수] 학급별 일람표(강의실별): [성적] → [수행평가조회/통계] → [수행평가조회] → [학급일람표조회-전체영역] → 저장 (PDF). 반마다 한 파일. 서명을 넣을 원본
     - [필수] 같은 화면에서 저장 (XLS Data). 반마다 한 파일
   - 평가 정보 확인 → 검증 결과 확인 → 작업 만들기
2. **② 성적 확인·서명**
   - [휴대폰 연결] → QR 1로 PC 핫스팟 연결, QR 2로 서명 페이지 열기
   - 안드로이드는 처음 한 번 **설정 → 애플리케이션 → Chrome → 권한 → 근처 기기 → 허용**이 필요합니다 (안 하면 `ERR_TOO_MANY_RETRIES`).
   - 학생 화면 열기 → 이름 아래 원본 일람표 본인 줄(머리글 + 본인 행)과 서명 들어갈 칸, 성적 확인 → [서명하기] → 휴대폰 서명 화면 위쪽에도 같은 본인 줄이 나옴 → 휴대폰에 서명 → PC에 저장
   - 학생 화면 오른쪽 위 버튼: ◀ 이전 학생, ▶ 다음 학생(이미 서명한 학생은 건너뜀), 🔒 교사 화면
   - 정기고사 문항별 결과에는 문항마다 전체 정답률이 함께 나옵니다.
3. **③ PDF 저장** — 반별 미리보기, 미서명 학생 확인, 저장. 파일 이름은 `<작업 이름> <반>반 서명_YYMMDD.pdf`(저장한 날짜)
4. **문항 분석** (교사 전용, 학생 화면에서는 보이지 않음)
   - 정기고사: 시험 요약(분포 그래프), 문항별 정답률·변별도(상·하위 27%)·선택지 분포·매력적인 오답, 반별 비교
   - 수행평가: 영역별 요약(만점자·0점자), 반별 평균, 점수 분포
   - **문항정보 입력 (선택)**: 문항정보표에서 내용영역·성취기준을 한 열씩 복사해 붙여 넣기(한 줄 = 한 문항). 넣으면 내용영역·성취기준별 득점률이 나오고, 학생 화면 문항 칸에 내용영역과 "'○○' 영역을 복습하면 도움이 돼요." 피드백이 붙습니다.
   - xlsx로 내보내기: 학생 이름 없이 집계만 담습니다. 파일 이름 `<작업 이름> 문항 분석_YYMMDD.xlsx`

작업은 직접 지울 때까지 이 PC에 남습니다(자동 삭제 없음). 첫 화면 **이전 작업**에서:

- **서명 삭제** — 받은 서명(과 작업 폴더 안에 만든 서명 PDF)만 지웁니다. 성적·문항정보·원본 파일은 남고 학생은 '서명 대기'로 돌아갑니다. 서명 PDF를 저장한 뒤에 쓰세요.
- **작업 삭제** — 성적·서명·문항정보·원본 사본을 모두 지웁니다.

다른 위치에 저장한 PDF·xlsx와 나이스 원본 다운로드 파일은 앱이 지우지 않습니다.

## 설치

[GitHub Releases](../../releases/latest)에서 `ScoreCheck-Setup-<버전>.exe`를 받아 실행(직접 빌드했다면 `release\` 폴더). 바탕화면·시작 메뉴에 **몇점**으로 설치됩니다. 관리자 권한 없이 현재 사용자에게 설치됩니다.

- 코드 서명이 아직 없어 SmartScreen 경고가 뜰 수 있습니다 ("추가 정보 → 실행").
- 처음 휴대폰을 연결할 때 Windows 방화벽 창이 뜨면 허용해야 합니다.
- 저장 데이터는 모두 암호화됩니다(AES-256-GCM, 키는 Windows DPAPI로 보호). 같은 PC의 같은 Windows 계정에서만 열립니다.
- 제거하면 앱 데이터도 함께 지워집니다. 0.3.0 이하에서 등록된 자동 삭제 예약 작업은 0.4.0을 처음 실행할 때(또는 제거할 때) 지워집니다.

## 개발

```powershell
npm install
node node_modules/electron/install.js   # Electron 실행 파일이 없을 때
npm run dev        # 개발 실행
npm test           # 단위 테스트 (sample_data/ 가 있으면 실제 나이스 샘플로 검증)
npm run typecheck
npm run dist       # 설치 파일 만들기 → release/
```

- `sample_data/`에는 실제 학생 정보가 있으므로 저장소에 올리지 않습니다(`.gitignore`).
- 진단: `ScoreCheck.exe --selftest-pdf <파일.pdf>` → 같은 위치에 비고칸 검출 결과 JSON.
- 환경 진단 도구는 `scripts/phase0/`에 있습니다 (핫스팟, 시험 서버, 패킷 캡처).

## 구조

| 경로 | 내용 |
| --- | --- |
| `src/core/import` | 나이스 파일 판별·파싱 (내용 기반) |
| `src/core/validate` | 나이스 집계와 교차 검증, PDF 명단 검증 |
| `src/core/stats`, `src/core/feedback` | 평균·모표준편차, 규칙 기반 피드백 (석차·백분위 없음) |
| `src/core/item-analysis` | 문항정보 붙여넣기, 문항 분석, 집계 xlsx 행 |
| `src/core/pdf` | 비고칸 검출, 서명 맞춤·합성 |
| `src/main` | Electron 메인: 저장소, 휴대폰 서버, 핫스팟, 작업 스케줄러 |
| `src/renderer` | 교사·학생 화면 (React) |
| `resources/hotspot.ps1` | 모바일 핫스팟 제어 (WinRT) |
| `resources/fonts`, `resources/licenses` | 내장 글꼴과 라이선스 |
| `site/` | 소개(랜딩) 페이지. 정적 HTML, Vercel Root Directory. 저장소 주소는 `site/config.js` 한 곳 |
| `scripts/site/build-privacy.py` | `PRIVACY.md`로 `site/privacy.html`(개인정보 처리 안내 전문) 만들기 |
| `scripts/site/subset-fonts.py` | 페이지 문구를 고친 뒤 웹 글꼴 다시 만들기 (`python -I scripts/site/subset-fonts.py`) |
| `scripts/privacy-scan.ts` | 공개 전 개인정보 검사: git 기록 전체에서 실제 학생 정보 찾기 (`npx tsx scripts/privacy-scan.ts`) |

## 글꼴

학교안심 산뜻돋움 L·M (저작권 KERIS 한국교육학술정보원, 제작 윤디자인). SIL Open Font License 1.1이며, 앱 안에 들어 있어 인터넷 없이 표시됩니다. PC 화면과 휴대폰 서명 화면이 같은 글꼴을 씁니다(휴대폰에는 PC의 서명 서버가 글꼴 파일을 보냅니다). 보통 글자는 L, 굵은 글자는 M입니다.

- 글꼴 파일: `resources/fonts/` (원본 OTF 그대로)
- 라이선스 전문: `resources/licenses/HakgyoansimSantteutdotum-OFL.txt`
- 배포처: [교육저작권지원센터 학교안심폰트](https://copyright.keris.or.kr/wft/fntDwnldView?fntGrpId=GFT202301090000000000001)

## 라이선스

- 코드: MIT (`LICENSE`)
- 글꼴: SIL Open Font License 1.1 (`resources/licenses/`). MIT 적용 대상이 아닙니다.
