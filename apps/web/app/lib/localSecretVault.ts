import { execFileSync } from 'child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { homedir, platform } from 'os';
import { basename, dirname, join } from 'path';
import { REPO_ROOT } from './repoRoot';

type VaultKeyStorage = 'env' | 'macos-keychain' | 'file';

interface SealedSecret {
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
  updatedAt: number;
}

interface VaultFile {
  version: 1;
  entries: Record<string, SealedSecret>;
}

export interface HudsonLocalSecretVaultInfo {
  path: string;
  keyStorage: VaultKeyStorage;
}

const VAULT_VERSION = 1;
const KEYCHAIN_SERVICE = 'dev.hudson.local-secret-vault';

export const HUDSON_SECRET_ENV_KEYS = [
  'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY',
  'GROQ_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'COPILOT_GITHUB_TOKEN',
  'XAI_API_KEY',
  'MINIMAX_API_KEY',
  'OPENROUTER_API_KEY',
] as const;

const HUDSON_SECRET_ENV_KEY_SET = new Set<string>(HUDSON_SECRET_ENV_KEYS);

let cachedKey: { account: string; key: Buffer; storage: VaultKeyStorage } | null = null;

export function isHudsonSecretEnvKey(key: string): boolean {
  return HUDSON_SECRET_ENV_KEY_SET.has(key);
}

export function getHudsonLocalSecretVaultPath(): string {
  return process.env.HUDSON_LOCAL_VAULT_PATH || join(REPO_ROOT, '.data', 'hudson-local-vault.json');
}

function getVaultAccount(): string {
  return process.env.HUDSON_LOCAL_VAULT_ACCOUNT
    || createHash('sha256').update(process.cwd()).digest('hex').slice(0, 32);
}

function getFileKeyPath(account: string): string {
  return join(homedir(), '.hudson', 'vault', `${account}.key`);
}

function keyFromMaterial(material: string): Buffer {
  const trimmed = material.trim();
  const base64 = Buffer.from(trimmed, 'base64');
  if (base64.length === 32) return base64;

  const hex = Buffer.from(trimmed, 'hex');
  if (hex.length === 32) return hex;

  return createHash('sha256').update(trimmed).digest();
}

