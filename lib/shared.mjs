import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPPORTED_RESOLUTIONS = new Set(['16', '32', '64']);

export function getPackageRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

export function normalizeClockfaceId(value) {
  const id = String(value ?? '').trim().replace(/[^\w-]/g, '');

  if (!id) {
    throw new Error('Clockface name must contain at least one letter, digit, underscore, or hyphen.');
  }

  return id;
}

export function splitCamelCase(value) {
  return String(value).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

export async function readClockfaceManifest(root = process.cwd()) {
  const manifestPath = join(root, 'manifest.json');

  if (!existsSync(manifestPath)) {
    throw new Error('manifest.json was not found. Run this command from a Clockface folder.');
  }

  let manifest;

  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  } catch (error) {
    throw new Error(`manifest.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isRecord(manifest)) {
    throw new Error('manifest.json must contain a JSON object.');
  }

  return {
    manifest,
    manifestPath
  };
}

export function normalizeRelativePath(value, field, manifestPath) {
  const raw = String(value ?? '').trim().replace(/^\.\/+/, '');

  if (!raw || raw.includes('\0') || raw.startsWith('/') || /^[a-z]+:/i.test(raw)) {
    throw new Error(`manifest.json has invalid ${field} path "${value}".`);
  }

  const parts = raw.split(/[\\/]/);

  if (parts.includes('..')) {
    throw new Error(`manifest.json has ${field} path outside the Clockface folder.`);
  }

  const folder = resolve(dirname(manifestPath));
  const normalized = normalize(raw);
  const absolute = resolve(folder, normalized);
  const relativePath = relative(folder, absolute);

  if (relativePath.startsWith('..') || relativePath === '..') {
    throw new Error(`manifest.json has ${field} path outside the Clockface folder.`);
  }

  return {
    relativePath: normalized,
    absolutePath: absolute
  };
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return character;
    }
  });
}

export function parseOptions(argv) {
  const options = {};
  const rest = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith('-')) {
      rest.push(arg);
      continue;
    }

    const [key, inlineValue] = arg.split(/=(.*)/s, 2);

    if (key === '--help' || key === '-h') {
      options.help = true;
      continue;
    }

    const optionName = key.replace(/^-+/, '');
    const nextValue = inlineValue ?? argv[++index];

    if (nextValue === undefined || nextValue.startsWith('-')) {
      throw new Error(`${key} needs a value.`);
    }

    options[optionName] = nextValue;
  }

  return {
    options,
    rest
  };
}

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
