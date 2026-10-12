"""게임에 쓰인 글자만 남긴 웹폰트를 만들어 css/fonts.css 에 base64로 넣는다.
사용: python3 tools/build_fonts.py <원본 TTF 폴더>
원본: Google Fonts의 Gowun Batang / Gowun Dodum (SIL Open Font License 1.1)
"""
import base64, glob, io, os, sys
from fontTools import subset
from fontTools.ttLib import TTFont

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1]
text = set()
for pat in ['js/*.js', 'index.html', 'css/style.css']:
    for f in glob.glob(os.path.join(root, pat)):
        text.update(open(f, encoding='utf-8').read())
chars = {c for c in text if ord(c) >= 0x20}
chars.update(chr(c) for c in range(0x20, 0x7f))
chars.update('…·—–“”‘’!?.,~()[]0123456789')
unicodes = sorted(ord(c) for c in chars)

faces = [
    ('Gowun Batang', 400, 'GowunBatang-Regular.ttf'),
    ('Gowun Batang', 700, 'GowunBatang-Bold.ttf'),
    ('Gowun Dodum', 400, 'GowunDodum-Regular.ttf'),
]
css = ['/* 생성됨: tools/build_fonts.py — Gowun Batang, Gowun Dodum (SIL OFL 1.1) 부분 집합 */']
for fam, w, fn in faces:
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    font = TTFont(os.path.join(src, fn))
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=unicodes)
    sub.subset(font)
    buf = io.BytesIO()
    font.flavor = 'woff2'
    font.save(buf)
    data = base64.b64encode(buf.getvalue()).decode()
    print(fam, w, len(buf.getvalue()) // 1024, 'KB')
    css.append("@font-face{font-family:'%s';font-weight:%d;font-style:normal;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2');}" % (fam, w, data))
    if fam == 'Gowun Dodum':
        css.append("@font-face{font-family:'%s';font-weight:600;font-style:normal;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2');}" % (fam, data))
open(os.path.join(root, 'css', 'fonts.css'), 'w').write('\n'.join(css) + '\n')
