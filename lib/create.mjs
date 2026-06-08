import { copyFile, mkdir, writeFile } from 'node:fs/promises';
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

  await mkdir(targetDir, { recursive: true });
  await Promise.all([
    writeFile(join(targetDir, 'package.json'), `${JSON.stringify(createPackageJson(id), null, 2)}\n`, 'utf-8'),
    writeFile(
      join(targetDir, 'manifest.json'),
      `${JSON.stringify(createManifest(id, displayName, answers.author, answers.homeAssistant), null, 2)}\n`,
      'utf-8'
    ),
    writeFile(join(targetDir, `${id}.ts`), createClockfaceSource(id, Number(answers.resolution)), 'utf-8'),
    writeFile(join(targetDir, 'SKILL.md'), createSkillMarkdown(id), 'utf-8'),
    writeFile(join(targetDir, 'assets.d.ts'), createAssetsDts(), 'utf-8'),
    copyFile(join(getPackageRoot(), 'templates', 'clockface', 'picture.png'), join(targetDir, 'picture.png'))
  ]);

  console.log('');
  console.log(`Created ${id}.`);
  console.log('');
  console.log('To continue, execute next command:');
  console.log(`cd ${id} && npx pixoopal-preview run`);
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
  pixoopal-preview create --name MyClockface --author "Your Name" --resolution 64 --home-assistant true`);
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
      preview: 'npx pixoopal-preview run',
      build: 'npx pixoopal-preview build'
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

function createClockfaceSource(id, resolution) {
  return `import { defineClockface, data, input } from '@pixoopal/clockface';

const RESOLUTION = ${resolution};

let frame = 0;

export default defineClockface({
  resolution: RESOLUTION,
  data: {
    message: data.string('HELLO'),
    accent: data.color('#ffd650'),
    background: data.color('#05070c')
  },
  inputs: [
    input.text('message', 'Message'),
    input.color('accent', 'Accent'),
    input.color('background', 'Background'),
    input.button('reset', 'Reset', {
      isSetting: false,
      onSubmit(_value, context) {
        context.data.message = 'HELLO';
        context.data.accent = '#ffd650';
        context.data.background = '#05070c';
      }
    })
  ],
  interval: 120,
  render(context) {
    frame += 1;
    context.canvas.clear(context.data.background);

    const center = Math.floor(context.resolution / 2);
    const radius = Math.max(2, Math.floor(context.resolution / 5));
    const orbit = Math.max(3, Math.floor(context.resolution / 3));
    const x = center + Math.round(Math.cos(frame / 8) * orbit);
    const y = center + Math.round(Math.sin(frame / 8) * orbit);

    context.canvas.circle(center, center, radius, {
      fill: context.data.accent,
      opacity: 0.75
    });
    context.canvas.pixel(x, y, '#ffffff');
    context.canvas.text(context.data.message.toUpperCase().slice(0, 8), 1, context.resolution - 9, {
      fill: '#ffffff'
    });
  }
});
`;
}

function createSkillMarkdown(id) {
  return `# ${id} Clockface AI Instructions

Use these instructions when working on this PixooPal Clockface.

## Scope

- Edit only files inside this Clockface folder.
- Keep every asset beside the main entrypoint or in local subfolders inside this Clockface folder.
- Do not reference, create, or require files outside this folder.
- Do not add external dependencies. The only allowed package dependency is \`@pixoopal/clockface\`.
- The generated entrypoint is TypeScript. Keep the main Clockface code in \`${id}.ts\`.

## SDK Rules

- Use \`defineClockface\`, \`data\`, \`input\`, and \`context.canvas\` from \`@pixoopal/clockface\`.
- Use \`context.homeAssistant\` for Home Assistant calls when the Clockface needs them.
- Prefer \`context.canvas\` helpers before direct buffer writes.
- Direct \`context.canvas.buffer\` access is allowed only when canvas helpers are not enough.
- For dynamic Clockfaces, prefer frame-by-frame animation state over wall-clock time based animation.

## Validation

- Run \`npm run preview\` or \`npx pixoopal-preview run\` to validate and preview changes.
- Confirm \`manifest.json\`, the entry file, and \`picture.png\` are present before finishing.
`;
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
