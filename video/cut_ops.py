#!/usr/bin/env python3
"""把錄好的畫面切掉開場，只留「操作」那段，壓到指定秒數，配上音樂。
用法：python3 video/cut_ops.py [目標秒數=44.5]  → video/ops-only.mp4"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FF = os.path.expanduser('~/.local/bin/ffmpeg'); FP = os.path.expanduser('~/.local/bin/ffprobe')
TARGET = float(sys.argv[1]) if len(sys.argv) > 1 else 44.5
def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE)
    if r.returncode: sys.exit('失敗：' + ' '.join(cmd[:3]) + '\n' + r.stderr[-1200:])
    return r.stdout
rec = json.load(open(os.path.join(HERE, 'rec.json')))
ev = rec['scenario']['events']; total = rec['scenario']['total'] / 1000
start = [e['t'] for e in ev if e['type'] == 'caption'][0] / 1000 - 0.25   # 第一個步驟說明出現前一點點
span = total - start
speed = max(1.0, span / TARGET)
vf = f"trim=start={start:.3f},setpts=(PTS-STARTPTS)/{speed:.4f},fps=30,scale=1920:1080:flags=lanczos,format=yuv420p"
run([FF, '-y', '-f', 'concat', '-safe', '0', '-i', 'rec.txt', '-vf', vf, '-t', f'{TARGET:.2f}', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', 'ops-silent.mp4'])
dur = float(run([FP, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'ops-silent.mp4']).strip())
clicks = ','.join(str(int((e['t'] / 1000 - start) / speed * 1000)) for e in ev if e['type'] == 'click' and e['t'] / 1000 >= start)
print(run(['python3', 'music.py', f'{dur:.2f}', clicks]).strip())
run([FF, '-y', '-i', 'ops-silent.mp4', '-i', 'music.wav', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'ops-only.mp4'])
print('完成 ops-only.mp4', run([FP, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'ops-only.mp4']).strip(), '秒，加速', round(speed, 3), '倍，從', round(start, 1), '秒切起')
