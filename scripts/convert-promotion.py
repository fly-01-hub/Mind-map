"""Encode the actual browser recording for GitHub and verify its basic format."""
from pathlib import Path
import subprocess
import imageio_ffmpeg
from PIL import Image

output = Path(__file__).resolve().parents[1] / "release" / "promotion"
assets = output / "public" / "assets"
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
source = output / "demo-raw.webm"
subprocess.run([ffmpeg, "-y", "-sseof", "-30", "-i", str(source), "-an", "-vf", "scale=1280:800", "-c:v", "libx264", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(assets / "demo.mp4")], check=True, capture_output=True)
subprocess.run([ffmpeg, "-y", "-i", str(assets / "demo.mp4"), "-filter_complex", "fps=8,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3", "-loop", "0", str(assets / "demo.gif")], check=True, capture_output=True)
subprocess.run([ffmpeg, "-y", "-ss", "18", "-i", str(assets / "demo.mp4"), "-frames:v", "1", str(output / "video-preview.png")], check=True, capture_output=True)
with Image.open(assets / "demo.gif") as gif:
    assert gif.n_frames > 100
    duration = 0
    for index in range(gif.n_frames):
        gif.seek(index)
        duration += gif.info.get("duration", 0)
    print(f"GIF: {gif.size}, {gif.n_frames} frames, {duration / 1000:.1f} seconds")
for file in assets.iterdir():
    print(f"{file.name}: {file.stat().st_size} bytes")
