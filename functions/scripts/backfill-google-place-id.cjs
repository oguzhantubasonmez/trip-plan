/**
 * Tek seferlik: Firestore `stops` koleksiyonunda `googlePlaceId` olmayan duraklara
 * Google Places Find Place From Text ile place_id yazar.
 *
 * Koşullar (varsayılan):
 * - `googlePlaceId` boş
 * - `locationName` dolu
 * - `coords` (latitude/longitude veya GeoPoint) dolu
 * - `placeRating` > 0 (sunum/Google zenginleştirme ile uyumlu; isteğe bağlı gevşetilir)
 *
 * Güvenlik: Bulunan yerin Place Details `rating` değeri, durakta kayıtlı `placeRating` ile
 * |fark| > 0.65 ise yazılmaz (yanlış eşleşme ihtimali).
 *
 * Kurulum (functions klasöründen):
 *   npm install
 *
 * Ortam:
 *   - Script, `mobile/.env` dosyasını otomatik okur (EXPO_PUBLIC_* ve GOOGLE_*).
 *   - Firestore yazmak için servis hesabı JSON şart:
 *       GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-adminsdk.json
 *     (yol, mobile klasörüne göre çözülür) veya FIREBASE_SERVICE_ACCOUNT_JSON ortam değişkeni.
 *   - Places: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY veya GOOGLE_MAPS_API_KEY
 *
 * Çalıştırma:
 *   cd functions
 *   node scripts/backfill-google-place-id.cjs --dry-run
 *   node scripts/backfill-google-place-id.cjs
 *
 * İsteğe bağlı:
 *   set BACKFILL_INCLUDE_NO_RATING=1   → placeRating olmayan durakları da dene
 *   set BACKFILL_LIMIT=20              → en fazla 20 durak işle (test)
 *   set BACKFILL_SLEEP_MS=200          → istekler arası bekleme
 */

'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const FIND_URL = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

/** `functions/scripts` → repo kökü → `mobile/.env` */
const MOBILE_DIR = path.join(__dirname, '..', '..', 'mobile');
const MOBILE_ENV_PATH = path.join(MOBILE_DIR, '.env');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv) {
  return { dryRun: argv.includes('--dry-run') };
}

/**
 * Ortamda yoksa mobile/.env satırlarını process.env’e yükler (tırnaklı değerler desteklenir).
 * Mevcut shell değişkenlerini ezmez.
 */
function loadMobileDotEnv() {
  if (!fs.existsSync(MOBILE_ENV_PATH)) return;
  const raw = fs.readFileSync(MOBILE_ENV_PATH, 'utf8');
  for (const line of raw.split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = val;
    }
  }
}

function resolveCredentialsPath(raw) {
  if (!raw || !String(raw).trim()) return null;
  let p = String(raw).trim().replace(/^["']|["']$/g, '');
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  const rel = p.replace(/^\.\/+/, '');
  const fromMobile = path.join(MOBILE_DIR, rel);
  const fromRoot = path.join(MOBILE_DIR, '..', rel);
  if (fs.existsSync(fromMobile)) return fromMobile;
  if (fs.existsSync(fromRoot)) return fromRoot;
  return fromMobile;
}

function initFirebaseAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId || !String(projectId).trim()) {
    console.error(
      'Firebase proje kimliği yok. mobile/.env içinde EXPO_PUBLIC_FIREBASE_PROJECT_ID tanımlı olmalı.'
    );
    process.exit(1);
  }

  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonRaw && String(jsonRaw).trim()) {
    let sa;
    try {
      sa = JSON.parse(jsonRaw);
    } catch (e) {
      console.error('FIREBASE_SERVICE_ACCOUNT_JSON geçerli JSON değil:', e.message);
      process.exit(1);
    }
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: String(projectId).trim() || sa.project_id,
    });
    return;
  }

  const credPath = resolveCredentialsPath(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if (!credPath || !fs.existsSync(credPath)) {
    console.error(
      'Firestore’a erişmek için servis hesabı gerekli (client API anahtarı yetmez).\n\n' +
        '1) Firebase Console → Proje ayarları → Servis hesapları → Yeni özel anahtar (JSON) indir\n' +
        '2) Dosyayı örn. mobile/secrets/firebase-adminsdk.json olarak kaydedin\n' +
        '3) mobile/.env dosyasına ekleyin:\n' +
        '   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-adminsdk.json\n\n' +
        'Alternatif (tek satır): ortamda FIREBASE_SERVICE_ACCOUNT_JSON={...} verin.\n\n' +
        `Aranan yol: ${credPath || '(GOOGLE_APPLICATION_CREDENTIALS tanımsız)'}`
    );
    process.exit(1);
  }

  const sa = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId: String(projectId).trim() || sa.project_id,
  });
}

