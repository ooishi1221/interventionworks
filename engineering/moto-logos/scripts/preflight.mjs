#!/usr/bin/env node
/**
 * preflight.mjs — EAS Build 前のチェックリスト自動実行
 *
 * 使い方:
 *   npm run preflight                # preview 対象でチェック
 *   npm run preflight -- production  # production 対象でチェック
 *
 * チェック項目:
 * 1. .env に必須キーが揃っているか
 * 2. EAS Secrets (対象 env) に .env と同じキーが登録されているか
 * 3. Firestore Rules 構文チェック (firebase CLI)
 * 4. app.json の必須項目（Maps API Key / google-services.json / bundle ID）
 * 5. Sentry DSN が EAS Secrets に入っているか
 *
 * 1つでも失敗があれば exit 1。CI やビルド直前の確認用。
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const ENV = process.argv[2] || 'preview';
const REQUIRED_ENV_KEYS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_SENTRY_DSN',
];

let failed = 0;
const ok = (msg) => console.log(`  ✅ ${msg}`);
const warn = (msg) => console.log(`  ⚠️  ${msg}`);
const fail = (msg) => { console.log(`  ❌ ${msg}`); failed++; };

console.log(`\n🛫 Preflight checks (environment: ${ENV})\n`);

// ─── 1. .env ファイル確認 ─────────────────────────────
console.log('[1] .env ファイルに必須キーが揃っているか');
const envPath = resolve(ROOT, '.env');
if (!existsSync(envPath)) {
  fail(`.env ファイルが存在しません (${envPath})`);
} else {
  const envText = readFileSync(envPath, 'utf8');
  const localKeys = new Set();
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (m) localKeys.add(m[1]);
  }
  for (const k of REQUIRED_ENV_KEYS) {
    if (localKeys.has(k)) ok(`${k}`);
    else fail(`${k} が .env に未設定`);
  }
}

// ─── 2. EAS Secrets 確認 ─────────────────────────────
console.log(`\n[2] EAS ${ENV} env に同じキーが登録されているか`);
let easEnvText = '';
try {
  easEnvText = execSync(`eas env:list ${ENV}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) {
  fail(`eas env:list ${ENV} 実行失敗: ${e.message}`);
}
if (easEnvText) {
  const easKeys = new Set();
  for (const line of easEnvText.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (m) easKeys.add(m[1]);
  }
  for (const k of REQUIRED_ENV_KEYS) {
    if (easKeys.has(k)) ok(`${k}`);
    else fail(`${k} が EAS ${ENV} に未登録 → eas env:push ${ENV} --path .env --force`);
  }
}

// ─── 3. Firestore Rules 構文チェック ──────────────────
console.log('\n[3] Firestore Rules 構文チェック');
try {
  execSync('firebase firestore:rules:get --project moto-spotter > /dev/null 2>&1');
  ok('Firestore Rules 取得成功（現デプロイ分）');
} catch {
  warn('firebase CLI で rules 取得失敗（未ログイン？）');
}
const rulesPath = resolve(ROOT, 'firestore.rules');
if (existsSync(rulesPath)) {
  const rulesText = readFileSync(rulesPath, 'utf8');
  if (rulesText.includes('rules_version = \'2\'')) ok('firestore.rules が v2');
  else fail('firestore.rules の rules_version 未定義 or 旧バージョン');
  if (rulesText.includes('match /spots/')) ok('spots コレクションルールあり');
  else fail('spots コレクションルール欠落');
} else {
  fail('firestore.rules が存在しない');
}

// ─── 4. app.json 必須項目 ────────────────────────────
console.log('\n[4] app.json 必須項目');
const appJson = JSON.parse(readFileSync(resolve(ROOT, 'app.json'), 'utf8'));
const android = appJson.expo?.android ?? {};
const ios = appJson.expo?.ios ?? {};
if (android.googleServicesFile) ok(`android.googleServicesFile: ${android.googleServicesFile}`);
else fail('android.googleServicesFile 未設定');
if (android.config?.googleMaps?.apiKey) ok('android.config.googleMaps.apiKey 設定済み');
else fail('android.config.googleMaps.apiKey 未設定 → Android クラッシュ');
if (android.package) ok(`android.package: ${android.package}`);
else fail('android.package 未設定');
if (ios.bundleIdentifier) ok(`ios.bundleIdentifier: ${ios.bundleIdentifier}`);
else fail('ios.bundleIdentifier 未設定');

// google-services.json 実在確認
if (android.googleServicesFile) {
  const gsPath = resolve(ROOT, android.googleServicesFile);
  if (existsSync(gsPath)) ok('google-services.json 実在');
  else fail(`google-services.json が存在しない: ${gsPath}`);
}

// ─── 5. 結果 ─────────────────────────────────────────
console.log(`\n🛫 Preflight result: ${failed === 0 ? '✅ PASS' : `❌ FAIL (${failed} issue${failed > 1 ? 's' : ''})`}`);
process.exit(failed === 0 ? 0 : 1);
