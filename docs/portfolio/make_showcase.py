"""Generates the PatungIn portfolio / LinkedIn showcase images (1800x1200).

Run from the project root:
    python docs/portfolio/make_showcase.py

Inputs: app screenshots in docs/portfolio/screens (made from demo data).
Design helpers adapted from the Stash showcase generator.
Needs Pillow (numpy optional) and the Material Icons font that ships with the
Flutter SDK (paths in ICON_OTF / CODEPOINTS below).
"""
import argparse
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

try:
    import numpy as np
except ImportError:  # gradients fall back to a slower path
    np = None

W, H = 1800, 1200
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FONT_DIR = os.path.join(ROOT, "public", "assets", "fonts")
OUT = os.path.dirname(os.path.abspath(__file__))
ICON_OTF = r"C:\Flutter\flutter\bin\cache\artifacts\material_fonts\materialicons-regular.otf"
CODEPOINTS = r"C:\Flutter\flutter\bin\cache\artifacts\material_fonts\codepoints"

# ---- tokens (Stash design system, same as public/css/finance.css) ---------------------------------
PRIMARY = (0, 127, 136)
PRIMARY_DARK = (7, 95, 104)
TINT = (226, 248, 245)
ACCENT = (36, 185, 180)
EXPENSE = (226, 75, 75)
INCOME = (11, 157, 112)
TRANSFER = (52, 120, 229)
TEXT = (16, 42, 50)
MUTED = (100, 122, 128)
BORDER = (220, 231, 233)
PAGE = (244, 248, 249)
WHITE = (255, 255, 255)
HERO_STOPS = [(7, 63, 73), (8, 108, 115), (0, 152, 154)]
CTA_STOPS = [(0, 127, 136), (0, 166, 166)]

_W = {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold"}
_fcache = {}


def font(weight, size):
    key = (weight, size)
    if key not in _fcache:
        _fcache[key] = ImageFont.truetype(os.path.join(FONT_DIR, f"PlusJakartaSans-{_W[weight]}.ttf"), size)
    return _fcache[key]


_codes = {}
for line in open(CODEPOINTS, encoding="utf-8"):
    parts = line.split()
    if len(parts) == 2:
        _codes[parts[0]] = int(parts[1], 16)
_icache = {}


def icon_font(size):
    if size not in _icache:
        _icache[size] = ImageFont.truetype(ICON_OTF, size)
    return _icache[size]


def draw_icon(d, name, cx, cy, size, fill):
    code = _codes.get(name + "_baseline", _codes.get(name))
    if code is None:
        raise KeyError(name)
    d.text((cx, cy), chr(code), font=icon_font(size), fill=fill, anchor="mm")


# ---- drawing helpers --------------------------------------------------------
def gradient(w, h, stops, angle=125):
    """Linear gradient; angle in CSS degrees."""
    a = math.radians(angle)
    dx, dy = math.sin(a), -math.cos(a)
    if np is not None:
        ys, xs = np.mgrid[0:h, 0:w]
        proj = (xs - w / 2) * dx + (ys - h / 2) * dy
        span = abs(w * dx) / 2 + abs(h * dy) / 2
        t = np.clip((proj / (2 * span)) + 0.5, 0, 1)
        n = len(stops) - 1
        seg = np.minimum((t * n).astype(int), n - 1)
        local = t * n - seg
        out = np.zeros((h, w, 3), dtype=np.float32)
        for i in range(n):
            m = seg == i
            for c in range(3):
                out[..., c][m] = stops[i][c] + (stops[i + 1][c] - stops[i][c]) * local[m]
        return Image.fromarray(out.astype("uint8"), "RGB")
    img = Image.new("RGB", (w, h))
    px = img.load()
    span = abs(w * dx) / 2 + abs(h * dy) / 2
    n = len(stops) - 1
    for y in range(h):
        for x in range(w):
            t = max(0, min(1, ((x - w / 2) * dx + (y - h / 2) * dy) / (2 * span) + 0.5))
            i = min(int(t * n), n - 1)
            f = t * n - i
            px[x, y] = tuple(int(stops[i][c] + (stops[i + 1][c] - stops[i][c]) * f) for c in range(3))
    return img


def rounded_mask(size, radius, ss=4):
    w, h = size
    m = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w * ss - 1, h * ss - 1], radius=radius * ss, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def rrect(base, box, radius, fill=None, gradient_img=None, shadow=None, outline=None, width=2):
    """Anti-aliased rounded rectangle on an RGBA base. shadow=(blur, dy, alpha)."""
    x0, y0, x1, y1 = [int(v) for v in box]
    w, h = x1 - x0, y1 - y0
    mask = rounded_mask((w, h), radius)
    if shadow:
        blur, dy, alpha = shadow
        sh = Image.new("RGBA", (w + blur * 4, h + blur * 4), (0, 0, 0, 0))
        sm = Image.new("L", sh.size, 0)
        sm.paste(mask.point(lambda v: int(v * alpha / 255)), (blur * 2, blur * 2))
        sm = sm.filter(ImageFilter.GaussianBlur(blur))
        sh.putalpha(sm)
        base.alpha_composite(sh, (x0 - blur * 2, y0 - blur * 2 + dy))
    layer = gradient_img if gradient_img is not None else Image.new("RGB", (w, h), fill or WHITE)
    base.paste(layer.convert("RGB"), (x0, y0), mask)
    if outline:
        d = ImageDraw.Draw(base)
        d.rounded_rectangle([x0, y0, x1 - 1, y1 - 1], radius=radius, outline=outline, width=width)


