# 공개 순서

저장소를 공개하고 소개 페이지를 올리는 순서입니다. 모두 직접 하는 단계입니다. 공개는 되돌리기 어려우니 1번이 끝나기 전에는 2번으로 넘어가지 않습니다.

## 1. 개인정보 검사 결과 처리

```powershell
npx tsx scripts/privacy-scan.ts > privacy-scan.txt
```

`sample_data/`(실제 나이스 파일)의 이름·학번·학교 이름·교사 이름이 git 기록 전체(지난 커밋, 지운 파일 포함)와 새로 추가될 파일에 있는지 찾습니다. 결과는 가려서(`김○수`, `2026******`) 나옵니다. 결과 파일은 저장소에 넣지 않습니다.

- `Text hits`가 0이 될 때까지 해당 파일을 고칩니다.
- 지금 파일을 고쳐도 **지난 커밋에는 남아 있습니다.** 기록째 공개하려면 기록을 정리해야 합니다. 가장 간단한 방법은 공개용 저장소를 새로 만들고, 정리된 현재 파일만 첫 커밋으로 올리는 것입니다.
- `Binary or data files` 목록의 그림·파일을 열어 학생 정보가 없는지 눈으로 확인합니다.

## 2. GitHub 공개 저장소 만들고 올리기

GitHub에서 새 저장소(Public)를 만들고 push 합니다.

## 3. 소개 페이지의 저장소 주소 바꾸기

`site/config.js`의 한 줄을 실제 주소로 바꾸고 커밋·push 합니다.

```js
export const REPO = 'https://github.com/<계정>/<저장소>'
```

주소에 `OWNER`가 남아 있는 동안 페이지의 다운로드 버튼은 페이지 안의 「설치와 준비물」로 이동합니다.

## 4. 설치 파일을 Releases에 올리기

```powershell
npm run dist
```

GitHub 저장소 → Releases → Draft a new release → 태그 `v<package.json의 version>` → `release\ScoreCheck-Setup-<버전>.exe` 첨부 → Publish. 페이지의 다운로드 버튼은 항상 최신 Release(`releases/latest`)로 갑니다.

## 5. Vercel 연결

Vercel → Add New → Project → GitHub 저장소 선택 →

- Root Directory: `site`
- Framework Preset: `Other`
- Build Command: 비워 둠, Output Directory: 비워 둠

Deploy. 이후 `main`에 push 하면 자동으로 다시 올라갑니다.

## 6. README에 주소 적기

배포된 주소를 `README.md` 맨 위 「소개 페이지」 자리에 적습니다.

## 페이지 문구를 고칠 때

`site/index.html`을 고친 뒤 글꼴을 다시 만들고 검사를 돌립니다. 새 글자가 글꼴에 없으면 네모(□)로 보입니다. `PRIVACY.md`를 고쳤다면 개인정보 페이지(`site/privacy.html`)부터 다시 만듭니다.

```powershell
python -I scripts/site/build-privacy.py
python -I scripts/site/subset-fonts.py
npx vitest run tests/site.test.ts
```
