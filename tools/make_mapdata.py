"""国土地理院の標高タイル（DEM10B）から、各章の地形データ src/scenes/mapdata.js を作る。

  python tools/make_mapdata.py

- 標高：国土地理院 標高タイル (https://maps.gsi.go.jp/development/ichiran.html) 出典：国土地理院
- 海岸線の確認には OpenStreetMap（© OpenStreetMap contributors）を参照した。
座標は「別府港 第1ターミナル」を原点に、x=東、z=南（m）。各舞台はそこからさらに原点をずらして使う。
"""
import base64, json, math, os, urllib.request
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache')
OUT = os.path.join(HERE, '..', 'src', 'scenes', 'mapdata.js')
LAT0, LON0 = 36.1076638, 133.0415524  # 別府港
KX = 111320 * math.cos(math.radians(LAT0)); KZ = 110574


def fetch(z, x, y):
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, f'{z}_{x}_{y}.txt')
    if os.path.exists(fn):
        return open(fn).read()
    url = f'https://cyberjapandata.gsi.go.jp/xyz/dem/{z}/{x}/{y}.txt'
    try:
        s = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'godaigo-vr-dev/1.0'}), timeout=30).read().decode()
    except Exception:
        s = ''  # 海だけのタイルは存在しない
    open(fn, 'w').write(s)
    return s


class Dem:
    def __init__(self, z, lon_a, lon_b, lat_a, lat_b):
        self.z = z
        n = 2 ** z
        self.tx0 = int((lon_a + 180) / 360 * n); tx1 = int((lon_b + 180) / 360 * n)
        self.ty0 = int(self._ty(lat_b)); ty1 = int(self._ty(lat_a))
        W = (tx1 - self.tx0 + 1) * 256; H = (ty1 - self.ty0 + 1) * 256
        self.E = np.full((H, W), np.nan, np.float32)
        for tx in range(self.tx0, tx1 + 1):
            for ty in range(self.ty0, ty1 + 1):
                s = fetch(z, tx, ty).strip()
                if not s:
                    continue
                a = np.array([[np.nan if v == 'e' else float(v) for v in r.split(',')] for r in s.split('\n')], np.float32)
                self.E[(ty - self.ty0) * 256:(ty - self.ty0 + 1) * 256, (tx - self.tx0) * 256:(tx - self.tx0 + 1) * 256] = a

    def _ty(self, lat):
        la = math.radians(lat)
        return (1 - math.log(math.tan(la) + 1 / math.cos(la)) / math.pi) / 2 * 2 ** self.z

    def sample(self, x, z, sea=-3.0):
        x = np.asarray(x, float); z = np.asarray(z, float)
        lon = LON0 + x / KX; lat = LAT0 - z / KZ
        n = 2 ** self.z
        px = (lon + 180) / 360 * n
        la = np.radians(lat)
        py = (1 - np.log(np.tan(la) + 1 / np.cos(la)) / math.pi) / 2 * n
        px = (px - self.tx0) * 256 - 0.5; py = (py - self.ty0) * 256 - 0.5
        E = self.E
        i = np.clip(np.floor(px).astype(int), 0, E.shape[1] - 2); j = np.clip(np.floor(py).astype(int), 0, E.shape[0] - 2)
        fx = np.clip(px - i, 0, 1); fy = np.clip(py - j, 0, 1)
        vals = [E[j, i], E[j, i + 1], E[j + 1, i], E[j + 1, i + 1]]
        vals = [np.where(np.isnan(v), sea, v) for v in vals]
        a, b, c, d = vals
        return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy


def grid(dem, ox, oz, x0, z0, size, n, sea=-3.0, lower=0.0, bits=16):
    """舞台座標 (原点 ox,oz = 港基準の実座標) で、左上 (x0,z0)・一辺 size・n×n 点の高さ格子"""
    xs = np.linspace(x0, x0 + size, n); zs = np.linspace(z0, z0 + size, n)
    X, Z = np.meshgrid(xs, zs)
    h = dem.sample(X + ox, Z + oz, sea) - lower
    lo = float(np.floor(h.min()))
    if bits == 16:
        scale = 0.05
        q = np.clip(np.round((h - lo) / scale), 0, 65535).astype('<u2')
    else:
        scale = max(1.0, float(np.ceil((h.max() - lo) / 255)))
        q = np.clip(np.round((h - lo) / scale), 0, 255).astype('u1')
    return {'x0': x0, 'z0': z0, 'size': size, 'n': n, 'min': lo, 'scale': scale, 'bits': bits,
            'data': base64.b64encode(q.tobytes()).decode()}, h


def main():
    near = Dem(14, 132.955, 133.090, 36.035, 36.145)
    far = Dem(12, 132.850, 133.250, 35.950, 36.220)

    maps = {}
    # ---- 別府（原点：黒木御所跡の碑 付近）----
    GOSHO = (339.0, -452.0)
    maps['beppu'], hb = grid(near, *GOSHO, -760, -600, 1440, 161)
    maps['beppuFar'], _ = grid(far, *GOSHO, -4000, -4000, 8000, 101, sea=-8, lower=1.5, bits=8)

    # ---- 小向（原点：小向の浜）と入り江の渡り（赤ノ江・赤崎）----
    KOMUKAI = (-2700.0, 690.0)
    maps['komukai'], hk = grid(near, *KOMUKAI, -300, -300, 600, 121)
    maps['crossing'], hc = grid(near, *KOMUKAI, -3800, -500, 4400, 147, lower=1.0)
    maps['akanoe'], ha = grid(near, *KOMUKAI, -3300, 1500, 1200, 121)
    maps['crossingFar'], _ = grid(far, *KOMUKAI, -6000, -4000, 12000, 101, sea=-8, lower=2.0, bits=8)

    info = {
        'beppu': {'origin': GOSHO},
        'komukai': {'origin': KOMUKAI},
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('// 自動生成：tools/make_mapdata.py\n')
        f.write('// 標高：国土地理院 標高タイル（DEM10B）を加工して作成。海岸線の確認に OpenStreetMap（© OpenStreetMap contributors）を参照。\n')
        f.write('// 座標は各舞台の原点からの距離（m）。x=東、z=南。\n')
        f.write('export const MAPS = ' + json.dumps(maps) + ';\n')
        f.write('export const MAP_INFO = ' + json.dumps(info) + ';\n')
    print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')


if __name__ == '__main__':
    main()
