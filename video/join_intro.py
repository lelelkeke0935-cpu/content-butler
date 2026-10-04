#!/usr/bin/env python3
"""把隊伍自己錄的自我介紹（任何手機影片）接在操作動畫前面，總長壓在 60 秒內。
用法：python3 video/join_intro.py <自我介紹影片路徑> [介紹最長秒數=15]  → video/final-with-intro.mp4"""
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FF = os.path.expanduser('~/.local/bin/ffmpeg'); FP = os.path.expanduser('~/.local/bin/ffprobe')
src = sys.argv[1]; cap = float(sys.argv[2]) if len(sys.argv) > 2 else 15.0
def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE)
    if r.returncode: sys.exit('失敗：' + ' '.join(cmd[:3]) + '\n' + r.stderr[-1500:])
    return r.stdout
dur = min(cap, float(run([FP, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]).strip()))
has_audio = bool(run([FP, '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', src]).strip())
# 直式或其他比例：畫面置中，背景用同一段影片放大模糊，不會有黑邊
vf = ("[0:v]split[a][b];[a]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=30:5,eq=brightness=-0.08[bg];"
      "[b]scale=1920:1080:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30,format=yuv420p,"
      f"fade=t=out:st={dur - 0.3:.2f}:d=0.3[v]")
cmd = [FF, '-y', '-i', src]
if not has_audio: cmd += ['-f', 'lavfi', '-t', f'{dur:.2f}', '-i', 'anullsrc=r=44100:cl=stereo']
af = ('[0:a]' if has_audio else '[1:a]') + f"aresample=44100,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5,afade=t=out:st={dur - 0.3:.2f}:d=0.3[a]"
run(cmd + ['-filter_complex', vf + ';' + af, '-map', '[v]', '-map', '[a]', '-t', f'{dur:.2f}', '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2', 'intro-norm.mp4'])
run([FF, '-y', '-i', 'ops-only.mp4', '-vf', 'fade=t=in:st=0:d=0.3', '-af', 'aresample=44100,aformat=channel_layouts=stereo,afade=t=in:st=0:d=0.4', '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2', 'ops-norm.mp4'])
open(os.path.join(HERE, 'join.txt'), 'w').write("file 'intro-norm.mp4'\nfile 'ops-norm.mp4'\n")
run([FF, '-y', '-f', 'concat', '-safe', '0', '-i', 'join.txt', '-c', 'copy', '-t', '59.9', '-movflags', '+faststart', 'final-with-intro.mp4'])
print('完成 final-with-intro.mp4', run([FP, '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'default=nw=1', 'final-with-intro.mp4']).replace('\n', ' '), '｜介紹', round(dur, 1), '秒')
