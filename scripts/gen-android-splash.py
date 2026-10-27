"""Usage: pip install fonttools brotli && python scripts/gen-android-splash.py [preview.svg]

Generate the native splash from the web <Splash> (app/components/Splash.tsx): dashed
ring, SOLOTRACKR wordmark + tagline, the S badge on the ring, ambient glow. Text is
outlined from the app's own font (Geist 900 + the browser's synthetic oblique), so no
font is needed at runtime. Writes three drawables into res/drawable:

  splash_web_icon.xml   static vector; named groups: stage > glow, ring, word, orbit > badge
  splash_web_intro.xml  AnimatedVector: the web's pop-in + wordmark rise (Android 12 launch window)
  splash_web_anim.xml   AnimatedVector: what keeps moving on the web - the S orbiting the ring
                        (staying upright), the ring turning, the glow breathing
                        (Capacitor splash overlay, until the app has painted)

The intro ends in, and the loop starts from, the exact pose of the static icon, so the
hand-offs between the three are invisible.
"""
import math
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "node_modules/next/dist/next-devtools/server/font/geist-latin.woff2")  # Geist, variable weight
RES = os.path.join(ROOT, "android/app/src/main/res/drawable")
OUT_SVG = sys.argv[1] if len(sys.argv) > 1 else None  # optional: also write a preview SVG here

# Canvas: 288dp. Android 12's launch splash only shows the middle 192dp circle, so
# everything is scaled (S) to stay inside it. All sizes below are the web values.
CANVAS = 288.0
C = CANVAS / 2
S = 0.75
RING_R = 96 * S
BADGE = 48 * S
SKEW = 0.25  # synthetic oblique (what browsers do for font-style: italic on a font without one)

font = instantiateVariableFont(TTFont(FONT), {"wght": 900}, inplace=False)
gs = font.getGlyphSet()
cmap = font.getBestCmap()
hmtx = font["hmtx"]
upm = font["head"].unitsPerEm
CAP = 0.71  # Geist cap height / em (approx; used only for vertical centring)


def run(text, size, tracking_em, x0=None, cx=None, baseline=0.0, skew=SKEW):
    """Return [(char, svgpath)], laid out left-to-right; centred on cx if given."""
    scale = size / upm
    advances = []
    for ch in text:
        g = cmap[ord(ch)]
        advances.append(hmtx[g][0] * scale + tracking_em * size)
    width = sum(advances) - tracking_em * size  # no trailing tracking
    x = (cx - width / 2) if cx is not None else x0
    out = []
    for ch, adv in zip(text, advances):
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs, ntos=lambda v: ("%.2f" % v).rstrip("0").rstrip("."))
        tp = TransformPen(pen, (scale, 0, skew * scale, -scale, x, baseline))
        gs[g].draw(tp)
        d = pen.getCommands()
        if d:
            out.append((ch, d))
        x += adv
    return out, width


paths = []  # (name, d, fill)

# ── wordmark (centre of the stage) ───────────────────────────────────────────
s1 = 24 * S           # SoloTrackr
s2 = 10 * S           # tagline
block_h = 24 + 8 + 15  # px at web scale: line1 + gap + line2 (line-height 1.5)
top = -block_h / 2 * S
line1_mid = top + 12 * S
line2_mid = top + (24 + 8 + 7.5) * S
base1 = C + line1_mid + CAP * s1 / 2
base2 = C + line2_mid + CAP * s2 / 2

solo, w_solo = run("SOLO", s1, -0.05, x0=0, baseline=base1)
trackr, w_trackr = run("TRACKR", s1, -0.05, x0=0, baseline=base1)
total = w_solo + (-0.05 * s1) + w_trackr + 0  # SOLO + (tracking after O) + TRACKR
# recompute with correct join: letters are one run in the web ("Solo" + span)
word, w_word = run("SOLOTRACKR", s1, -0.05, cx=C, baseline=base1)
for i, (ch, d) in enumerate(word):
    paths.append((f"wm{i}", d, "#FFFFFF" if i < 4 else "#3B82F6"))

