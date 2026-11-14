"""Erzeugt den Beispiel-Kleiderschrank (demo/*.jpg + demo/demo.json).

Aufruf aus dem Repo-Ordner:  python3 tools/make_demo.py
Benötigt Pillow (pip install pillow).
"""
import json
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'demo')
W, H = 1000, 1333          # virtuelle Zeichenfläche
K = 1.5                    # Überabtastung für weiche Kanten
FINAL = (768, 1024)
BG = (232, 226, 216)


def P(pts):
    return [(x * K, y * K) for x, y in pts]


def R(box):
    return [v * K for v in box]


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


class Canvas:
    def __init__(self):
        self.layer = Image.new('RGBA', (int(W * K), int(H * K)), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.layer)

    def poly(self, pts, fill, outline=None, width=0):
        self.d.polygon(P(pts), fill=fill, outline=outline, width=int(width * K) if width else 0)

    def line(self, pts, fill, width):
        self.d.line(P(pts), fill=fill, width=int(width * K), joint='curve')

    def ell(self, box, fill, outline=None, width=0):
        self.d.ellipse(R(box), fill=fill, outline=outline, width=int(width * K) if width else 0)

    def rect(self, box, fill, radius=0, outline=None, width=0):
        self.d.rounded_rectangle(R(box), radius=radius * K, fill=fill, outline=outline, width=int(width * K) if width else 0)

    def stripes(self, color, gap, thick, y0=0, y1=H):
        """Querstreifen nur dort, wo schon Stoff ist."""
        mask = self.layer.split()[3]
        st = Image.new('RGBA', self.layer.size, (0, 0, 0, 0))
        sd = ImageDraw.Draw(st)
        y = y0
        while y < y1:
            sd.rectangle([0, y * K, W * K, (y + thick) * K], fill=color + (255,))
            y += gap
        st.putalpha(Image.composite(st.split()[3], Image.new('L', st.size, 0), mask))
        self.layer.alpha_composite(st)

    def save(self, name):
        bg = Image.new('RGBA', self.layer.size, BG + (255,))
        # leichter Verlauf im Hintergrund
        grad = Image.linear_gradient('L').resize(self.layer.size).point(lambda v: int(v * 0.18))
        bg.alpha_composite(Image.merge('RGBA', [Image.new('L', bg.size, 200)] * 3 + [grad]))
        alpha = self.layer.split()[3]
        shadow = Image.new('RGBA', self.layer.size, (60, 50, 40, 0))
        shadow.putalpha(alpha.point(lambda v: int(v * 0.35)).filter(ImageFilter.GaussianBlur(18 * K)))
        bg.alpha_composite(shadow, (int(10 * K), int(18 * K)))
        bg.alpha_composite(self.layer)
        bg.convert('RGB').resize(FINAL, Image.LANCZOS).save(os.path.join(OUT, name + '.jpg'), quality=86)


