#!/usr/bin/env python3
"""生成微信小程序TabBar图标 — 用几何图形代替emoji，保证清晰显示"""
from PIL import Image, ImageDraw

SIZE = 81
PAD = 8
BODY = SIZE - PAD * 2  # 绘图区域边长

BG = (245, 240, 224, 255)    # 背景色 #f5f0e0
COLOR_NORMAL = (139, 115, 85, 255)   # 未选中 #8b7355
COLOR_ACTIVE = (90, 61, 0, 255)     # 选中 #5a3d00


def draw_bell(draw: ImageDraw, color):
    """画一个铃铛图标"""
    cx, cy = SIZE // 2, PAD + 2  # 顶部中心
    w, h = BODY * 0.7, BODY * 0.6
    x1 = cx - w // 2
    y1 = cy
    x2 = cx + w // 2
    y2 = cy + h

    # 铃铛主体（上半弧 + 矩形）
    draw.pieslice([x1, y1, x2, y2 * 1.5], start=0, end=180, fill=color)
    draw.rectangle([x1, y1 + h * 0.4, x2, y2], fill=color)

    # 底部边沿（小矩形）
    edge_y = y2
    draw.rectangle([cx - w * 0.55, edge_y, cx + w * 0.55, edge_y + 3], fill=color)

    # 铃舌（小圆）
    draw.ellipse([cx - 3, edge_y + 4, cx + 3, edge_y + 10], fill=color)


def draw_user(draw: ImageDraw, color):
    """画一个人物图标"""
    cx = SIZE // 2

    # 头（圆）
    head_r = BODY * 0.22
    draw.ellipse([
        cx - head_r, PAD + 4,
        cx + head_r, PAD + 4 + head_r * 2
    ], fill=color)

    # 身体（梯形）
    body_top = PAD + 4 + head_r * 2 + 2
    body_bottom = SIZE - PAD - 2
    shoulder_w = BODY * 0.45
    bottom_w = BODY * 0.7
    draw.polygon([
        (cx - shoulder_w // 2, body_top),
        (cx + shoulder_w // 2, body_top),
        (cx + bottom_w // 2, body_bottom),
        (cx - bottom_w // 2, body_bottom),
    ], fill=color)


def create_icon(draw_fn, filename, color):
    img = Image.new('RGBA', (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(img)
    draw_fn(draw, color)
    img.save(filename)
    print(f"Created: {filename}")


# === 通知图标 ===
create_icon(draw_bell, "icons/notice.png", COLOR_NORMAL)
create_icon(draw_bell, "icons/notice-active.png", COLOR_ACTIVE)

# === 我的图标 ===
create_icon(draw_user, "icons/user.png", COLOR_NORMAL)
create_icon(draw_user, "icons/user-active.png", COLOR_ACTIVE)