def text_size(s, f):
    l, t, r, b = f.getbbox(s)
    return r - l, b - t


def wrap(s, f, max_w):
    words, lines, cur = s.split(), [], ""
    for w_ in words:
        trial = (cur + " " + w_).strip()
        if f.getlength(trial) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w_
    if cur:
        lines.append(cur)
    return lines


def draw_text(d, xy, s, f, fill, anchor="la", line_gap=1.25, max_w=None):
    x, y = xy
    lines = wrap(s, f, max_w) if max_w else s.split("\n")
    for ln in lines:
        d.text((x, y), ln, font=f, fill=fill, anchor=anchor)
        y += int(f.size * line_gap)
    return y


def chip(base, x, y, label, f, fg, bg, pad_x=28, pad_y=14, outline=None, icon=None, icon_color=None):
    d = ImageDraw.Draw(base)
    iw = 0
    if icon:
        iw = f.size + 10
    w = int(f.getlength(label)) + pad_x * 2 + iw
    h = f.size + pad_y * 2
    rrect(base, (x, y, x + w, y + h), h // 2, fill=bg, outline=outline)
    d = ImageDraw.Draw(base)
    tx = x + pad_x
    if icon:
        draw_icon(d, icon, tx + f.size * 0.5, y + h / 2, int(f.size * 1.15), icon_color or fg)
        tx += iw
    d.text((tx, y + h / 2), label, font=f, fill=fg, anchor="lm")
    return w, h


# ---- phone mockup ------------------------------------------------------------
def load_shot(shots, name):
    """Web screenshots have no status bar: add one (page colour) so the camera hole sits clear of the header."""
    im = Image.open(os.path.join(shots, name + ".png")).convert("RGB")
    if im.width >= im.height:
        return im
    band = int(im.height * 0.04)
    out = Image.new("RGB", im.size, im.getpixel((4, 4)))
    out.paste(im.crop((0, 0, im.width, im.height - band)), (0, band))
    return out


def make_phone(shot, width):
    ss = 3
    bez = max(8, int(width * 0.03))
    inner_w = width - 2 * bez
    inner_h = int(inner_w * shot.height / shot.width)
    height = inner_h + 2 * bez
    big = Image.new("RGBA", (width * ss, height * ss), (0, 0, 0, 0))
    bd = ImageDraw.Draw(big)
    bd.rounded_rectangle([0, 0, width * ss - 1, height * ss - 1], radius=int(width * 0.16 * ss), fill=(15, 35, 41, 255))
    scr = shot.resize((inner_w * ss, inner_h * ss), Image.LANCZOS)
    smask = Image.new("L", scr.size, 0)
    ImageDraw.Draw(smask).rounded_rectangle([0, 0, scr.width - 1, scr.height - 1], radius=int(width * 0.125 * ss), fill=255)
    big.paste(scr, (bez * ss, bez * ss), smask)
    # camera punch-hole
    cx, cy, r = width * ss // 2, (bez + int(inner_w * 0.045)) * ss, int(width * 0.017 * ss)
    bd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(15, 35, 41, 255))
    return big.resize((width, height), Image.LANCZOS)


