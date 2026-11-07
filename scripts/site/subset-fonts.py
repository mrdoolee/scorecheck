"""Subset the app font (학교안심 산뜻돋움 L·M, OFL) to the characters used on the landing page.

Run from the repository root after changing site/index.html:
    python -I scripts/site/subset-fonts.py
Writes site/fonts/charset.txt and site/fonts/santteut-{L,M}.woff2. Needs fontTools and brotli.
"""
import hashlib
import html
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path.cwd()
SITE = ROOT / 'site'
FONTS = ROOT / 'resources' / 'fonts'
OUT = SITE / 'fonts'

# Always included: printable ASCII and a few symbols used in copy and mockups.
EXTRA = ''.join(chr(c) for c in range(0x20, 0x7F)) + '·—–−…→←⇄✓✕○①②③④⑤●“”‘’「」『』%±×'


def page_chars() -> str:
    text = ' '.join(p.read_text(encoding='utf-8') for p in sorted(SITE.glob('*.html')))
    text = re.sub(r'<!--.*?-->', ' ', text, flags=re.S)
    text = re.sub(r'<(script|style)\b.*?</\1>', ' ', text, flags=re.S)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = html.unescape(text)
    return text


def main() -> None:
    chars = sorted(set(page_chars() + EXTRA) - set('\n\r\t'))
    OUT.mkdir(parents=True, exist_ok=True)
    charset = OUT / 'charset.txt'
    charset.write_text(''.join(chars), encoding='utf-8')
    for weight in ('L', 'M'):
        src = FONTS / f'HakgyoansimSantteutdotum{weight}.otf'
        dst = OUT / f'santteut-{weight}.woff2'
        subprocess.run(
            [sys.executable, '-I', '-m', 'fontTools.subset', str(src),
             f'--text-file={charset}', '--flavor=woff2', f'--output-file={dst}',
             '--layout-features=*', '--no-hinting'],
            check=True,
        )
        print(f'{dst.relative_to(ROOT)}: {dst.stat().st_size // 1024} KB')
    print(f'{len(chars)} characters')

    # Characters the font itself lacks fall back to a system font (icons and a few symbols); list them.
    from fontTools.ttLib import TTFont
    cmap = TTFont(OUT / 'santteut-M.woff2').getBestCmap()
    lacking = [c for c in chars if ord(c) not in cmap and not c.isspace()]
    if lacking:
        print('not in the font (system font is used):', ' '.join(f'U+{ord(c):04X}' for c in lacking))

    # New file contents get a new URL, so browsers never keep showing an old subset.
    css = SITE / 'styles.css'
    text = css.read_text(encoding='utf-8')
    for weight in ('L', 'M'):
        name = f'santteut-{weight}.woff2'
        digest = hashlib.sha256((OUT / name).read_bytes()).hexdigest()[:8]
        text = re.sub(rf"fonts/{name}(\?v=[0-9a-f]+)?", f'fonts/{name}?v={digest}', text)
    css.write_text(text, encoding='utf-8')


if __name__ == '__main__':
    main()
