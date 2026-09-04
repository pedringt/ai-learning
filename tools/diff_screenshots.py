import sys
from pathlib import Path
from PIL import Image, ImageChops

a_dir, b_dir = Path(sys.argv[1]), Path(sys.argv[2])
out = Path(sys.argv[3]) if len(sys.argv) > 3 else None
if out: out.mkdir(parents=True, exist_ok=True)
rows = []
for f in sorted(a_dir.glob("*.png")):
    g = b_dir / f.name
    if not g.exists():
        rows.append((f.name, "MISSING in after", 0)); continue
    A, B = Image.open(f).convert("RGB"), Image.open(g).convert("RGB")
    if A.size != B.size:
        rows.append((f.name, f"size {A.size} -> {B.size}", -1)); continue
    d = ImageChops.difference(A, B)
    bbox = d.getbbox()
    if bbox is None:
        rows.append((f.name, "identical", 0)); continue
    n = sum(1 for px in d.getdata() if px != (0, 0, 0))
    pct = 100.0 * n / (A.size[0] * A.size[1])
    rows.append((f.name, f"differs bbox={bbox}", pct))
    if out:
        d.point(lambda v: min(255, v * 8)).save(out / f"diff__{f.name}")

same = [r for r in rows if r[2] == 0 and r[1] == "identical"]
diff = [r for r in rows if r not in same]
print(f"{len(same)}/{len(rows)} screenshots pixel-identical")
if diff:
    print("\nDIFFERENCES:")
    for n, why, pct in diff:
        print(f"  {n:44} {why}" + (f"  ({pct:.3f}% of pixels)" if pct > 0 else ""))
else:
    print("no visual differences anywhere")