def place(base, img, x, y, angle=0, shadow=(36, 34, 110)):
    """Paste an RGBA image with a soft drop shadow (blur, dy, alpha) and optional rotation."""
    if angle:
        img = img.rotate(angle, resample=Image.BICUBIC, expand=True)
    if shadow:
        blur, dy, alpha = shadow
        sh = Image.new("RGBA", (img.width + blur * 4, img.height + blur * 4), (0, 0, 0, 0))
        a = img.split()[3].point(lambda v: int(v * alpha / 255))
        layer = Image.new("L", sh.size, 0)
        layer.paste(a, (blur * 2, blur * 2))
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
        sh.putalpha(layer)
        sh = Image.composite(Image.new("RGBA", sh.size, (3, 68, 76, 255)), sh, layer)
        sh.putalpha(layer)
        base.alpha_composite(sh, (int(x - blur * 2), int(y - blur * 2 + dy)))
    base.alpha_composite(img, (int(x), int(y)))
    return img.size


# ---- backgrounds & chrome ---------------------------------------------------
def soft_background():
    bg = gradient(W, H, [(255, 255, 255), (240, 248, 248), (226, 246, 244)], angle=160).convert("RGBA")
    blobs = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blobs)
    bd.ellipse([1050, -250, 1950, 650], fill=(36, 185, 180, 60))
    bd.ellipse([-300, 700, 500, 1500], fill=(0, 127, 136, 40))
    bd.ellipse([700, 400, 1000, 700], fill=(36, 185, 180, 28))
    blobs = blobs.filter(ImageFilter.GaussianBlur(70))
    bg.alpha_composite(blobs)
    return bg


def logo(size):
    ic = Image.open(os.path.join(ROOT, "public", "icons", "icon-512.png")).convert("RGBA").resize((size, size), Image.LANCZOS)
    m = rounded_mask((size, size), int(size * 0.23))
    ic.putalpha(m)
    return ic


def chrome(base, tag="Split Bill & Finance"):
    d = ImageDraw.Draw(base)
    base.alpha_composite(logo(56), (110, 70))
    d.text((184, 98), "PatungIn", font=font(800, 36), fill=TEXT, anchor="lm")
    if tag:
        tw = int(font(600, 22).getlength(tag)) + 44
        rrect(base, (W - 110 - tw, 76, W - 110, 122), 23, fill=WHITE, outline=BORDER)
        ImageDraw.Draw(base).text((W - 110 - tw / 2, 99), tag, font=font(600, 22), fill=PRIMARY_DARK, anchor="mm")


def eyebrow(d, x, y, s):
    d.text((x, y), s.upper(), font=font(800, 24), fill=PRIMARY, anchor="la")


