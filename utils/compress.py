"""
utils/compress.py

Image optimization helpers: resize, convert to webp, and quality control.
Used before upload to cloud storage to minimize footprint.
"""
from PIL import Image
import os
import io


def optimize_image(input_path, output_path=None, max_width=1200, quality=80, to_webp=True):
    output_path = output_path or input_path
    img = Image.open(input_path)
    # resize if wide
    w, h = img.size
    if w > max_width:
        new_h = int(max_width * h / w)
        img = img.resize((max_width, new_h), Image.LANCZOS)
    # convert
    if to_webp:
        out = os.path.splitext(output_path)[0] + '.webp'
        img.save(out, 'WEBP', quality=quality, method=6)
        return out
    else:
        img.save(output_path, optimize=True, quality=quality)
        return output_path


if __name__ == '__main__':
    import sys
    p = sys.argv[1]
    print('Optimizing', p)
    print(optimize_image(p))
