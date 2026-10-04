#!/usr/bin/env python3
"""用程式合成一段輕快的配樂（沒有任何取樣或現成音樂，無版權顧慮）。
用法：python3 video/music.py 秒數 [點擊時間毫秒,以逗號分隔]  → video/music.wav"""
import math, random, struct, sys, wave, os
from array import array

SR = 44100
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 60.0
CLICKS = [int(x) / 1000 for x in sys.argv[2].split(',')] if len(sys.argv) > 2 and sys.argv[2] else []
BPM = 112
BEAT = 60 / BPM
N = int(SR * DUR)
buf = array('f', [0.0]) * N
random.seed(7)

def freq(n):  # MIDI 音高 → 頻率
    return 440.0 * 2 ** ((n - 69) / 12)

def add(samples, at, gain=1.0):
    i0 = int(at * SR)
    for i, v in enumerate(samples):
        j = i0 + i
        if j >= N: break
        buf[j] += v * gain

def pluck(n, dur=0.42, bright=0.35):  # 木琴感的短音
    f = freq(n); out = array('f')
    for i in range(int(dur * SR)):
        t = i / SR
        env = math.exp(-t * 9.5) * min(1.0, t * 400)
        out.append(env * (math.sin(2 * math.pi * f * t) + bright * math.sin(2 * math.pi * 2 * f * t) * math.exp(-t * 14) + 0.12 * math.sin(2 * math.pi * 4 * f * t) * math.exp(-t * 25)))
    return out

def bass(n, dur=0.5):
    f = freq(n); out = array('f')
    for i in range(int(dur * SR)):
        t = i / SR
        env = math.exp(-t * 4.2) * min(1.0, t * 250)
        out.append(env * (math.sin(2 * math.pi * f * t) + 0.25 * math.sin(2 * math.pi * 2 * f * t)))
    return out

def kick():
    out = array('f')
    for i in range(int(0.16 * SR)):
        t = i / SR
        f = 52 + 90 * math.exp(-t * 38)
        out.append(math.exp(-t * 20) * math.sin(2 * math.pi * f * t))
    return out

def shaker(dur=0.045):
    out = array('f'); prev = 0.0
    for i in range(int(dur * SR)):
        t = i / SR
        x = random.uniform(-1, 1); hp = x - prev; prev = x
        out.append(hp * math.exp(-t * 70) * 0.5)
    return out

def clap():
    out = array('f'); prev = 0.0
    for i in range(int(0.11 * SR)):
        t = i / SR
        x = random.uniform(-1, 1); hp = x - 0.6 * prev; prev = x
        out.append(hp * math.exp(-t * 32) * (0.6 + 0.4 * math.sin(2 * math.pi * 1100 * t)))
    return out

def tick():  # 游標點擊聲
    out = array('f')
    for i in range(int(0.05 * SR)):
        t = i / SR
        out.append(math.exp(-t * 90) * (math.sin(2 * math.pi * 1900 * t) + 0.5 * math.sin(2 * math.pi * 2850 * t)))
    return out

# C 大調，四個和弦輪流：C、Am、F、G
CHORDS = [(48, [60, 64, 67, 72]), (45, [57, 60, 64, 69]), (41, [53, 57, 60, 65]), (43, [55, 59, 62, 67])]
ARP = [0, 2, 1, 3, 2, 1, 3, 2]  # 八分音符的琶音順序
MELODY = [[76, None, 79, 76, None, 72, 74, None], [72, None, 76, 72, None, 69, 72, None], [69, None, 72, 77, None, 76, 72, None], [74, None, 79, 74, None, 71, 74, 76]]

cache = {}
def note(kind, n):
    key = (kind, n)
    if key not in cache:
        cache[key] = pluck(n) if kind == 'p' else pluck(n, 0.55, 0.2) if kind == 'm' else bass(n)
    return cache[key]

K, S, C = kick(), shaker(), clap()
bars = int(DUR / (4 * BEAT)) + 1
for b in range(bars):
    root, tones = CHORDS[b % 4]
    t0 = b * 4 * BEAT
    full = b >= 2            # 前兩小節只有琶音，之後鼓和貝斯進來
    lead = b >= 4 and (b // 4) % 2 == 0 or b >= 12  # 旋律隔段出現
    for e in range(8):
        t = t0 + e * BEAT / 2
        add(note('p', tones[ARP[e]]), t, 0.20)
        if full:
            add(S, t, 0.16 if e % 2 else 0.09)
            if e in (0, 4): add(K, t, 0.55)
            if e in (2, 6): add(C, t, 0.13)
            if e in (0, 3, 4, 6): add(note('b', root if e != 3 else root + 7), t, 0.30)
        if lead and MELODY[b % 4][e] is not None:
            add(note('m', MELODY[b % 4][e]), t, 0.17)

T = tick()
for c in CLICKS:
    add(T, c, 0.5)

# 淡入淡出、壓到不破音
fade_in, fade_out = int(0.4 * SR), int(2.2 * SR)
peak = max(abs(v) for v in buf) or 1.0
out = array('h')
for i, v in enumerate(buf):
    g = 0.82 / peak
    if i < fade_in: g *= i / fade_in
    if i > N - fade_out: g *= max(0.0, (N - i) / fade_out)
    s = max(-1.0, min(1.0, math.tanh(v * g * 1.25)))
    out.append(int(s * 32000)); out.append(int(s * 32000))
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'music.wav')
with wave.open(path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('配樂完成', path, round(DUR, 1), '秒，點擊聲', len(CLICKS), '個')