def save(img, name):
    import time
    path = os.path.join(OUT, name)
    tmp = path + ".tmp.png"
    img.convert("RGB").save(tmp, optimize=True)
    for attempt in range(20):  # the target can be briefly locked by a previewer on Windows
        try:
            os.replace(tmp, path)
            break
        except OSError:
            time.sleep(0.5)
    else:
        raise OSError(f"could not write {path} (file in use?)")
    print("saved", name, os.path.getsize(path) // 1024, "KB")




# ---- extra helpers ------------------------------------------------------------
def browser_frame(shot, width):
    """Desktop screenshot inside a simple browser window."""
    bar = int(width * 0.04)
    inner_h = int(width * shot.height / shot.width)
    img = Image.new("RGBA", (width, inner_h + bar), (0, 0, 0, 0))
    mask = rounded_mask(img.size, int(width * 0.018))
    body = Image.new("RGB", img.size, (233, 240, 241))
    body.paste(shot.resize((width, inner_h), Image.LANCZOS), (0, bar))
    d = ImageDraw.Draw(body)
    for i, col in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        cx = int(bar * 0.7) + i * int(bar * 0.62)
        r = int(bar * 0.17)
        d.ellipse([cx - r, bar // 2 - r, cx + r, bar // 2 + r], fill=col)
    ux = int(bar * 2.8)
    d.rounded_rectangle([ux, int(bar * 0.22), int(width * 0.55), int(bar * 0.78)], radius=int(bar * 0.28), fill=WHITE)
    d.text((ux + int(bar * 0.4), bar // 2), "patungin / finance", font=font(500, max(10, int(bar * 0.36))), fill=MUTED, anchor="lm")
    img.paste(body, (0, 0), mask)
    return img


def bubble(base, x, y, text_lines, mine, width=560, f=None):
    """Chat bubble. text_lines: list of (text, weight)."""
    f = f or 24
    lh = int(f * 1.45)
    h = 32 + lh * len(text_lines)
    bg = (220, 244, 240) if mine else WHITE
    x0 = x if not mine else x - width
    rrect(base, (x0, y, x0 + width, y + h), 26, fill=bg, shadow=(12, 6, 26), outline=None if mine else (232, 240, 241))
    d = ImageDraw.Draw(base)
    ty = y + 18
    for t, wt in text_lines:
        d.text((x0 + 26, ty), t, font=font(wt, f), fill=TEXT, anchor="la")
        ty += lh
    return h


def numbered(d, x, y, n, label, sub=None):
    d.ellipse([x, y, x + 56, y + 56], fill=PRIMARY)
    d.text((x + 28, y + 28), str(n), font=font(800, 28), fill=WHITE, anchor="mm")
    d.text((x + 80, y + (14 if sub else 28)), label, font=font(700, 29), fill=TEXT, anchor="lm" if not sub else "la")
    if sub:
        d.text((x + 80, y + 52), sub, font=font(500, 23), fill=MUTED, anchor="la")


# ============================ slides ==========================================
def slide_cover(S):
    """Dark, centred cover: title on top, two phones rising from the bottom edge."""
    extra = 600  # draw on a taller canvas so phones can run off the bottom, then crop
    base = gradient(W, H + extra, [(5, 46, 54), (7, 78, 86), (0, 128, 132)], angle=165).convert("RGBA")
    glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W // 2 - 620, 560, W // 2 + 620, 1500], fill=(36, 185, 180, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    base.alpha_composite(glow)

    d = ImageDraw.Draw(base)
    # brand row
    lg = 64
    name_f = font(800, 34)
    row_w = lg + 18 + int(name_f.getlength("PatungIn"))
    x0 = (W - row_w) // 2
    base.alpha_composite(logo(lg), (x0, 86))
    d.text((x0 + lg + 18, 86 + lg // 2), "PatungIn", font=name_f, fill=WHITE, anchor="lm")

    d.text((W // 2, 270), "Split bill & catat keuangan", font=font(800, 76), fill=WHITE, anchor="mm")
    d.text((W // 2, 352), "Foto struk, bagi adil, semua tercatat.", font=font(500, 34), fill=(176, 226, 222), anchor="mm")

    # stack chips, centred
    labels = ["Node.js", "Express", "SQLite", "Gemini API", "WhatsApp Bot", "PWA"]
    f = font(700, 22)
    widths = [int(f.getlength(t)) + 44 for t in labels]
    gap = 12
    cx = (W - (sum(widths) + gap * (len(labels) - 1))) // 2
    for t, w_ in zip(labels, widths):
        chip(base, cx, 412, t, f, (214, 244, 240), (18, 96, 104), pad_x=22, pad_y=10)
        cx += w_ + gap

    # phones
    left = make_phone(S["split_step4"], 400)
    right = make_phone(S["fin_home"], 400)
    shadow = (40, 30, 150)
    place(base, left, W // 2 - 440, 560, angle=6, shadow=shadow)
    place(base, right, W // 2 + 20, 540, angle=-6, shadow=shadow)

    save(base.crop((0, 0, W, H)), "01-cover.png")


def slide_features(S):
    """Two panels: the split bill side (light) and the finance side (dark)."""
    base = Image.new("RGBA", (W, H), PAGE + (255,))
    chrome(base)
    d = ImageDraw.Draw(base)
    eyebrow(d, 110, 175, "Fitur utama")
    d.text((110, 215), "Dua kebutuhan, satu aplikasi", font=font(800, 62), fill=TEXT, anchor="la")

    panels = [
        ("receipt_long", "Split Bill", "Untuk patungan bareng teman", False, [
            ("document_scanner", "Scan struk dengan AI", "Gemini membaca menu, harga, pajak, dan diskon."),
            ("balance", "Bagi yang adil", "Pajak & service dibagi sesuai pesanan tiap orang."),
            ("groups", "Langsung ke grup", "/hitungin di grup WhatsApp, rincian siap dikirim."),
        ]),
        ("account_balance_wallet", "Finance Tracker", "Untuk catatan keuangan pribadi", True, [
            ("chat", "Catat dari mana saja", "Web, chat WhatsApp, voice note, atau Siri."),
            ("swap_horiz", "Multi-dompet", "Bank, e-wallet, tunai, dan transfer antar dompet."),
            ("pie_chart", "Analitik & integrasi", "Donut kategori, tren 6 bulan, Google Sheets, CSV."),
        ]),
    ]
    pw, ph_, gap, y0 = 775, 735, 30, 345
    for i, (hic, title, sub, dark, rows) in enumerate(panels):
        x = 110 + i * (pw + gap)
        if dark:
            rrect(base, (x, y0, x + pw, y0 + ph_), 36, gradient_img=gradient(pw, ph_, HERO_STOPS, 125), shadow=(30, 18, 70))
            fg, mut, tint, ic_col, line = WHITE, (184, 222, 222), (255, 255, 255), WHITE, (255, 255, 255, 40)
        else:
            rrect(base, (x, y0, x + pw, y0 + ph_), 36, fill=WHITE, shadow=(26, 14, 38), outline=(232, 240, 241))
            fg, mut, tint, ic_col, line = TEXT, MUTED, TINT, PRIMARY, BORDER + (255,)
        d = ImageDraw.Draw(base)
        # header
        hx, hy = x + 48, y0 + 48
        if dark:
            ov = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
            ImageDraw.Draw(ov).rounded_rectangle([0, 0, 95, 95], radius=28, fill=(255, 255, 255, 38))
            base.alpha_composite(ov, (hx, hy))
            d = ImageDraw.Draw(base)
        else:
            d.rounded_rectangle([hx, hy, hx + 96, hy + 96], radius=28, fill=tint)
        draw_icon(d, hic, hx + 48, hy + 48, 54, ic_col)
        d.text((hx + 124, hy + 30), title, font=font(800, 42), fill=fg, anchor="lm")
        d.text((hx + 124, hy + 74), sub, font=font(500, 25), fill=mut, anchor="lm")

        # rows
        ry = y0 + 200
        for j, (ic, t1, t2) in enumerate(rows):
            lay = Image.new("RGBA", base.size, (0, 0, 0, 0))
            ImageDraw.Draw(lay).line([(x + 48, ry), (x + pw - 48, ry)], fill=line, width=2)
            base.alpha_composite(lay)
            d = ImageDraw.Draw(base)
            cy = ry + 88
            draw_icon(d, ic, x + 48 + 26, cy, 44, (107, 227, 208) if dark else PRIMARY)
            d.text((x + 120, cy - 22), t1, font=font(800, 31), fill=fg, anchor="lm")
            d.text((x + 120, cy + 22), t2, font=font(500, 24), fill=mut, anchor="lm")
            ry += 176
    save(base, "02-fitur-utama.png")


def slide_split(S):
    base = soft_background()
    chrome(base)
    d = ImageDraw.Draw(base)
    eyebrow(d, 110, 175, "Fitur 01 · Split bill")
    d.text((110, 215), "Foto struk, bagi rata yang adil", font=font(800, 62), fill=TEXT, anchor="la")
    steps = [("split_step1", "Upload struk", "Satu atau beberapa foto"),
             ("split_step2", "Cek hasil AI", "Menu, pajak & diskon"),
             ("split_step3", "Bagi pesanan", "Pilih siapa makan apa"),
             ("split_step4", "Rincian final", "Kirim ke grup WhatsApp")]
    pw, gap = 330, 86
    x0 = (W - (pw * 4 + gap * 3)) // 2
    for i, (key, t1, t2) in enumerate(steps):
        x = x0 + i * (pw + gap)
        ph = make_phone(S[key], pw)
        place(base, ph, x, 340, shadow=(30, 26, 90))
        d = ImageDraw.Draw(base)
        if i < 3:
            draw_icon(d, "arrow_forward", x + pw + gap // 2, 340 + ph.height // 2, 48, PRIMARY)
    # captions overlap the phones' lower part on a white card
    for i, (key, t1, t2) in enumerate(steps):
        x = x0 + i * (pw + gap)
        rrect(base, (x - 10, 1010, x + pw + 10, 1130), 26, fill=WHITE, shadow=(16, 8, 34), outline=(232, 240, 241))
        d = ImageDraw.Draw(base)
        d.ellipse([x + 14, 1042, x + 14 + 56, 1042 + 56], fill=PRIMARY)
        d.text((x + 42, 1070), str(i + 1), font=font(800, 28), fill=WHITE, anchor="mm")
        d.text((x + 88, 1050), t1, font=font(800, 27), fill=TEXT, anchor="la")
        d.text((x + 88, 1088), t2, font=font(500, 20), fill=MUTED, anchor="la")
    save(base, "03-split-bill.png")


def slide_bot(S):
    base = soft_background()
    chrome(base)
    d = ImageDraw.Draw(base)
    eyebrow(d, 110, 200, "Fitur 02 · WhatsApp bot")
    d.text((110, 245), "Catat lewat\nchat WhatsApp", font=font(800, 78), fill=TEXT, anchor="la", spacing=6)
    draw_text(d, (110, 450), "Bot pribadi yang tersambung ke database keuangan yang sama dengan web. Cukup kirim pesan seperti ke teman.",
              font(500, 30), MUTED, max_w=640, line_gap=1.45)
    pts = [("Teks bebas, prefix +/−, atau voice note", "mic"),
           ("Foto struk / bukti QRIS langsung tercatat", "receipt_long"),
           ("/hitungin di grup → link split bill", "groups"),
           ("/saldo, /hariini, /bulanini untuk rekap", "query_stats")]
    y = 690
    for lab, ic in pts:
        d.rounded_rectangle([110, y, 110 + 64, y + 64], radius=20, fill=TINT)
        draw_icon(d, ic, 110 + 32, y + 32, 38, PRIMARY)
        draw_text(d, (200, y + 32 - 18), lab, font(600, 27), TEXT, max_w=560, line_gap=1.2)
        y += 96

    # chat mock (illustration of the bot's replies)
    cx0, cy0, cw = 860, 165, 830
    rrect(base, (cx0, cy0, cx0 + cw, 1110), 40, fill=(236, 243, 243), shadow=(34, 20, 60), outline=(222, 232, 233))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle([cx0, cy0, cx0 + cw, cy0 + 100], radius=40, fill=WHITE)
    d.rectangle([cx0, cy0 + 60, cx0 + cw, cy0 + 100], fill=WHITE)
    base.alpha_composite(logo(58), (cx0 + 30, cy0 + 21))
    d.text((cx0 + 106, cy0 + 36), "PatungIn Bot", font=font(800, 28), fill=TEXT, anchor="lm")
    d.text((cx0 + 106, cy0 + 70), "online", font=font(500, 21), fill=INCOME, anchor="lm")
    y = cy0 + 140
    right = cx0 + cw - 34
    y += bubble(base, right, y, [("makan siang padang 35rb bca", 600)], True, width=440) + 22
    y += bubble(base, cx0 + 34, y, [("Pengeluaran Tercatat!", 800), ("Nominal: Rp 35.000", 500), ("Kategori: Makanan & Minuman", 500),
                                   ("Dompet: BCA", 500), ("Ketik batal dalam 30 menit jika salah", 400)], False, width=520) + 22
    h = 92
    rrect(base, (right - 360, y, right, y + h), 26, fill=(220, 244, 240), shadow=(12, 6, 26))
    dd = ImageDraw.Draw(base)
    dd.ellipse([right - 336, y + 22, right - 288, y + 70], fill=PRIMARY)
    draw_icon(dd, "play_arrow", right - 312, y + 46, 32, WHITE)
    for i in range(15):
        hh = [10, 22, 14, 30, 18, 26, 12, 34, 20, 16, 28, 12, 24, 18, 10][i]
        bx = right - 270 + i * 12
        dd.rounded_rectangle([bx, y + 46 - hh // 2, bx + 6, y + 46 + hh // 2], radius=3, fill=PRIMARY_DARK)
    dd.text((right - 30, y + 46), "0:04", font=font(500, 20), fill=MUTED, anchor="rm")
    y += h + 22
    y += bubble(base, cx0 + 34, y, [("Voice Note Tercatat!", 800), ("Nominal: Rp 50.000 · Transportasi", 500), ("Dompet: GoPay", 500)], False, width=520) + 22
    y += bubble(base, right, y, [("/saldo", 600)], True, width=170) + 22
    bubble(base, cx0 + 34, y, [("Total saldo: Rp 11.016.500", 800), ("BCA Rp 6.850.000 · Mandiri Rp 2.140.000 · …", 500)], False, width=600)
    save(base, "04-bot-whatsapp.png")


def slide_finance(S):
    base = soft_background()
    chrome(base)
    d = ImageDraw.Draw(base)
    eyebrow(d, 110, 200, "Fitur 03 · Finance tracker")
    d.text((110, 245), "Dompet &\nCatat cepat", font=font(800, 82), fill=TEXT, anchor="la", spacing=6)
    draw_text(d, (110, 470), "Desain mengikuti design system Stash: saldo semua dompet di satu layar dan input secepat kalkulator.",
              font(500, 30), MUTED, max_w=640, line_gap=1.45)
    pts = [("Numpad kalkulator + − × ÷ dan tombol 000", "calculate"),
           ("Catat cepat pakai kalimat, diproses AI", "auto_awesome"),
           ("Transfer antar dompet & riwayat per dompet", "swap_horiz"),
           ("Scan struk langsung jadi transaksi", "document_scanner")]
    y = 690
    for lab, ic in pts:
        d.rounded_rectangle([110, y, 110 + 64, y + 64], radius=20, fill=TINT)
        draw_icon(d, ic, 110 + 32, y + 32, 38, PRIMARY)
        draw_text(d, (200, y + 32 - 18), lab, font(600, 27), TEXT, max_w=520, line_gap=1.2)
        y += 96
    wl, ct, hm = make_phone(S["fin_wallets"], 330), make_phone(S["fin_catat_calc"], 330), make_phone(S["fin_home"], 420)
    place(base, ct, 1410, 280, angle=3)
    place(base, wl, 765, 280, angle=-3)
    place(base, hm, 1030, 130)
    save(base, "05-finance-tracker.png")


def slide_analytics(S):
    base = soft_background()
    chrome(base)
    d = ImageDraw.Draw(base)
    eyebrow(d, 110, 175, "Fitur 04 · Analitik & responsif")
    d.text((110, 215), "Satu aplikasi, nyaman di HP dan laptop", font=font(800, 62), fill=TEXT, anchor="la")
    bf = browser_frame(S["fin_desktop_home"], 1150)
    place(base, bf, 110, 345, shadow=(34, 24, 70))
    ph = make_phone(S["fin_analytics"], 380)
    place(base, ph, 1330, 300, angle=0)
    save(base, "06-analitik-responsif.png")


def slide_tech(S):
    base = soft_background()
    chrome(base, tag="Di balik layar")
    d = ImageDraw.Draw(base)
    eyebrow(d, 110, 175, "Arsitektur")
    d.text((110, 215), "Satu backend, banyak pintu masuk", font=font(800, 62), fill=TEXT, anchor="la")

    boxes = [("Klien", "PWA · WhatsApp · Siri", "devices"), ("API", "Express REST", "api"),
             ("Services", "Finance · Bot · Session", "code"), ("Database", "SQLite lokal", "storage")]
    bw, bh, gap, y0 = 340, 170, 73, 360
    for i, (t1, t2, ic) in enumerate(boxes):
        x = 110 + i * (bw + gap)
        rrect(base, (x, y0, x + bw, y0 + bh), 30, fill=WHITE, shadow=(22, 12, 38), outline=(232, 240, 241))
        d = ImageDraw.Draw(base)
        d.rounded_rectangle([x + 28, y0 + 28, x + 28 + 66, y0 + 28 + 66], radius=20, fill=TINT)
        draw_icon(d, ic, x + 28 + 33, y0 + 28 + 33, 38, PRIMARY)
        d.text((x + 114, y0 + 52), t1, font=font(800, 34), fill=TEXT, anchor="lm")
        d.text((x + 28, y0 + 132), t2, font=font(500, 25), fill=MUTED, anchor="lm")
        if i < len(boxes) - 1:
            draw_icon(d, "arrow_forward", x + bw + gap // 2, y0 + bh // 2, 46, PRIMARY)
    gx, gy, gw, gh = 110, 600, 1580, 120
    d = ImageDraw.Draw(base)
    for i in range(0, gw, 24):
        d.line([(gx + i, gy), (gx + min(i + 12, gw), gy)], fill=ACCENT, width=3)
        d.line([(gx + i, gy + gh), (gx + min(i + 12, gw), gy + gh)], fill=ACCENT, width=3)
    for i in range(0, gh, 24):
        d.line([(gx, gy + i), (gx, gy + min(i + 12, gh))], fill=ACCENT, width=3)
        d.line([(gx + gw, gy + i), (gx + gw, gy + min(i + 12, gh))], fill=ACCENT, width=3)
    draw_icon(d, "auto_awesome", gx + 56, gy + 60, 48, ACCENT)
    d.text((gx + 110, gy + 42), "Gemini API (vision, audio, teks)", font=font(800, 32), fill=TEXT, anchor="lm")
    d.text((gx + 110, gy + 84), "OCR struk, voice note, dan parsing kalimat bebas, dengan regex cepat sebagai jalur pertama", font=font(500, 25), fill=MUTED, anchor="lm")

    ImageDraw.Draw(base).text((110, 780), "Stack", font=font(800, 26), fill=PRIMARY, anchor="la")
    x, y = 110, 825
    for lab in ["Node.js", "Express", "better-sqlite3", "Gemini API", "Baileys (WhatsApp)", "Multer", "PWA + Service Worker", "Google Apps Script", "Vanilla JS", "Plus Jakarta Sans"]:
        f = font(700, 24)
        w_ = int(f.getlength(lab)) + 52
        if x + w_ > 1690:
            x, y = 110, y + 66
        chip(base, x, y, lab, f, PRIMARY_DARK, TINT, pad_x=26, pad_y=11)
        x += w_ + 14

    stats = [("105", "commit"), ("3", "kanal input"), ("4", "langkah split"), ("PWA", "installable")]
    sx = 110
    for big, small in stats:
        rrect(base, (sx, 990, sx + 380, 1090), 28, fill=WHITE, shadow=(18, 8, 34), outline=(232, 240, 241))
        dd = ImageDraw.Draw(base)
        dd.text((sx + 28, 1040), big, font=font(800, 40), fill=PRIMARY, anchor="lm")
        bw_ = int(font(800, 40).getlength(big))
        dd.text((sx + 28 + bw_ + 14, 1042), small, font=font(600, 22), fill=MUTED, anchor="lm")
        sx += 380 + 20
    save(base, "07-arsitektur.png")


if __name__ == "__main__":
    shots_dir = os.path.join(OUT, "screens")
    names = ["fin_home", "fin_catat_calc", "fin_wallets", "fin_analytics", "fin_desktop_home",
             "split_step1", "split_step2", "split_step3", "split_step4"]
    shots = {n: load_shot(shots_dir, n) for n in names}
    slide_cover(shots)
    slide_features(shots)
    slide_split(shots)
    slide_bot(shots)
    slide_finance(shots)
    slide_analytics(shots)
    slide_tech(shots)
