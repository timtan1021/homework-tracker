// アイコンを生成する。ビルドのたびに走らせる必要はない。
// 図柄を変えたときだけ `npm run icons` を実行し、結果をコミットする。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");

const svg = await readFile(join(here, "icon.svg"));

await mkdir(publicDir, { recursive: true });

/** 通常のアイコン。図柄が縁まで届く。 */
async function plain(size, name) {
  const png = await sharp(svg).resize(size, size).png().toBuffer();
  await writeFile(join(publicDir, name), png);
  console.log(`${name} (${size}x${size})`);
}

/**
 * maskable。端末が外周を切り抜くため、図柄を80%に縮めて中央に置く。
 * 縮めないと花丸の縁が削られる。
 */
async function maskable(size, name) {
  const inner = Math.round(size * 0.8);
  const pad = Math.round((size - inner) / 2);

  const shrunk = await sharp(svg).resize(inner, inner).png().toBuffer();
  const png = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      // 切り抜かれる外周も藍で埋める
      background: { r: 0x22, g: 0x40, b: 0x6b, alpha: 1 },
    },
  })
    .composite([{ input: shrunk, top: pad, left: pad }])
    .png()
    .toBuffer();

  await writeFile(join(publicDir, name), png);
  console.log(`${name} (${size}x${size}, maskable)`);
}

await plain(192, "icon-192.png");
await plain(512, "icon-512.png");
await plain(180, "apple-touch-icon.png");
await maskable(512, "icon-maskable-512.png");