tag, _ = run("ALL MARKETS \u00b7 ONE PLACE", s2, 0.30, cx=C, baseline=base2)
for i, (ch, d) in enumerate(tag):
    paths.append((f"tg{i}", d, "#71717A"))

# ── S badge on the ring (top) ────────────────────────────────────────────────
bx, by = C, C - RING_R
bl, bt = bx - BADGE / 2, by - BADGE / 2
r = 16 * S  # rounded-2xl
badge_d = (f"M{bl + r:.2f},{bt:.2f}H{bl + BADGE - r:.2f}A{r:.2f},{r:.2f} 0 0 1 {bl + BADGE:.2f},{bt + r:.2f}"
           f"V{bt + BADGE - r:.2f}A{r:.2f},{r:.2f} 0 0 1 {bl + BADGE - r:.2f},{bt + BADGE:.2f}"
           f"H{bl + r:.2f}A{r:.2f},{r:.2f} 0 0 1 {bl:.2f},{bt + BADGE - r:.2f}"
           f"V{bt + r:.2f}A{r:.2f},{r:.2f} 0 0 1 {bl + r:.2f},{bt:.2f}Z")
s_size = 24 * S
sg, sw = run("S", s_size, 0.0, cx=bx, baseline=by + CAP * s_size / 2)
s_d = sg[0][1]

# ── dashed ring: 50 short round-capped arcs (VectorDrawable has no dash support) ─
N = 50
sweep = 3 / 96.0  # radians (web: dash 3 of r=96)
ring = []
for i in range(N):
    a0 = i * 2 * math.pi / N - math.pi / 2
    a1 = a0 + sweep
    x0, y0 = C + RING_R * math.cos(a0), C + RING_R * math.sin(a0)
    x1, y1 = C + RING_R * math.cos(a1), C + RING_R * math.sin(a1)
    ring.append(f"M{x0:.2f},{y0:.2f}A{RING_R:.2f},{RING_R:.2f} 0 0 1 {x1:.2f},{y1:.2f}")
ring_d = "".join(ring)

# ── drawables ───────────────────────────────────────────────────────────────
HDR = '<?xml version="1.0" encoding="utf-8"?>\n'