# ---------- Oberteile ----------
def top(c, sleeves='long', neck='crew', hem=930, extra=None):
    cv = Canvas()
    dark, light = shade(c, 0.78), shade(c, 1.12)
    if sleeves == 'long':
        body = [(425, 215), (290, 250), (215, 330), (150, 760), (240, 780), (300, 440), (300, hem),
                (700, hem), (700, 440), (760, 780), (850, 760), (785, 330), (710, 250), (575, 215)]
    elif sleeves == 'none':
        body = [(425, 215), (330, 235), (330, 330), (300, 440), (300, hem),
                (700, hem), (700, 440), (670, 330), (670, 235), (575, 215)]
    else:
        body = [(425, 215), (290, 250), (170, 420), (250, 500), (300, 440), (300, hem),
                (700, hem), (700, 440), (750, 500), (830, 420), (710, 250), (575, 215)]
    if neck == 'hood':
        cv.ell((360, 90, 640, 330), dark)
    cv.poly(body, c)
    if extra and extra.get('stripes'):
        cv.stripes(extra['stripes'], 70, 26, 300)
    # Falten / Nähte
    if sleeves == 'long':
        cv.line([(300, 440), (300, 470)], dark, 4)
        cv.rect((150, 735, 240, 785), dark, 8)
        cv.rect((760, 735, 850, 785), dark, 8)
    cv.line([(300, hem - 40), (700, hem - 40)], dark, 4)
    if neck == 'crew':
        cv.ell((425, 175, 575, 265), dark)
        cv.ell((440, 180, 560, 245), shade(c, 0.6))
    elif neck == 'zip':
        cv.rect((430, 175, 570, 250), shade(c, 0.85), 20)
        cv.line([(500, 180), (500, hem - 10)], (210, 210, 210), 6)
        cv.ell((490, 250, 510, 275), (220, 220, 220))
        if extra and extra.get('band'):
            cv.rect((300, 520, 700, 580), extra['band'])
    elif neck == 'v':
        cv.poly([(425, 215), (500, 360), (575, 215)], shade(c, 0.6))
        cv.line([(425, 215), (500, 360), (575, 215)], dark, 10)
    elif neck in ('shirt', 'polo'):
        cv.poly([(425, 215), (500, 255), (575, 215), (560, 190), (440, 190)], shade(c, 0.65))
        cv.poly([(425, 205), (500, 262), (455, 300), (400, 240)], light, dark, 3)
        cv.poly([(575, 205), (500, 262), (545, 300), (600, 240)], light, dark, 3)
        n = 6 if neck == 'shirt' else 2
        end = hem - 50 if neck == 'shirt' else 400
        cv.line([(500, 262), (500, end)], dark, 3)
        for i in range(n):
            y = 300 + i * (end - 300) / max(1, n - 1) if n > 1 else 320
            cv.ell((492, y - 8, 508, y + 8), (245, 245, 240), dark, 2)
        if neck == 'shirt':
            cv.rect((560, 380, 650, 470), None, 4, dark, 3)  # Brusttasche
    elif neck == 'hood':
        cv.poly([(425, 215), (500, 300), (575, 215)], shade(c, 0.55))
        cv.line([(470, 260), (465, 420)], light, 6)
        cv.line([(530, 260), (535, 420)], light, 6)
        cv.rect((370, 640, 630, 830), None, 40, dark, 5)  # Bauchtasche
    elif neck == 'cardigan':
        cv.poly([(425, 215), (500, 420), (575, 215)], shade(c, 0.6))
        cv.line([(500, 420), (500, hem)], dark, 5)
        for y in range(470, hem - 40, 110):
            cv.ell((508, y - 10, 528, y + 10), shade(c, 0.5))
    elif neck == 'blazer':
        cv.poly([(425, 215), (500, 560), (575, 215)], (245, 245, 242))
        cv.poly([(425, 210), (500, 560), (455, 520), (390, 330), (440, 300), (400, 250)], dark)
        cv.poly([(575, 210), (500, 560), (545, 520), (610, 330), (560, 300), (600, 250)], dark)
        cv.line([(500, 560), (500, hem)], dark, 4)
        for y in (650, 780):
            cv.ell((510, y - 12, 534, y + 12), shade(c, 0.45))
        cv.line([(340, 820), (440, 820)], dark, 5)
        cv.line([(560, 820), (660, 820)], dark, 5)
        cv.line([(570, 430), (650, 430)], dark, 5)
    if extra and extra.get('reflect'):
        cv.line([(300, 640), (700, 640)], (230, 230, 230), 10)
    if neck in ('crew', 'v') and not (extra and extra.get('stripes')) and sleeves == 'long':
        cv.rect((300, hem - 60, 700, hem), shade(c, 0.85))  # Strickbund
        for x in range(310, 700, 18):
            cv.line([(x, hem - 58), (x, hem - 2)], shade(c, 0.75), 3)
    return cv


# ---------- Jacken ----------
def coat(c, kind):
    hem = 1230 if kind == 'mantel' else 1000
    cv = Canvas()
    dark = shade(c, 0.75)
    if kind == 'regen':
        cv.ell((350, 60, 650, 330), dark)
    body = [(420, 210), (270, 250), (200, 330), (130, 820), (230, 840), (290, 460), (280, hem),
            (720, hem), (710, 460), (770, 840), (870, 820), (800, 330), (730, 250), (580, 210)]
    cv.poly(body, c)
    if kind == 'mantel':
        cv.poly([(420, 205), (500, 520), (440, 500), (370, 330), (430, 290), (380, 240)], dark)
        cv.poly([(580, 205), (500, 520), (560, 500), (630, 330), (570, 290), (620, 240)], dark)
        cv.poly([(430, 210), (500, 520), (570, 210)], (60, 60, 70))
        for y in (600, 780, 960):
            cv.ell((430, y - 14, 458, y + 14), shade(c, 0.5))
            cv.ell((542, y - 14, 570, y + 14), shade(c, 0.5))
        cv.line([(500, 520), (500, hem)], dark, 4)
        cv.line([(320, 900), (420, 880)], dark, 6)
        cv.line([(580, 880), (680, 900)], dark, 6)
    elif kind == 'daune':
        for y in range(330, hem, 95):
            cv.line([(200, y), (800, y)], shade(c, 0.6), 6)
        cv.rect((430, 170, 570, 260), shade(c, 1.4), 30)
        cv.line([(500, 230), (500, hem)], (150, 150, 155), 8)
    elif kind == 'regen':
        cv.poly([(430, 210), (500, 290), (570, 210)], dark)
        cv.line([(500, 290), (500, hem)], shade(c, 0.6), 8)
        cv.line([(470, 280), (460, 400)], (40, 40, 40), 5)
        cv.line([(530, 280), (540, 400)], (40, 40, 40), 5)
        cv.rect((320, 700, 430, 820), None, 10, dark, 5)
        cv.rect((570, 700, 680, 820), None, 10, dark, 5)
    cv.line([(280, hem - 30), (720, hem - 30)], dark, 4)
    return cv


