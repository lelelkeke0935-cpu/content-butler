#!/usr/bin/env python3
"""把錄下來的畫格接成影片，配上合成的音樂。用法：python3 video/assemble.py"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FF = os.path.expanduser('~/.local/bin/ffmpeg'); FP = os.path.expanduser('~/.local/bin/ffprobe')
LIMIT = 59.5

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE)
    if r.returncode: sys.exit('失敗：' + ' '.join(cmd[:3]) + '\n' + r.stderr[-1200:])
    return r.stdout

rec = json.load(open(os.path.join(HERE, 'rec.json')))
frames = rec['frames']; total = rec['scenario']['total'] / 1000
t0 = frames[0]['t']
lines = []
for i, f in enumerate(frames):
    t = f['t'] - t0
    nxt = (frames[i + 1]['t'] - t0) if i + 1 < len(frames) else max(total, t + 0.5)
    lines.append(f"file 'rec/f{f['n']:05d}.jpg'\nduration {max(1 / 60, nxt - t):.4f}")
lines.append(f"file 'rec/f{frames[-1]['n']:05d}.jpg'")
open(os.path.join(HERE, 'rec.txt'), 'w').write('\n'.join(lines) + '\n')
speed = max(1.0, total / LIMIT)   # 超過一分鐘就整體稍微加快
vf = f"setpts=PTS/{speed:.4f},fps=30,scale=1920:1080:flags=lanczos,format=yuv420p"
run([FF, '-y', '-f', 'concat', '-safe', '0', '-i', 'rec.txt', '-vf', vf, '-t', '59.8', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', 'silent.mp4'])
dur = float(run([FP, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'silent.mp4']).strip())
clicks = ','.join(str(int(e['t'] / speed)) for e in rec['scenario']['events'] if e['type'] == 'click')
print(run(['python3', 'music.py', f'{dur:.2f}', clicks]).strip())
out = 'content-butler-demo.mp4'
run([FF, '-y', '-i', 'silent.mp4', '-i', 'music.wav', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out])
print('完成', out, run([FP, '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'default=nw=1', out]).replace('\n', ' '), f'畫格 {len(frames)}，加速 {speed:.3f} 倍')