def static_icon():
    x = [HDR + "<!-- GENERATED by scripts/gen-android-splash.py from the web <Splash>. Do not edit by hand.\n"
         "     Static pose; see splash_web_intro / splash_web_anim for the motion. -->"]
    x.append('<vector xmlns:android="http://schemas.android.com/apk/res/android"')
    x.append('    xmlns:aapt="http://schemas.android.com/aapt"')
    x.append(f'    android:width="{CANVAS:.0f}dp" android:height="{CANVAS:.0f}dp"')
    x.append(f'    android:viewportWidth="{CANVAS:.0f}" android:viewportHeight="{CANVAS:.0f}">')
    x.append(f'  <group android:name="stage" android:pivotX="{C:.0f}" android:pivotY="{C:.0f}">')

    # ambient glow (web: opacity breathes 0.45 <-> 0.9; the pose at t=0 is 0.45)
    x.append(f'    <group android:name="glow" android:pivotX="{C:.0f}" android:pivotY="{C:.0f}">')
    x.append('      <path android:name="glowPath" android:fillAlpha="0.45"')
    x.append('          android:pathData="M{0:.0f},{1:.0f}m-130,0a130,130 0 1,0 260,0a130,130 0 1,0 -260,0">'.format(C, C))
    x.append('        <aapt:attr name="android:fillColor">')
    x.append(f'          <gradient android:type="radial" android:centerX="{C:.0f}" android:centerY="{C:.0f}" android:gradientRadius="130">')
    x.append('            <item android:offset="0" android:color="#2E2563EB" />')
    x.append('            <item android:offset="1" android:color="#002563EB" />')
    x.append('          </gradient>')
    x.append('        </aapt:attr>')
    x.append('      </path>')
    x.append('    </group>')

    # dashed ring (turns on the web: spin 18s linear infinite)
    x.append(f'    <group android:name="ring" android:pivotX="{C:.0f}" android:pivotY="{C:.0f}">')
    x.append(f'      <path android:pathData="{ring_d}" android:strokeWidth="{2 * S:.2f}" android:strokeLineCap="round">')
    x.append('        <aapt:attr name="android:strokeColor">')
    x.append(f'          <gradient android:type="linear" android:startX="{C - RING_R:.1f}" android:startY="{C - RING_R:.1f}" android:endX="{C + RING_R:.1f}" android:endY="{C + RING_R:.1f}">')
    x.append('            <item android:offset="0" android:color="#8C3B82F6" />')
    x.append('            <item android:offset="1" android:color="#8C6366F1" />')
    x.append('          </gradient>')
    x.append('        </aapt:attr>')
    x.append('      </path>')
    x.append('    </group>')

    # wordmark + tagline (rises in on the web)
    x.append('    <group android:name="word">')
    for name, d, fill in paths:
        x.append(f'      <path android:fillColor="{fill}" android:pathData="{d}" />')
    x.append('    </group>')

    # orbiting S badge: the outer group turns around the ring centre, the inner group
    # turns the opposite way about the badge's own centre so the S stays upright
    x.append(f'    <group android:name="orbit" android:pivotX="{C:.0f}" android:pivotY="{C:.0f}">')
    x.append(f'      <group android:name="badge" android:pivotX="{bx:.2f}" android:pivotY="{by:.2f}">')
    x.append(f'        <path android:pathData="{badge_d}">')
    x.append('          <aapt:attr name="android:fillColor">')
    x.append(f'            <gradient android:type="linear" android:startX="{bl:.1f}" android:startY="{bt:.1f}" android:endX="{bl + BADGE:.1f}" android:endY="{bt + BADGE:.1f}">')
    x.append('              <item android:offset="0" android:color="#2563EB" />')
    x.append('              <item android:offset="1" android:color="#4F46E5" />')
    x.append('            </gradient>')
    x.append('          </aapt:attr>')
    x.append('        </path>')
    x.append(f'        <path android:fillColor="#FFFFFF" android:pathData="{s_d}" />')
    x.append('      </group>')
    x.append('    </group>')
    x.append('  </group>')
    x.append('</vector>')
    return "\n".join(x) + "\n"


LINEAR = "@android:interpolator/linear"
EASE_IO = "@android:interpolator/accelerate_decelerate"   # css ease-in-out
DECEL = "@android:interpolator/decelerate_cubic"          # strong ease-out, like cubic-bezier(.16,1,.3,1)


def anim(prop, a, b, dur, interp, repeat=None, mode=None, start=None, pad="        "):
    attrs = [f'android:propertyName="{prop}"', f'android:valueFrom="{a}"', f'android:valueTo="{b}"',
             f'android:duration="{dur}"', f'android:interpolator="{interp}"', 'android:valueType="floatType"']
    if repeat is not None:
        attrs.append(f'android:repeatCount="{repeat}"')
    if mode:
        attrs.append(f'android:repeatMode="{mode}"')
    if start:
        attrs.append(f'android:startOffset="{start}"')
    return pad + "<objectAnimator " + " ".join(attrs) + " />"


def target(name, body):
    return (f'  <target android:name="{name}">\n    <aapt:attr name="android:animation">\n{body}\n    </aapt:attr>\n  </target>')


def avd(note, targets):
    return (HDR + "<!--\n" + note + "\n-->\n"
            '<animated-vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
            '    xmlns:aapt="http://schemas.android.com/aapt"\n'
            '    android:drawable="@drawable/splash_web_icon">\n' + "\n".join(targets) + "\n</animated-vector>\n")


def loop_targets():
    t = []
    # S orbits once per ~3 s (web: 0.0021 rad/ms) and stays upright
    t.append(target("orbit", anim("rotation", 0, 360, 3000, LINEAR, repeat=-1)))
    t.append(target("badge", anim("rotation", 0, -360, 3000, LINEAR, repeat=-1)))
    # ring turns once per 18 s
    t.append(target("ring", anim("rotation", 0, 360, 18000, LINEAR, repeat=-1)))
    # glow breathes: opacity 0.45 <-> 0.9 and scale 1 <-> 1.18 over 3 s (1.5 s each way)
    t.append(target("glowPath", anim("fillAlpha", 0.45, 0.9, 1500, EASE_IO, repeat=-1, mode="reverse")))
    t.append(target("glow", '      <set android:ordering="together">\n'
                    + anim("scaleX", 1, 1.18, 1500, EASE_IO, repeat=-1, mode="reverse", pad="        ") + "\n"
                    + anim("scaleY", 1, 1.18, 1500, EASE_IO, repeat=-1, mode="reverse", pad="        ") + "\n      </set>"))
    return t