# ---------- Hosen ----------
def pants(c, kind):
    cv = Canvas()
    dark, light = shade(c, 0.75), shade(c, 1.25)
    bottom = 650 if kind == 'shorts' else 1250
    inner = 590 if kind == 'shorts' else 560
    if kind == 'tights':
        legs = [(340, 250), (660, 250), (630, 1250), (530, 1250), (500, 560), (470, 1250), (370, 1250)]
    else:
        legs = [(330, 250), (670, 250), (705 if kind != 'shorts' else 720, bottom), (520, bottom), (500, inner),
                (480, bottom), (295 if kind != 'shorts' else 280, bottom)]
    cv.poly(legs, c)
    cv.rect((325, 180, 675, 255), shade(c, 0.9), 6)
    for x in (360, 470, 530, 640):
        cv.rect((x - 8, 175, x + 8, 260), dark, 3)  # Gürtelschlaufen
    if kind != 'tights':
        cv.line([(500, 255), (500, 470)], dark, 5)
        cv.ell((488, 205, 512, 229), (190, 170, 120) if kind == 'jeans' else dark)
    if kind == 'jeans':
        cv.line([(340, 290), (420, 290), (440, 380)], light, 4)
        cv.line([(660, 290), (580, 290), (560, 380)], light, 4)
        cv.line([(312, 600), (300, 1240)], light, 3)
        cv.line([(688, 600), (700, 1240)], light, 3)
    elif kind in ('chino', 'anzug'):
        cv.line([(400, 300), (395, 1240)], dark, 3)
        cv.line([(600, 300), (605, 1240)], dark, 3)
        cv.line([(345, 270), (420, 380)], dark, 4)
        cv.line([(655, 270), (580, 380)], dark, 4)
    elif kind == 'shorts':
        cv.line([(345, 270), (420, 380)], dark, 4)
        cv.line([(655, 270), (580, 380)], dark, 4)
        cv.line([(290, 615), (480, 615)], dark, 4)
        cv.line([(520, 615), (715, 615)], dark, 4)
    elif kind == 'tights':
        cv.line([(345, 600), (380, 1240)], (200, 200, 200), 6)
        cv.line([(655, 600), (620, 1240)], (200, 200, 200), 6)
    return cv


# ---------- Schuhe ----------
def shoes(c, kind, accent=None):
    cv = Canvas()
    dark = shade(c, 0.7)
    for dx, dy in ((80, -60), (0, 0)):  # zwei Schuhe, leicht versetzt
        def S(pts):
            return [(x + dx, y + dy) for x, y in pts]
        sole = (40, 40, 40) if kind in ('derby', 'boots') else (245, 245, 240)
        if kind == 'boots':
            upper = S([(200, 440), (430, 440), (450, 760), (760, 820), (830, 900), (830, 960), (190, 960)])
        elif kind == 'derby':
            upper = S([(190, 760), (420, 720), (620, 770), (810, 850), (840, 940), (190, 940)])
        else:
            upper = S([(190, 720), (400, 690), (560, 760), (790, 830), (840, 920), (190, 930)])
        cv.poly(upper, c, dark, 3)
        h = 60 if kind in ('sneaker', 'lauf') else 35
        cv.rect((180 + dx, 930 + dy, 850 + dx, 930 + h + dy), sole, 18)
        if kind in ('sneaker', 'lauf', 'derby'):
            for i in range(4):
                x = 440 + i * 45
                cv.line([(x + dx, 735 + i * 12 + dy), (x + 40 + dx, 765 + i * 12 + dy)], shade(c, 0.6) if kind == 'derby' or sum(c) > 600 else (250, 250, 250), 7)
        if kind == 'lauf' and accent:
            cv.line(S([(300, 880), (520, 800), (700, 880)]), accent, 16)
        if kind == 'derby':
            cv.line(S([(560, 800), (760, 860)]), shade(c, 2.5), 6)  # Glanzkante
        if kind == 'boots':
            cv.line(S([(240, 470), (420, 470)]), dark, 5)
            cv.rect((210 + dx, 520 + dy, 250 + dx, 700 + dy), shade(c, 0.85), 10)
    return cv