function normalizeCoords(raw) {
  if (raw == null || typeof raw !== 'object') return null;
  const lat = raw.latitude;
  const lon = raw.longitude;
  if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)) {
    return { lat, lng: lon };
  }
  return null;
}

async function findPlaceIdFromText(apiKey, input, lat, lng, radiusMeters) {
  const params = new URLSearchParams({
    input: input.trim(),
    inputtype: 'textquery',
    fields: 'place_id',
    locationbias: `circle:${lat},${lng}|${Math.max(500, Math.min(radiusMeters, 50000))}`,
    language: 'tr',
    key: apiKey,
  });
  const res = await fetch(`${FIND_URL}?${params.toString()}`);
  const data = await res.json();
  if (data.status !== 'OK' || !data.candidates?.length) return null;
  const pid = data.candidates[0]?.place_id;
  return typeof pid === 'string' && pid.trim() ? pid.trim() : null;
}

async function fetchPlaceRating(apiKey, placeId) {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'rating',
    language: 'tr',
    key: apiKey,
  });
  const res = await fetch(`${DETAILS_URL}?${params.toString()}`);
  const data = await res.json();
  if (data.status !== 'OK') return null;
  const r = data.result?.rating;
  return typeof r === 'number' && !Number.isNaN(r) ? r : null;
}

async function main() {
  loadMobileDotEnv();
  initFirebaseAdmin();

  const { dryRun } = parseArgs(process.argv);
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  if (!apiKey.trim()) {
    console.error('GOOGLE_MAPS_API_KEY (veya EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) tanımlı değil.');
    process.exit(1);
  }

  const includeNoRating = process.env.BACKFILL_INCLUDE_NO_RATING === '1';
  const limit = process.env.BACKFILL_LIMIT ? parseInt(process.env.BACKFILL_LIMIT, 10) : 0;
  const sleepMs = process.env.BACKFILL_SLEEP_MS ? parseInt(process.env.BACKFILL_SLEEP_MS, 10) : 180;
  const ratingTolerance = 0.65;

  const db = admin.firestore();

  const snap = await db.collection('stops').get();
  let examined = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let candidatesProcessed = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const stopId = doc.id;

    if (d.googlePlaceId && String(d.googlePlaceId).trim()) {
      skipped += 1;
      continue;
    }

    const name = typeof d.locationName === 'string' ? d.locationName.trim() : '';
    if (!name) {
      skipped += 1;
      continue;
    }

    const coords = normalizeCoords(d.coords);
    if (!coords) {
      skipped += 1;
      continue;
    }

    const pr =
      typeof d.placeRating === 'number' && !Number.isNaN(d.placeRating) ? d.placeRating : null;
    if (!includeNoRating && (pr == null || pr <= 0)) {
      skipped += 1;
      continue;
    }

    if (limit > 0 && candidatesProcessed >= limit) break;
    candidatesProcessed += 1;
    examined += 1;

    try {
      const placeId = await findPlaceIdFromText(apiKey, name, coords.lat, coords.lng, 50000);
      await sleep(sleepMs);
      if (!placeId) {
        console.log(`[yok] ${stopId} "${name}" → eşleşme bulunamadı`);
        failed += 1;
        continue;
      }

      if (pr != null && pr > 0) {
        const liveRating = await fetchPlaceRating(apiKey, placeId);
        await sleep(sleepMs);
        if (liveRating != null && Math.abs(liveRating - pr) > ratingTolerance) {
          console.log(
            `[atla] ${stopId} "${name}" → place_id eşleşmesi şüpheli (kayıtlı ${pr}, Places ${liveRating})`
          );
          failed += 1;
          continue;
        }
      }

      if (dryRun) {
        console.log(`[dry-run] ${stopId} "${name}" → ${placeId}`);
        updated += 1;
        continue;
      }

      await doc.ref.update({
        googlePlaceId: placeId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`[yazıldı] ${stopId} "${name}" → ${placeId}`);
      updated += 1;
    } catch (e) {
      console.error(`[hata] ${stopId}`, e.message || e);
      failed += 1;
    }
  }

  console.log(
    `\nÖzet: incelenen (aday)=${examined}, güncellenen/dry=${updated}, atlanan (önceden dolu veya koşulsuz)=${skipped}, sorun=${failed}, dryRun=${dryRun}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
