from PIL import Image, ImageDraw
import numpy as np
import os

def create_icon(size):
    arr = np.zeros((size, size, 4), dtype=np.uint8)
    radius = int(size * 0.22)

    yy, xx = np.meshgrid(np.arange(size), np.arange(size), indexing='ij')
    t = (xx + yy) / (2 * size)
    arr[:, :, 0] = (10 + (35 - 10) * t).astype(np.uint8)
    arr[:, :, 1] = (25 + (95 - 25) * t).astype(np.uint8)
    arr[:, :, 2] = (55 + (175 - 55) * t).astype(np.uint8)
    arr[:, :, 3] = 255

    corners = [(radius, radius), (size - radius, radius),
               (radius, size - radius), (size - radius, size - radius)]
    for cx, cy in corners:
        dx = np.clip(np.abs(xx - cx) - (radius if cx in (radius, size - radius) else 0), 0, radius)
        dy = np.clip(np.abs(yy - cy) - (radius if cy in (radius, size - radius) else 0), 0, radius)
        dist = np.sqrt(dx**2 + dy**2)
        mask = (np.abs(xx - cx) < radius) & (np.abs(yy - cy) < radius) & (dist > radius)
        arr[mask, 3] = 0

    img = Image.fromarray(arr, 'RGBA')
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2

    for i in range(3):
        r = int(size * (0.28 + i * 0.07))
        alpha = max(0, 80 - i * 25)
        bbox = [cx - r, cy - r, cx + r, cy + r]
        draw.arc(bbox, 200, 340, fill=(255, 255, 255, alpha), width=max(2, size // 80))

    pad_w = int(size * 0.32)
    pad_h = int(size * 0.16)
    px = cx - pad_w // 2
    py = cy - pad_h // 2
    pr = int(pad_h * 0.45)
    draw.rounded_rectangle([px, py, px + pad_w, py + pad_h], radius=pr, fill=(255, 255, 255, 255))

    grip_r = int(size * 0.075)
    grip_offset = int(size * 0.02)
    for side in [-1, 1]:
        gx = px + (0 if side < 0 else pad_w) + side * grip_offset
        gy = cy
        draw.ellipse([gx - grip_r, gy - grip_r, gx + grip_r, gy + grip_r],
                     fill=(255, 255, 255, 255))

    cross_x = px + int(pad_w * 0.22)
    cross_y = cy
    cs = int(size * 0.035)
    ct = max(2, int(size * 0.012))
    draw.rectangle([cross_x - cs, cross_y - ct, cross_x + cs, cross_y + ct], fill=(20, 50, 100, 255))
    draw.rectangle([cross_x - ct, cross_y - cs, cross_x + ct, cross_y + cs], fill=(20, 50, 100, 255))

    btn_x = px + int(pad_w * 0.78)
    btn_y = cy
    btn_r = int(size * 0.022)
    draw.ellipse([btn_x - btn_r, btn_y - btn_r, btn_x + btn_r, btn_y + btn_r],
                 fill=(20, 50, 100, 255))

    return img

icon_dir = os.path.dirname(os.path.abspath(__file__))
master = create_icon(512)

for sz in [32, 64, 128, 256]:
    name = f"{sz}x{sz}.png" if sz <= 128 else "128x128@2x.png"
    master.resize((sz, sz), Image.LANCZOS).save(os.path.join(icon_dir, name))

master.resize((256, 256), Image.LANCZOS).save(os.path.join(icon_dir, "icon.png"))

ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
master.resize((256, 256), Image.LANCZOS).save(os.path.join(icon_dir, "icon.ico"), format='ICO', sizes=ico_sizes)

with open(os.path.join(icon_dir, "gen_done.txt"), "w") as f:
    f.write("done")