# ---------- Sport-Extras ----------
def bib(c, long=False):
    cv = pants(c, 'tights' if long else 'shorts')
    cv.line([(380, 250), (420, 60)], c, 34)
    cv.line([(620, 250), (580, 60)], c, 34)
    cv.rect((330, 180, 670, 255), shade(c, 1.5), 6)
    return cv


def tubes(c, length, label_color=None):
    cv = Canvas()
    for x in (300, 560):
        cv.rect((x, 250, x + 140, 250 + length), c, 50)
        cv.rect((x, 250, x + 140, 300), shade(c, 1.5), 30)
        if label_color:
            cv.rect((x + 40, 330, x + 100, 360), label_color, 6)
    return cv


def gloves(c, kind):
    cv = Canvas()
    dark = shade(c, 0.7)
    for dx in (0, 300):
        cv.rect((260 + dx, 600, 460 + dx, 900), c, 50)
        cv.rect((250 + dx, 880, 470 + dx, 980), dark if kind != 'winter' else shade(c, 1.4), 30)
        flen = 40 if kind == 'kurz' else 160
        for i in range(4):
            cv.rect((265 + dx + i * 50, 600 - flen, 305 + dx + i * 50, 640), c, 20)
        cv.rect((200 + dx, 680, 250 + dx, 800), c, 25)
        if kind == 'kurz':
            cv.rect((285 + dx, 680, 435 + dx, 760), shade(c, 1.3), 20)
    return cv


def overshoe(c):
    cv = Canvas()
    cv.poly([(250, 420), (470, 420), (480, 760), (800, 820), (850, 920), (230, 930)], c, shade(c, 0.6), 4)
    cv.line([(470, 440), (470, 760)], (160, 160, 160), 8)
    cv.rect((260, 900, 840, 940), shade(c, 0.6), 14)
    cv.line([(560, 790), (700, 830)], (220, 220, 220), 10)
    return cv


def capthin(c):
    cv = Canvas()
    cv.d.chord(R((250, 380, 750, 900)), 180, 360, fill=c)
    cv.rect((250, 620, 750, 680), shade(c, 0.8), 20)
    cv.line([(500, 390), (500, 640)], shade(c, 0.8), 4)
    return cv


def buff(c):
    cv = Canvas()
    cv.rect((340, 300, 660, 1000), c, 40)
    for y in range(360, 980, 70):
        cv.line([(350, y), (650, y + 30)], shade(c, 0.8), 10)
    return cv


def bikeshoe(c):
    cv = shoes(c, 'derby')
    for dx, dy in ((80, -60), (0, 0)):
        cv.line([(400 + dx, 760 + dy), (560 + dx, 790 + dy)], (240, 240, 240), 14)
        cv.line([(420 + dx, 820 + dy), (600 + dx, 850 + dy)], (240, 240, 240), 14)
        cv.rect((200 + dx, 930 + dy, 820 + dx, 960 + dy), (20, 20, 20), 10)
    return cv


# ---------- Accessoires ----------
def scarf(c):
    cv = Canvas()
    dark = shade(c, 0.75)
    cv.rect((380, 150, 560, 1180), c, 30)
    cv.rect((480, 220, 640, 1050), shade(c, 0.9), 30)
    for y in range(240, 1150, 80):
        cv.line([(390, y), (550, y)], dark, 3)
    for x in range(390, 560, 18):
        cv.line([(x, 1180), (x, 1240)], c, 6)
    return cv


def beanie(c):
    cv = Canvas()
    dark = shade(c, 0.75)
    cv.d.chord(R((250, 300, 750, 900)), 180, 360, fill=c)
    cv.rect((240, 590, 760, 760), shade(c, 0.9), 20)
    for x in range(260, 750, 22):
        cv.line([(x, 600), (x, 750)], dark, 4)
    cv.ell((440, 230, 560, 340), shade(c, 1.1))
    return cv


def belt(c):
    cv = Canvas()
    cv.rect((120, 600, 880, 690), c, 20)
    for x in range(560, 860, 50):
        cv.ell((x, 635, x + 18, 653), shade(c, 0.5))
    cv.rect((150, 575, 270, 715), None, 14, (200, 190, 160), 14)
    cv.line([(170, 645), (260, 645)], (200, 190, 160), 10)
    cv.line([(140, 612), (860, 612)], shade(c, 0.7), 3)
    cv.line([(140, 678), (860, 678)], shade(c, 0.7), 3)
    return cv