def loop_drawable():
    return avd("  Keeps moving like the web splash (Capacitor overlay): the S orbits the ring and\n"
               "  stays upright, the ring turns, the glow breathes. Starts in the static pose.\n"
               "  GENERATED by scripts/gen-android-splash.py.", loop_targets())


def intro_targets():
    t = []
    # splash-pop 0.6s: scale .82 -> 1.04 (60%) -> 1
    body = ('      <set android:ordering="sequentially">\n'
            '        <set android:ordering="together">\n'
            + anim("scaleX", 0.82, 1.04, 360, DECEL, pad="          ") + "\n"
            + anim("scaleY", 0.82, 1.04, 360, DECEL, pad="          ") + "\n"
            '        </set>\n'
            '        <set android:ordering="together">\n'
            + anim("scaleX", 1.04, 1, 240, EASE_IO, pad="          ") + "\n"
            + anim("scaleY", 1.04, 1, 240, EASE_IO, pad="          ") + "\n"
            '        </set>\n'
            '      </set>')
    t.append(target("stage", body))
    # splash-rise 0.7s after 0.15s: wordmark slides up 10px
    t.append(target("word", anim("translateY", 10 * S, 0, 700, DECEL, start=150, pad="      ")))
    return t


def intro_drawable():
    return avd("  Launch-window intro: the web's pop-in and wordmark rise. Ends in the static pose.\n"
               "  GENERATED by scripts/gen-android-splash.py.", intro_targets())


def launch_drawable():
    # Android 12+ keeps ONE drawable (the theme's animated icon) on screen until the app
    # is ready, so it has to do the intro and then keep moving by itself.
    return avd("  Android 12+ launch screen: the web's pop-in + wordmark rise, then the S keeps\n"
               "  orbiting (upright), the ring turns and the glow breathes until the app is ready.\n"
               "  GENERATED by scripts/gen-android-splash.py.", intro_targets() + loop_targets())


def write(name, text):
    with open(os.path.join(RES, name), "w", encoding="utf-8") as f:
        f.write(text)


write("splash_web_icon.xml", static_icon())
write("splash_web_anim.xml", loop_drawable())
write("splash_web_intro.xml", intro_drawable())
write("splash_web_launch.xml", launch_drawable())

if OUT_SVG:
    v = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS:.0f} {CANVAS:.0f}" width="576" height="576">',
         '<defs><radialGradient id="g" cx="50%" cy="50%" r="45%"><stop offset="0" stop-color="#2563eb" stop-opacity=".18"/><stop offset="1" stop-color="#2563eb" stop-opacity="0"/></radialGradient>',
         '<linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#6366f1"/></linearGradient>',
         '<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#4f46e5"/></linearGradient></defs>',
         f'<rect width="{CANVAS:.0f}" height="{CANVAS:.0f}" fill="#050505"/>',
         f'<circle cx="{C}" cy="{C}" r="130" fill="url(#g)" opacity=".45"/>',
         f'<path d="{ring_d}" fill="none" stroke="url(#r)" stroke-opacity=".55" stroke-width="{2 * S:.2f}" stroke-linecap="round"/>']
    for name, d, fill in paths:
        v.append(f'<path d="{d}" fill="{fill}"/>')
    v.append(f'<path d="{badge_d}" fill="url(#b)"/><path d="{s_d}" fill="#fff"/></svg>')
    open(OUT_SVG, "w", encoding="utf-8").write("".join(v))

print("wordmark width dp: %.1f (ring inner diameter %.1f)" % (w_word, RING_R * 2))
print("wrote splash_web_icon / splash_web_anim / splash_web_intro")
