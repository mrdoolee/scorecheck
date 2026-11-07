"""Build site/privacy.html from PRIVACY.md, so the landing page carries the full notice without GitHub.

Run from the repository root whenever PRIVACY.md changes, then rebuild the font subset:
    python -I scripts/site/build-privacy.py
    python -I scripts/site/subset-fonts.py
Handles the Markdown PRIVACY.md uses: # / ## headings, '- ' lists and paragraphs.
"""
import html
from pathlib import Path

ROOT = Path.cwd()
SRC = ROOT / 'PRIVACY.md'
OUT = ROOT / 'site' / 'privacy.html'


def body(md: str) -> str:
    out, para, items = [], [], []

    def flush():
        if para:
            out.append(f'<p>{html.escape(" ".join(para))}</p>')
            para.clear()
        if items:
            out.append('<ul>' + ''.join(f'<li>{html.escape(i)}</li>' for i in items) + '</ul>')
            items.clear()

    for raw in md.splitlines():
        line = raw.strip()
        if not line:
            flush()
        elif line.startswith('## '):
            flush()
            out.append(f'<h2>{html.escape(line[3:])}</h2>')
        elif line.startswith('# '):
            flush()
            out.append(f'<h1>{html.escape(line[2:])}</h1>')
        elif line.startswith('- '):
            if para:
                flush()
            items.append(line[2:])
        else:
            if items:
                flush()
            para.append(line)
    flush()
    return '\n'.join(out)


PAGE = """<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>몇점 개인정보 처리 안내</title>
  <meta name="description" content="몇점(ScoreCheck)이 처리하는 개인정보, 보관과 파기, 휴대폰 서명 연결 방식 안내">
  <meta name="theme-color" content="#fbf8f1">
  <link rel="icon" href="assets/icon.png">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- Generated from PRIVACY.md by scripts/site/build-privacy.py. Edit PRIVACY.md, not this file. -->
  <header class="nav">
    <div class="wrap nav-row">
      <a class="brand" href="index.html"><img src="assets/icon.png" alt="" width="32" height="32"><span>몇점</span></a>
      <a class="btn btn-line btn-sm" href="index.html">소개 페이지로</a>
    </div>
  </header>
  <main class="wrap doc">
{body}
  </main>
</body>
</html>
"""


def main() -> None:
    OUT.write_text(PAGE.replace('{body}', body(SRC.read_text(encoding='utf-8'))), encoding='utf-8')
    print(f'{OUT.relative_to(ROOT)} written')


if __name__ == '__main__':
    main()