ALL = ['fruehling', 'sommer', 'herbst', 'winter']
NOT_SUMMER = ['fruehling', 'herbst', 'winter']
ITEMS = [
    # id, Zeichnung, Metadaten
    ('tshirt-weiss', lambda: top(hexrgb('#f2f2ee'), 'short'), dict(kategorie='oberteil', bezeichnung='Weißes T-Shirt', farben=[('Weiß', '#f2f2ee', True)], formalitaet=2, waerme=2, saisons=ALL, anlaesse=['freizeit', 'buero'])),
    ('shirt-streifen', lambda: top(hexrgb('#f4f1e8'), 'long', 'crew', extra={'stripes': hexrgb('#1f2d4d')}), dict(kategorie='oberteil', bezeichnung='Gestreiftes Langarmshirt', farben=[('Navy', '#1f2d4d', True), ('Creme', '#f4f1e8', True)], muster='gemustert', formalitaet=2, waerme=2, saisons=['fruehling', 'sommer', 'herbst'], anlaesse=['freizeit', 'ausgehen'])),
    ('hemd-hellblau', lambda: top(hexrgb('#9cbde3'), 'long', 'shirt'), dict(kategorie='oberteil', bezeichnung='Hellblaues Oxford-Hemd', farben=[('Hellblau', '#9cbde3', False)], formalitaet=4, waerme=3, saisons=ALL, anlaesse=['buero', 'ausgehen'])),
    ('hemd-weiss', lambda: top(hexrgb('#fafaf8'), 'long', 'shirt'), dict(kategorie='oberteil', bezeichnung='Weißes Businesshemd', farben=[('Weiß', '#fafaf8', True)], formalitaet=5, waerme=3, saisons=ALL, anlaesse=['buero', 'festlich', 'ausgehen'])),
    ('polo-salbei', lambda: top(hexrgb('#8fa882'), 'short', 'polo'), dict(kategorie='oberteil', bezeichnung='Salbeigrünes Poloshirt', farben=[('Salbeigrün', '#8fa882', False)], formalitaet=3, waerme=2, saisons=['fruehling', 'sommer'], anlaesse=['freizeit', 'buero'])),
    ('laufshirt', lambda: top(hexrgb('#ff7a1a'), 'short', 'crew', extra={'reflect': True}), dict(kategorie='oberteil', bezeichnung='Orangefarbenes Laufshirt', farben=[('Neonorange', '#ff7a1a', False)], formalitaet=1, waerme=1, saisons=ALL, anlaesse=['sport'], sportteil='oben_kurz', sportarten=['laufen'])),
    ('laufshirt-lang', lambda: top(hexrgb('#2b3a55'), 'long', 'crew', extra={'reflect': True}), dict(kategorie='oberteil', bezeichnung='Langarm-Funktionsshirt', farben=[('Dunkelblau', '#2b3a55', True)], formalitaet=1, waerme=3, saisons=NOT_SUMMER, anlaesse=['sport'], sportteil='oben_lang', sportarten=['laufen'])),
    ('pulli-grau', lambda: top(hexrgb('#8a8a8f'), 'long', 'crew'), dict(kategorie='schicht', bezeichnung='Grauer Strickpullover', farben=[('Grau', '#8a8a8f', True)], formalitaet=3, waerme=4, saisons=['herbst', 'winter'], anlaesse=['buero', 'freizeit'])),
    ('pulli-v-navy', lambda: top(hexrgb('#25304d'), 'long', 'v'), dict(kategorie='schicht', bezeichnung='Navy Pullover mit V-Ausschnitt', farben=[('Navy', '#25304d', True)], formalitaet=4, waerme=3, saisons=NOT_SUMMER, anlaesse=['buero', 'ausgehen'])),
    ('hoodie-oliv', lambda: top(hexrgb('#6b6f3a'), 'long', 'hood'), dict(kategorie='schicht', bezeichnung='Olivgrüner Hoodie', farben=[('Oliv', '#6b6f3a', True)], formalitaet=2, waerme=4, saisons=NOT_SUMMER, anlaesse=['freizeit'])),
    ('cardigan-bordeaux', lambda: top(hexrgb('#7a2433'), 'long', 'cardigan'), dict(kategorie='schicht', bezeichnung='Bordeauxrote Strickjacke', farben=[('Bordeaux', '#7a2433', False)], formalitaet=3, waerme=3, saisons=['herbst', 'winter'], anlaesse=['buero', 'freizeit', 'ausgehen'])),
    ('sakko-navy', lambda: top(hexrgb('#232c44'), 'long', 'blazer', hem=980), dict(kategorie='schicht', bezeichnung='Navy Sakko', farben=[('Navy', '#232c44', True)], formalitaet=5, waerme=3, saisons=NOT_SUMMER, anlaesse=['buero', 'festlich', 'ausgehen'])),
    ('jeans', lambda: pants(hexrgb('#34507e'), 'jeans'), dict(kategorie='unterteil', bezeichnung='Dunkle Jeans', farben=[('Jeansblau', '#34507e', True)], formalitaet=2, waerme=3, saisons=ALL, anlaesse=['freizeit', 'buero', 'ausgehen'])),
    ('chino-beige', lambda: pants(hexrgb('#c9b38a'), 'chino'), dict(kategorie='unterteil', bezeichnung='Beige Chino', farben=[('Beige', '#c9b38a', True)], formalitaet=3, waerme=3, saisons=['fruehling', 'sommer', 'herbst'], anlaesse=['buero', 'freizeit', 'ausgehen'])),
    ('anzughose-grau', lambda: pants(hexrgb('#55585e'), 'anzug'), dict(kategorie='unterteil', bezeichnung='Graue Anzughose', farben=[('Anthrazit', '#55585e', True)], formalitaet=5, waerme=3, saisons=ALL, anlaesse=['buero', 'festlich'])),
    ('shorts-khaki', lambda: pants(hexrgb('#b8a785'), 'shorts'), dict(kategorie='unterteil', bezeichnung='Khaki Shorts', farben=[('Khaki', '#b8a785', True)], formalitaet=2, waerme=1, saisons=['sommer'], anlaesse=['freizeit'])),
    ('lauftights', lambda: pants(hexrgb('#1c1c20'), 'tights'), dict(kategorie='unterteil', bezeichnung='Schwarze Lauftights', farben=[('Schwarz', '#1c1c20', True)], formalitaet=1, waerme=3, saisons=ALL, anlaesse=['sport'], sportteil='unten_lang', sportarten=['laufen'])),
    ('mantel-camel', lambda: coat(hexrgb('#b98d5a'), 'mantel'), dict(kategorie='jacke', bezeichnung='Camel Wollmantel', farben=[('Camel', '#b98d5a', True)], formalitaet=4, waerme=5, saisons=['herbst', 'winter'], anlaesse=['buero', 'ausgehen', 'festlich'])),
    ('regenjacke-gelb', lambda: coat(hexrgb('#f0c030'), 'regen'), dict(kategorie='jacke', bezeichnung='Gelbe Regenjacke', farben=[('Gelb', '#f0c030', False)], formalitaet=2, waerme=2, saisons=['fruehling', 'sommer', 'herbst'], anlaesse=['freizeit'], regenfest=True)),
    ('daunenjacke', lambda: coat(hexrgb('#2a2a2e'), 'daune'), dict(kategorie='jacke', bezeichnung='Schwarze Daunenjacke', farben=[('Schwarz', '#2a2a2e', True)], formalitaet=2, waerme=5, saisons=['winter'], anlaesse=['freizeit', 'buero'], regenfest=True)),
    ('sneaker-weiss', lambda: shoes(hexrgb('#f3f3f0'), 'sneaker'), dict(kategorie='schuhe', bezeichnung='Weiße Sneaker', farben=[('Weiß', '#f3f3f0', True)], formalitaet=2, waerme=2, saisons=['fruehling', 'sommer', 'herbst'], anlaesse=['freizeit', 'buero', 'ausgehen'])),
    ('boots-braun', lambda: shoes(hexrgb('#6e4529'), 'boots'), dict(kategorie='schuhe', bezeichnung='Braune Lederboots', farben=[('Braun', '#6e4529', True)], formalitaet=3, waerme=4, saisons=['herbst', 'winter'], anlaesse=['buero', 'freizeit', 'ausgehen'], regenfest=True)),
    ('derby-schwarz', lambda: shoes(hexrgb('#1e1d1f'), 'derby'), dict(kategorie='schuhe', bezeichnung='Schwarze Lederschuhe', farben=[('Schwarz', '#1e1d1f', True)], formalitaet=5, waerme=3, saisons=ALL, anlaesse=['buero', 'festlich', 'ausgehen'])),
    ('laufschuhe', lambda: shoes(hexrgb('#2f6fd6'), 'lauf', hexrgb('#c8ff3c')), dict(kategorie='schuhe', bezeichnung='Blaue Laufschuhe', farben=[('Blau', '#2f6fd6', False), ('Neongelb', '#c8ff3c', False)], formalitaet=1, waerme=2, saisons=ALL, anlaesse=['sport'], sportteil='schuhe', sportarten=['laufen'])),
    ('schal-rot', lambda: scarf(hexrgb('#b02a30')), dict(kategorie='accessoire', bezeichnung='Roter Wollschal', farben=[('Rot', '#b02a30', False)], formalitaet=3, waerme=5, saisons=['herbst', 'winter'], anlaesse=['freizeit', 'buero', 'ausgehen'])),
    ('muetze-grau', lambda: beanie(hexrgb('#9a9a9e')), dict(kategorie='accessoire', bezeichnung='Graue Strickmütze', farben=[('Grau', '#9a9a9e', True)], formalitaet=2, waerme=5, saisons=['winter'], anlaesse=['freizeit', 'sport'], sportteil='kopf_warm', sportarten=['laufen'])),
    ('guertel-braun', lambda: belt(hexrgb('#6a4128')), dict(kategorie='accessoire', bezeichnung='Brauner Ledergürtel', farben=[('Braun', '#6a4128', True)], formalitaet=4, waerme=3, saisons=ALL, anlaesse=['buero', 'festlich', 'ausgehen'])),
    # --- Laufen & Rad ---
    ('laufshorts', lambda: pants(hexrgb('#2d4f9e'), 'shorts'), dict(kategorie='unterteil', bezeichnung='Blaue Laufshorts', farben=[('Blau', '#2d4f9e', False)], formalitaet=1, waerme=1, saisons=ALL, anlaesse=['sport'], sportteil='unten_kurz', sportarten=['laufen'])),
    ('laufjacke-wind', lambda: top(hexrgb('#c9ced6'), 'long', 'zip'), dict(kategorie='jacke', bezeichnung='Leichte Windjacke', farben=[('Hellgrau', '#c9ced6', True)], formalitaet=1, waerme=2, saisons=ALL, anlaesse=['sport'], sportteil='windjacke', sportarten=['laufen', 'rad'])),
    ('funktionsunterhemd', lambda: top(hexrgb('#f4f4f4'), 'none', 'crew'), dict(kategorie='oberteil', bezeichnung='Funktionsunterhemd', farben=[('Weiß', '#f4f4f4', True)], formalitaet=1, waerme=2, saisons=ALL, anlaesse=['sport'], sportteil='unterhemd', sportarten=['laufen', 'rad'])),
    ('radtrikot-kurz', lambda: top(hexrgb('#1f8a8a'), 'short', 'zip', extra={'band': hexrgb('#f2f2f2')}), dict(kategorie='oberteil', bezeichnung='Petrol Radtrikot kurzarm', farben=[('Petrol', '#1f8a8a', False)], formalitaet=1, waerme=1, saisons=['fruehling', 'sommer', 'herbst'], anlaesse=['sport'], sportteil='oben_kurz', sportarten=['rad'])),
    ('radtrikot-lang', lambda: top(hexrgb('#8c1d2c'), 'long', 'zip', extra={'band': hexrgb('#1e1e22')}), dict(kategorie='oberteil', bezeichnung='Bordeaux Langarmtrikot', farben=[('Bordeaux', '#8c1d2c', False)], formalitaet=1, waerme=3, saisons=NOT_SUMMER, anlaesse=['sport'], sportteil='oben_lang', sportarten=['rad'])),
    ('radweste', lambda: top(hexrgb('#c6e83a'), 'none', 'zip'), dict(kategorie='jacke', bezeichnung='Neongelbe Windweste', farben=[('Neongelb', '#c6e83a', False)], formalitaet=1, waerme=1, saisons=ALL, anlaesse=['sport'], sportteil='weste', sportarten=['rad', 'laufen'])),
    ('radjacke-winter', lambda: top(hexrgb('#1d1d22'), 'long', 'zip', extra={'band': hexrgb('#ff6a1a')}), dict(kategorie='jacke', bezeichnung='Winter-Radjacke', farben=[('Schwarz', '#1d1d22', True), ('Orange', '#ff6a1a', False)], formalitaet=1, waerme=5, saisons=['winter'], anlaesse=['sport'], sportteil='thermojacke', sportarten=['rad'])),
    ('radjacke-regen', lambda: top(hexrgb('#c4262e'), 'long', 'zip'), dict(kategorie='jacke', bezeichnung='Rote Regenjacke (Rad)', farben=[('Rot', '#c4262e', False)], formalitaet=1, waerme=2, saisons=ALL, anlaesse=['sport'], sportteil='regenjacke', sportarten=['rad', 'laufen'], regenfest=True)),
    ('radhose-kurz', lambda: bib(hexrgb('#18181c')), dict(kategorie='unterteil', bezeichnung='Trägerhose kurz', farben=[('Schwarz', '#18181c', True)], formalitaet=1, waerme=1, saisons=['fruehling', 'sommer', 'herbst'], anlaesse=['sport'], sportteil='unten_kurz', sportarten=['rad'])),
    ('radhose-lang', lambda: bib(hexrgb('#25252b'), True), dict(kategorie='unterteil', bezeichnung='Winter-Trägerhose lang', farben=[('Schwarz', '#25252b', True)], formalitaet=1, waerme=4, saisons=['winter', 'herbst'], anlaesse=['sport'], sportteil='unten_lang', sportarten=['rad'])),
    ('armlinge', lambda: tubes(hexrgb('#1c1c20'), 520, hexrgb('#c6e83a')), dict(kategorie='accessoire', bezeichnung='Armlinge', farben=[('Schwarz', '#1c1c20', True)], formalitaet=1, waerme=3, saisons=NOT_SUMMER, anlaesse=['sport'], sportteil='armlinge', sportarten=['rad', 'laufen'])),
    ('knielinge', lambda: tubes(hexrgb('#1c1c20'), 380), dict(kategorie='accessoire', bezeichnung='Knielinge', farben=[('Schwarz', '#1c1c20', True)], formalitaet=1, waerme=3, saisons=NOT_SUMMER, anlaesse=['sport'], sportteil='knielinge', sportarten=['rad'])),
    ('beinlinge', lambda: tubes(hexrgb('#1c1c20'), 780), dict(kategorie='accessoire', bezeichnung='Beinlinge', farben=[('Schwarz', '#1c1c20', True)], formalitaet=1, waerme=3, saisons=NOT_SUMMER, anlaesse=['sport'], sportteil='beinlinge', sportarten=['rad'])),
    ('handschuhe-kurz', lambda: gloves(hexrgb('#2a2a30'), 'kurz'), dict(kategorie='accessoire', bezeichnung='Kurzfinger-Handschuhe', farben=[('Schwarz', '#2a2a30', True)], formalitaet=1, waerme=1, saisons=['fruehling', 'sommer', 'herbst'], anlaesse=['sport'], sportteil='handschuhe_kurz', sportarten=['rad'])),
    ('handschuhe-lang', lambda: gloves(hexrgb('#3a4250'), 'lang'), dict(kategorie='accessoire', bezeichnung='Langfinger-Handschuhe', farben=[('Grau', '#3a4250', True)], formalitaet=1, waerme=3, saisons=NOT_SUMMER, anlaesse=['sport'], sportteil='handschuhe_lang', sportarten=['rad', 'laufen'])),
    ('handschuhe-winter', lambda: gloves(hexrgb('#18181c'), 'winter'), dict(kategorie='accessoire', bezeichnung='Winterhandschuhe', farben=[('Schwarz', '#18181c', True)], formalitaet=1, waerme=5, saisons=['winter'], anlaesse=['sport'], sportteil='handschuhe_winter', sportarten=['rad', 'laufen'])),
    ('ueberschuhe', lambda: overshoe(hexrgb('#202024')), dict(kategorie='accessoire', bezeichnung='Neopren-Überschuhe', farben=[('Schwarz', '#202024', True)], formalitaet=1, waerme=5, saisons=['herbst', 'winter'], anlaesse=['sport'], sportteil='ueberschuhe', sportarten=['rad'], regenfest=True)),
    ('unterhelmmuetze', lambda: capthin(hexrgb('#3b3f48')), dict(kategorie='accessoire', bezeichnung='Unterhelmmütze', farben=[('Grau', '#3b3f48', True)], formalitaet=1, waerme=3, saisons=NOT_SUMMER, anlaesse=['sport'], sportteil='kopf_duenn', sportarten=['rad', 'laufen'])),
    ('buff', lambda: buff(hexrgb('#2f5d8a')), dict(kategorie='accessoire', bezeichnung='Multifunktionstuch', farben=[('Blau', '#2f5d8a', False)], formalitaet=1, waerme=3, saisons=NOT_SUMMER, anlaesse=['sport'], sportteil='halstuch', sportarten=['rad', 'laufen'])),
    ('radschuhe', lambda: bikeshoe(hexrgb('#f0f0f0')), dict(kategorie='schuhe', bezeichnung='Rennradschuhe', farben=[('Weiß', '#f0f0f0', True)], formalitaet=1, waerme=2, saisons=ALL, anlaesse=['sport'], sportteil='schuhe', sportarten=['rad'])),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = []
    for ident, draw, m in ITEMS:
        draw().save(ident)
        meta.append({
            'demoId': ident, 'datei': ident + '.jpg', 'kategorie': m['kategorie'], 'bezeichnung': m['bezeichnung'],
            'farben': [{'name': n, 'hex': h, 'neutral': nt} for n, h, nt in m['farben']],
            'muster': m.get('muster', 'uni'), 'formalitaet': m['formalitaet'], 'waerme': m['waerme'],
            'saisons': m['saisons'], 'anlaesse': m['anlaesse'], 'regenfest': m.get('regenfest', False),
            'sportteil': m.get('sportteil', 'keins'), 'sportarten': m.get('sportarten', []),
        })
    with open(os.path.join(OUT, 'demo.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(len(meta), 'Beispielteile erzeugt')


if __name__ == '__main__':
    main()
