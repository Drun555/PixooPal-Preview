import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { join } from 'node:path';
import {
  getPackageRoot,
  normalizeClockfaceId,
  parseOptions,
  splitCamelCase,
  SUPPORTED_RESOLUTIONS
} from './shared.mjs';

export async function createClockface(argv = []) {
  const { options } = parseOptions(argv);

  if (options.help) {
    printCreateHelp();
    return;
  }

  const answers = hasCreateOptions(options) ? readOptions(options) : await askQuestions();
  const id = normalizeClockfaceId(answers.name);
  const displayName = answers.name.trim() || splitCamelCase(id);
  const targetDir = join(process.cwd(), id);

  if (existsSync(targetDir)) {
    throw new Error(`Target folder "${id}" already exists.`);
  }

  const [clockfaceSource, skillMarkdown] = await Promise.all([
    createClockfaceSource(Number(answers.resolution)),
    createSkillMarkdown(id)
  ]);

  await mkdir(targetDir, { recursive: true });
  await Promise.all([
    writeFile(join(targetDir, 'package.json'), `${JSON.stringify(createPackageJson(id), null, 2)}\n`, 'utf-8'),
    writeFile(
      join(targetDir, 'manifest.json'),
      `${JSON.stringify(createManifest(id, displayName, answers.author, answers.homeAssistant), null, 2)}\n`,
      'utf-8'
    ),
    writeFile(join(targetDir, `${id}.ts`), clockfaceSource, 'utf-8'),
    writeFile(join(targetDir, 'SKILL.md'), skillMarkdown, 'utf-8'),
    writeFile(join(targetDir, 'assets.d.ts'), createAssetsDts(), 'utf-8'),
    copyFile(join(getPackageRoot(), 'templates', 'picture.png'), join(targetDir, 'picture.png'))
  ]);

  console.log('');
  console.log(`Created ${id}.`);
  console.log('');
  console.log('To continue, execute next command:');
  console.log(`cd ${id} && npm install && npx @pixoopal/preview run`);
}

function hasCreateOptions(options) {
  return (
    options.name !== undefined ||
    options.author !== undefined ||
    options.resolution !== undefined ||
    options['home-assistant'] !== undefined
  );
}

function readOptions(options) {
  const name = String(options.name ?? '').trim();
  const author = String(options.author ?? '').trim();
  const resolution = String(options.resolution ?? '').trim();
  const homeAssistant = parseBooleanOption(options['home-assistant'], false);

  if (!name) {
    throw new Error('--name is required when using non-interactive create options.');
  }

  if (!author) {
    throw new Error('--author is required when using non-interactive create options.');
  }

  if (!SUPPORTED_RESOLUTIONS.has(resolution)) {
    throw new Error('--resolution must be 16, 32, or 64.');
  }

  return {
    name,
    author,
    resolution,
    homeAssistant
  };
}

function printCreateHelp() {
  console.log(`Usage:
  pixoopal-preview create
  pixoopal-preview create --name MyClockface --author "Your Name" --resolution 64 --home-assistant true
  npx @pixoopal/preview create --name MyClockface --author "Your Name" --resolution 64 --home-assistant true`);
}

async function askQuestions() {
  const rl = createInterface({ input, output });

  try {
    const name = await askRequired(rl, 'Clockface name: ');
    const author = await askRequired(rl, 'Author name: ');
    const resolution = await askResolution(rl);
    const homeAssistant = await askBoolean(rl, 'Will this Clockface interact with Home Assistant? (y/N): ');

    return {
      name,
      author,
      resolution,
      homeAssistant
    };
  } finally {
    rl.close();
  }
}

async function askBoolean(rl, question) {
  while (true) {
    const value = (await rl.question(question)).trim().toLowerCase();

    if (!value) {
      return false;
    }

    if (['y', 'yes'].includes(value)) {
      return true;
    }

    if (['n', 'no'].includes(value)) {
      return false;
    }

    console.log('Please answer yes or no.');
  }
}

function parseBooleanOption(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }

  throw new Error('--home-assistant must be true or false.');
}

async function askRequired(rl, question) {
  while (true) {
    const value = (await rl.question(question)).trim();

    if (value) {
      return value;
    }

    console.log('Please enter a value.');
  }
}

async function askResolution(rl) {
  while (true) {
    const value = (await rl.question('Resolution (16 / 32 / 64): ')).trim();

    if (SUPPORTED_RESOLUTIONS.has(value)) {
      return value;
    }

    console.log('Resolution must be 16, 32, or 64.');
  }
}

function createPackageJson(id) {
  return {
    name: id.toLowerCase(),
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      preview: 'npx @pixoopal/preview run',
      build: 'npx @pixoopal/preview build'
    },
    dependencies: {
      '@pixoopal/clockface': '^0.2.2'
    }
  };
}

function createManifest(id, name, author, homeAssistant) {
  const manifest = {
    entry: `./${id}.ts`,
    name,
    description: 'A PixooPal Clockface.',
    picture: './picture.png',
    author
  };

  if (homeAssistant) {
    manifest.tags = ['Home Assistant'];
  }

  return manifest;
}

async function createClockfaceSource(resolution) {
  return fillTemplate('Clockface.ts', {
    __RESOLUTION__: String(resolution)
  });
}

async function createSkillMarkdown(id) {
  return fillTemplate('SKILL.md', {
    __CLOCKFACE_ID__: id
  });
}

async function fillTemplate(name, replacements) {
  let content = await readFile(join(getPackageRoot(), 'templates', name), 'utf-8');

  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(key, value);
  }

  return content;
}

function createAssetsDts() {
  return `declare module '*.png' {
  const dataUrl: string;
  export default dataUrl;
}

declare module '*.jpg' {
  const dataUrl: string;
  export default dataUrl;
}

declare module '*.jpeg' {
  const dataUrl: string;
  export default dataUrl;
}

declare module '*.webp' {
  const dataUrl: string;
  export default dataUrl;
}

declare module '*.gif' {
  const dataUrl: string;
  export default dataUrl;
}
`;
}
