#!/usr/bin/env python3
"""生成微信小程序TabBar图标"""
import base64
from PIL import Image, ImageDraw, ImageFont

def create_icon(text, filename):
    """创建带文字的图标"""
    img = Image.new('RGBA', (81, 81), (245, 240, 224, 255))  # #f5f0e0 背景
    draw = ImageDraw.Draw(img)

    # 画圆角矩形
    draw.rounded_rectangle([(5, 5), (76, 76)], radius=15, fill=(196, 168, 130, 255))  # #c4a882

    # 绘制文字（简化版，直接用emoji字符）
    try:
        font = ImageFont.truetype("seguiemj.ttf", 40)
    except:
        font = ImageFont.load_default()

    # 文字位置居中
    draw.text((20, 20), text, fill=(90, 61, 0, 255), font=font)

    img.save(filename)
    print(f"Created: {filename}")

# 创建通知图标 (未选中/选中)
create_icon("📮", "campus-wall-miniprogram/icons/notice.png")
create_icon("📮", "campus-wall-miniprogram/icons/notice-active.png")

# 创建我的图标 (未选中/选中)
create_icon("👤", "campus-wall-miniprogram/icons/user.png")
create_icon("👤", "campus-wall-miniprogram/icons/user-active.png")