"""
Нарезка карты на тайлы в формате Leaflet CRS.Simple.

Leaflet в CRS.Simple при zoom=Z считает:
  - 1 тайл = tileSize пикселей экрана
  - 1 пиксель экрана = 1 / 2^Z единиц LatLng
  - 1 тайл покрывает tileSize / 2^Z единиц LatLng

Наша карта: lng от 0 до 18000, lat от -15000 до 0
Тайловые координаты Leaflet:
  x = floor(lng * 2^Z / tileSize)
  y = floor(-lat * 2^Z / tileSize)   (lat отрицательный → y положительный)

Зависимости: pip install Pillow
Использование: python tile_cutter.py
"""

import os
import math
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

# Настройки
SOURCE = "../map/full_map.jpg"
OUTPUT = "../map_tiles"
TILE_SIZE = 512

# Размер карты в пикселях (= единицы LatLng)
MAP_W = 18000
MAP_H = 15000

# Зум-уровни Leaflet для которых генерируем тайлы
# При zoom=Z один тайл покрывает TILE_SIZE / 2^Z пикселей карты
# zoom=-2: 1 тайл = 512 / 0.25 = 2048 px карты → вся карта в ~9x7 тайлов
# zoom=-1: 1 тайл = 512 / 0.5 = 1024 px карты → ~18x15 тайлов
# zoom=0:  1 тайл = 512 / 1 = 512 px карты → ~36x30 тайлов
# zoom=1:  1 тайл = 512 / 2 = 256 px карты → ~71x59 тайлов
ZOOM_LEVELS = [-5, -4, -3, -2, -1, 0, 1]

def cut_tiles():
    print(f"Открываем {SOURCE}...")
    img = Image.open(SOURCE)
    orig_w, orig_h = img.size
    print(f"Размер оригинала: {orig_w} x {orig_h}")
    print(f"Размер карты (LatLng): {MAP_W} x {MAP_H}")
    print(f"Размер тайла: {TILE_SIZE} x {TILE_SIZE}")
    print()

    # Очищаем выходную папку
    if os.path.exists(OUTPUT):
        import shutil
        shutil.rmtree(OUTPUT)

    for zoom in ZOOM_LEVELS:
        scale_factor = 2 ** zoom  # сколько пикселей экрана в 1 единице LatLng

        # Один тайл покрывает столько единиц LatLng:
        tile_latlng_size = TILE_SIZE / scale_factor

        # Сколько тайлов нужно
        cols = math.ceil(MAP_W / tile_latlng_size)
        rows = math.ceil(MAP_H / tile_latlng_size)

        # Каждый тайл покрывает tile_latlng_size пикселей карты
        # Нужно вырезать из оригинала область и масштабировать в TILE_SIZE x TILE_SIZE

        # Масштаб: сколько пикселей оригинала в 1 единице LatLng (= 1 пикселе карты)
        px_per_latlng_x = orig_w / MAP_W
        px_per_latlng_y = orig_h / MAP_H

        print(f"Zoom {zoom:+d}: {cols}x{rows} = {cols * rows} тайлов "
              f"(1 тайл = {tile_latlng_size:.0f}x{tile_latlng_size:.0f} ед. карты)")

        # Находим смещение тайловых координат
        # Наша карта: lng от 0 до MAP_W → x от 0 до cols
        # lat от -MAP_H до 0 → y: Leaflet считает y = floor(-lat * 2^Z / TILE_SIZE)
        # При lat=0 (верх карты): y = 0
        # При lat=-MAP_H (низ): y = floor(MAP_H * 2^Z / TILE_SIZE) = rows
        # Но Leaflet начинает x,y от глобального (0,0), поэтому для lng>=0, lat<=0:
        x_offset = 0  # lng начинается с 0
        y_offset = 0  # -lat начинается с 0 (lat от 0 до -MAP_H)

        zoom_dir = os.path.join(OUTPUT, str(zoom))
        os.makedirs(zoom_dir, exist_ok=True)

        count = 0
        total = cols * rows

        for ty in range(rows):
            for tx in range(cols):
                # Область карты (в единицах LatLng = пикселях карты)
                map_x1 = tx * tile_latlng_size
                map_y1 = ty * tile_latlng_size
                map_x2 = min(map_x1 + tile_latlng_size, MAP_W)
                map_y2 = min(map_y1 + tile_latlng_size, MAP_H)

                # Область в пикселях оригинального изображения
                src_x1 = int(map_x1 * px_per_latlng_x)
                src_y1 = int(map_y1 * px_per_latlng_y)
                src_x2 = int(map_x2 * px_per_latlng_x)
                src_y2 = int(map_y2 * px_per_latlng_y)

                # Вырезаем
                crop = img.crop((src_x1, src_y1, src_x2, src_y2))

                # Размер тайла (может быть меньше на краях)
                out_w = int((map_x2 - map_x1) / tile_latlng_size * TILE_SIZE)
                out_h = int((map_y2 - map_y1) / tile_latlng_size * TILE_SIZE)

                if out_w <= 0 or out_h <= 0:
                    continue

                # Масштабируем вырезку в размер тайла
                crop_resized = crop.resize((out_w, out_h), Image.LANCZOS)

                # Создаём тайл (чёрный фон для неполных тайлов)
                tile = Image.new('RGB', (TILE_SIZE, TILE_SIZE), (0, 0, 0))
                tile.paste(crop_resized, (0, 0))

                # Leaflet запрашивает тайлы с глобальными координатами
                # x_global = x_offset + tx, y_global = y_offset + ty
                gx = x_offset + tx
                gy = y_offset + ty

                tile_path = os.path.join(zoom_dir, f"{gx}_{gy}.jpg")
                tile.save(tile_path, "JPEG", quality=85)

                count += 1
                if count % 20 == 0 or count == total:
                    print(f"  [{count}/{total}]")

        print(f"  Готово!")

    print(f"\n✅ Тайлы сохранены в {OUTPUT}/")


if __name__ == "__main__":
    cut_tiles()