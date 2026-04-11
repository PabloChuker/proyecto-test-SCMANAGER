// =============================================================================
// SC LABS — upload-glb-r2.mjs
//
// Sube todos los archivos GLB del directorio `Modulos 3d/GLB/` a un bucket
// público de Cloudflare R2.
//
// PREREQUISITOS:
//   1. Crear bucket R2 (ej: sclabs-ships) con Public Access habilitado
//   2. Crear API Token en R2 con permiso "Object Read & Write" al bucket
//   3. Instalar dependencia (una sola vez):
//        npm install --save-dev @aws-sdk/client-s3
//   4. Agregar variables en .env (al lado de DATABASE_URL):
//        R2_ACCOUNT_ID=abc123...
//        R2_ACCESS_KEY_ID=...
//        R2_SECRET_ACCESS_KEY=...
//        R2_BUCKET_NAME=sclabs-ships
//   5. Agregar también (para runtime en Vercel):
//        NEXT_PUBLIC_GLB_BASE_URL=https://pub-xxxx.r2.dev
//
// USO:
//   cd al-filo-platform
//   node --env-file=.env scripts/upload-glb-r2.mjs
//
// OPCIONES:
//   --dry-run    Solo lista los archivos que subiría, sin ejecutar uploads
//   --force      Sube todos los archivos aunque ya existan en el bucket
//   --glb-dir    Path al directorio de GLBs (default: Modulos 3d/GLB)
//   --concurrency=N  Cantidad de uploads en paralelo (default: 4)
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const glbDirArg = args.find((a) => a.startsWith("--glb-dir="));
const concArg = args.find((a) => a.startsWith("--concurrency="));
const glbDir = glbDirArg
  ? glbDirArg.split("=")[1]
  : path.join(process.cwd(), "Modulos 3d", "GLB");
const concurrency = concArg ? parseInt(concArg.split("=")[1], 10) : 4;

// ─── Validar env vars ────────────────────────────────────────────────────────
const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("❌ Faltan variables en .env:");
  missing.forEach((k) => console.error(`   - ${k}`));
  process.exit(1);
}

if (!fs.existsSync(glbDir)) {
  console.error(`❌ No existe el directorio: ${glbDir}`);
  process.exit(1);
}

const files = fs.readdirSync(glbDir).filter((f) => f.endsWith(".glb"));
console.log(`📦 ${files.length} archivos .glb en ${glbDir}`);
console.log(`🎯 Bucket: ${process.env.R2_BUCKET_NAME}`);
console.log(`⚡ Concurrencia: ${concurrency}${dryRun ? "  (DRY RUN)" : ""}${force ? "  (FORCE)" : ""}\n`);

if (dryRun) {
  files.forEach((f) => {
    const size = fs.statSync(path.join(glbDir, f)).size;
    console.log(`  would upload: ${f}  (${(size / 1024 / 1024).toFixed(1)} MB)`);
  });
  console.log(`\nTotal: ${files.length} archivos`);
  process.exit(0);
}

// ─── Cliente S3 apuntado a R2 ────────────────────────────────────────────────
const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.R2_BUCKET_NAME;

async function objectExists(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

async function uploadOne(file, idx, total) {
  const key = file;
  const fullPath = path.join(glbDir, file);
  const stat = fs.statSync(fullPath);
  const sizeMb = (stat.size / 1024 / 1024).toFixed(1);

  if (!force) {
    const exists = await objectExists(key);
    if (exists) {
      console.log(`[${idx + 1}/${total}]  skip  ${file}  (ya existe)`);
      return { file, status: "skipped" };
    }
  }

  const body = fs.readFileSync(fullPath);
  const t0 = Date.now();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "model/gltf-binary",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[${idx + 1}/${total}]  ✓  ${file}  (${sizeMb} MB, ${dt}s)`);
    return { file, status: "uploaded" };
  } catch (err) {
    console.error(`[${idx + 1}/${total}]  ✗  ${file}  → ${err.message}`);
    return { file, status: "error", error: err.message };
  }
}

// ─── Pool de workers con concurrencia limitada ───────────────────────────────
async function runPool(items, worker, conc) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: conc }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx, items.length);
    }
  });
  await Promise.all(workers);
  return results;
}

const t0 = Date.now();
const results = await runPool(files, uploadOne, concurrency);
const dt = ((Date.now() - t0) / 1000).toFixed(1);

const uploaded = results.filter((r) => r.status === "uploaded").length;
const skipped = results.filter((r) => r.status === "skipped").length;
const errored = results.filter((r) => r.status === "error").length;

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`✨ Done en ${dt}s`);
console.log(`   Uploaded: ${uploaded}`);
console.log(`   Skipped:  ${skipped}`);
console.log(`   Errors:   ${errored}`);
if (errored) process.exit(1);