function readMacKeychainKey(account: string): string | null {
  if (platform() !== 'darwin') return null;

  try {
    return execFileSync('/usr/bin/security', [
      'find-generic-password',
      '-s', KEYCHAIN_SERVICE,
      '-a', account,
      '-w',
    ], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function writeMacKeychainKey(account: string, value: string): boolean {
  if (platform() !== 'darwin') return false;

  try {
    execFileSync('/usr/bin/security', [
      'add-generic-password',
      '-s', KEYCHAIN_SERVICE,
      '-a', account,
      '-l', `Hudson Local Vault (${basename(process.cwd()) || account})`,
      '-w', value,
      '-U',
    ], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function readOrCreateFileKey(account: string): string {
  const keyPath = getFileKeyPath(account);
  if (existsSync(keyPath)) return readFileSync(keyPath, 'utf-8').trim();

  mkdirSync(dirname(keyPath), { recursive: true, mode: 0o700 });
  const value = randomBytes(32).toString('base64');
  writeFileSync(keyPath, `${value}\n`, { mode: 0o600 });
  try {
    chmodSync(keyPath, 0o600);
  } catch {
    // Best-effort on platforms without POSIX chmod semantics.
  }
  return value;
}

function getVaultKey(): { key: Buffer; storage: VaultKeyStorage } {
  const account = getVaultAccount();
  if (cachedKey?.account === account) return cachedKey;

  if (process.env.HUDSON_LOCAL_VAULT_KEY) {
    cachedKey = { account, key: keyFromMaterial(process.env.HUDSON_LOCAL_VAULT_KEY), storage: 'env' };
    return cachedKey;
  }

  const existingKeychainValue = readMacKeychainKey(account);
  if (existingKeychainValue) {
    cachedKey = { account, key: keyFromMaterial(existingKeychainValue), storage: 'macos-keychain' };
    return cachedKey;
  }

  const freshValue = randomBytes(32).toString('base64');
  if (writeMacKeychainKey(account, freshValue)) {
    cachedKey = { account, key: keyFromMaterial(freshValue), storage: 'macos-keychain' };
    return cachedKey;
  }

  const fileValue = readOrCreateFileKey(account);
  cachedKey = { account, key: keyFromMaterial(fileValue), storage: 'file' };
  return cachedKey;
}

function readVaultFile(): VaultFile {
  const path = getHudsonLocalSecretVaultPath();
  if (!existsSync(path)) return { version: VAULT_VERSION, entries: {} };

  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<VaultFile>;
  if (parsed.version !== VAULT_VERSION || !parsed.entries || typeof parsed.entries !== 'object') {
    throw new Error(`Unsupported Hudson local vault format at ${path}.`);
  }
  return { version: VAULT_VERSION, entries: parsed.entries as Record<string, SealedSecret> };
}

function writeVaultFile(vault: VaultFile) {
  const path = getHudsonLocalSecretVaultPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(vault, null, 2), { mode: 0o600 });
  renameSync(tmpPath, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best-effort on platforms without POSIX chmod semantics.
  }
}

function seal(value: string): SealedSecret {
  const { key } = getVaultKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(value, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64'),
    updatedAt: Date.now(),
  };
}

function open(sealed: SealedSecret): string {
  if (sealed.alg !== 'aes-256-gcm') {
    throw new Error(`Unsupported Hudson vault secret algorithm: ${sealed.alg}.`);
  }

  const { key } = getVaultKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.data, 'base64')),
    decipher.final(),
  ]).toString('utf-8');
}

export function getHudsonLocalSecretVaultInfo(): HudsonLocalSecretVaultInfo {
  return {
    path: getHudsonLocalSecretVaultPath(),
    keyStorage: getVaultKey().storage,
  };
}

export function loadHudsonLocalSecrets(): Record<string, string> {
  const vault = readVaultFile();
  const out: Record<string, string> = {};
  for (const [key, sealed] of Object.entries(vault.entries)) {
    out[key] = open(sealed);
  }
  return out;
}

export function setHudsonLocalSecret(key: string, value: string) {
  const vault = readVaultFile();
  vault.entries[key] = seal(value);
  writeVaultFile(vault);
}

export function deleteHudsonLocalSecret(key: string) {
  const vault = readVaultFile();
  if (!(key in vault.entries)) return;
  delete vault.entries[key];
  writeVaultFile(vault);
}

// ---------------------------------------------------------------------------
// Sealed documents: secrets that are not environment variables (OAuth
// credentials). Same key and cipher as the vault, but a separate file per
// document, so they never reach process.env or the Environment editor.
// ---------------------------------------------------------------------------

function sealedDocumentPath(name: string): string {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid sealed document name: ${name}`);
  return join(dirname(getHudsonLocalSecretVaultPath()), `hudson-${name}.sealed.json`);
}

export function readHudsonSealedDocument<T>(name: string): T | null {
  const path = sealedDocumentPath(name);
  if (!existsSync(path)) return null;
  const sealed = JSON.parse(readFileSync(path, 'utf-8')) as SealedSecret;
  return JSON.parse(open(sealed)) as T;
}

export function writeHudsonSealedDocument(name: string, value: unknown) {
  const path = sealedDocumentPath(name);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(seal(JSON.stringify(value))), { mode: 0o600 });
  renameSync(tmpPath, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best-effort on platforms without POSIX chmod semantics.
  }
}

export function deleteHudsonSealedDocument(name: string) {
  rmSync(sealedDocumentPath(name), { force: true });
}

export function clearHudsonLocalSecretVaultCacheForTests() {
  cachedKey = null;
}
