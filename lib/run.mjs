import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { basename, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
  escapeHtml,
  isRecord,
  normalizeClockfaceId,
  normalizeRelativePath,
  parseOptions,
  readClockfaceManifest,
  splitCamelCase
} from './shared.mjs';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4174;
const SUPPORTED_ENTRY_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);
const SIMULATED_PACING_MS = new Map([
  [64, 180],
  [32, 60],
  [16, 20]
]);

export async function buildClockface({ watch = false } = {}) {
  const state = await createBuildState(process.cwd());
  await buildState(state);

  if (!watch) {
    console.log(`Built ${relative(process.cwd(), state.outputModulePath).replaceAll('\\', '/')}`);
  }

  return state;
}

export async function runPreviewServer(argv) {
  const { options } = parseOptions(argv);

  if (options.help) {
    printRunHelp();
    return;
  }

  const state = await createBuildState(process.cwd());
  await buildState(state);
  const runtime = createRuntime(state);
  const watcher = startWatcher(state, runtime);
  const server = createServer((request, response) => {
    handleRequest(request, response, state, runtime).catch((error) => {
      sendError(response, error);
    });
  });
  const host = String(options.host ?? DEFAULT_HOST);
  const port = parsePort(options.port ?? DEFAULT_PORT);

  await new Promise((resolveListen) => {
    server.listen(port, host, resolveListen);
  });

  server.on('close', () => {
    watcher.close();
  });

  console.log(`PixooPal Preview: http://${host}:${port}`);
  console.log(`Build output: ${relative(process.cwd(), state.outputDir).replaceAll('\\', '/')}`);
}

async function createBuildState(root) {
  const { manifest, manifestPath } = await readClockfaceManifest(root);
  const id = normalizeClockfaceId(manifest.id ?? manifest.name ?? basename(root));
  const entry = normalizeRelativePath(manifest.entry, 'entry', manifestPath);
  const picture = normalizeRelativePath(manifest.picture ?? './picture.png', 'picture', manifestPath);

  if (!existsSync(entry.absolutePath)) {
    throw new Error(`manifest.json points to missing entry "${manifest.entry}".`);
  }

  const entryExtension = extname(entry.absolutePath).toLowerCase();

  if (!SUPPORTED_ENTRY_EXTENSIONS.has(entryExtension)) {
    throw new Error(
      `manifest.json entry must point to a TypeScript or JavaScript file. Generated Clockfaces use .ts and preview builds them into .mjs.`
    );
  }

  if (!existsSync(picture.absolutePath)) {
    throw new Error(`manifest.json points to missing picture "${manifest.picture ?? './picture.png'}".`);
  }

  const outputDir = join(root, `build-${id}`);
  const outputModulePath = join(outputDir, `${id}.mjs`);

  return {
    root,
    manifest,
    id,
    name: stringValue(manifest.name) ?? splitCamelCase(id),
    author: stringValue(manifest.author),
    description: stringValue(manifest.description),
    manifestPath,
    entryPath: entry.absolutePath,
    picturePath: picture.absolutePath,
    outputDir,
    outputModulePath,
    buildVersion: 0,
    buildError: undefined
  };
}

async function buildState(state) {
  state.buildVersion += 1;
  state.buildError = undefined;
  await rm(state.outputDir, { force: true, recursive: true });
  await mkdir(state.outputDir, { recursive: true });

  try {
    await build({
      entryPoints: [state.entryPath],
      outfile: state.outputModulePath,
      bundle: true,
      format: 'esm',
      loader: {
        '.gif': 'dataurl',
        '.jpeg': 'dataurl',
        '.jpg': 'dataurl',
        '.png': 'dataurl',
        '.webp': 'dataurl'
      },
      platform: 'node',
      target: 'node22',
      packages: 'external',
      plugins: [clockfaceSdkExternalPlugin()],
      logLevel: 'silent'
    });

    await copyClockfaceAssets(state.root, state.outputDir);
  } catch (error) {
    state.buildError = error;
    throw error;
  }
}

function clockfaceSdkExternalPlugin() {
  return {
    name: 'pixoopal-clockface-external',
    setup(builder) {
      builder.onResolve({ filter: /^@pixoopal\/clockface(?:\/.*)?$/ }, (args) => ({
        path: import.meta.resolve(args.path),
        external: true
      }));
    }
  };
}

async function copyClockfaceAssets(root, outputDir) {
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'manifest.json' || entry.name === 'package.json' || entry.name === 'package-lock.json') {
      continue;
    }

    if (entry.name === 'node_modules' || entry.name.startsWith('build-')) {
      continue;
    }

    const source = join(root, entry.name);
    const target = join(outputDir, entry.name);

    if (entry.isDirectory()) {
      await cp(source, target, { recursive: true });
      continue;
    }

    if (!entry.isFile() || extname(entry.name).toLowerCase() === '.ts') {
      continue;
    }

    await cp(source, target);
  }
}

function createRuntime(state) {
  return {
    instance: undefined,
    importedVersion: 0,
    rendering: false,
    lastFrame: undefined,
    lastError: undefined,
    eventClients: new Set(),
    async getInstance() {
      if (this.instance && this.importedVersion === state.buildVersion) {
        return this.instance;
      }

      if (this.instance) {
        await this.instance.stop?.();
      }

      const moduleUrl = `${pathToFileURL(state.outputModulePath).href}?v=${state.buildVersion}&t=${Date.now()}`;
      const module = await import(moduleUrl);
      this.instance = module.default;
      this.importedVersion = state.buildVersion;
      await this.instance.ready;
      await this.instance.start?.();
      return this.instance;
    },
    notify(event) {
      const payload = `data: ${JSON.stringify(event)}\n\n`;

      for (const client of this.eventClients) {
        client.write(payload);
      }
    }
  };
}

function startWatcher(state, runtime) {
  let timer;
  const watcher = watch(state.root, { recursive: true }, (_event, filename) => {
    const file = String(filename ?? '');

    if (!file || file.includes('node_modules') || file.startsWith(`build-${state.id}`)) {
      return;
    }

    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await buildState(state);
        runtime.instance = undefined;
        runtime.lastFrame = undefined;
        runtime.lastError = undefined;
        runtime.notify({ type: 'reloaded', buildVersion: state.buildVersion });
        console.log(`Rebuilt ${state.id}.`);
      } catch (error) {
        state.buildError = error;
        runtime.lastError = error;
        runtime.notify({
          type: 'error',
          message: error instanceof Error ? error.message : String(error)
        });
        console.error(`Rebuild failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, 80);
  });

  return watcher;
}

async function handleRequest(request, response, state, runtime) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/') {
    return sendHtml(response, renderIndex(state));
  }

  if (url.pathname === '/api/frame') {
    return sendJson(response, await renderFrame(state, runtime));
  }

  if (url.pathname === '/api/clockface') {
    return sendJson(response, await getClockfaceView(state, runtime));
  }

  if (url.pathname === '/api/input' && request.method === 'POST') {
    const payload = await readJsonRequest(request);
    return sendJson(response, await submitInput(state, runtime, payload));
  }

  if (url.pathname === '/api/events') {
    return handleEvents(request, response, runtime);
  }

  sendNotFound(response);
}

async function getClockfaceView(state, runtime) {
  const instance = await runtime.getInstance();

  return {
    id: state.id,
    name: state.name,
    author: state.author,
    description: state.description,
    resolution: instance.resolution,
    updateIntervalMs: instance.updateIntervalMs,
    frameDelayMs: getFrameDelayMs(instance),
    buildPath: relative(state.root, state.outputModulePath).replaceAll('\\', '/'),
    data: { ...instance.data },
    inputs: instance.inputRows.map((row) => row.map(toInputView))
  };
}

async function renderFrame(state, runtime) {
  if (state.buildError) {
    throw state.buildError;
  }

  const instance = await runtime.getInstance();

  if (!runtime.rendering) {
    runtime.rendering = true;

    try {
      await instance.render();
      const frame = instance.getFrame();
      runtime.lastFrame = {
        id: state.id,
        name: state.name,
        size: frame.size,
        buffer: Array.from(frame.buffer),
        data: { ...instance.data },
        updateIntervalMs: instance.updateIntervalMs,
        frameDelayMs: getFrameDelayMs(instance),
        buildVersion: state.buildVersion
      };
    } finally {
      runtime.rendering = false;
    }
  }

  return runtime.lastFrame;
}

async function submitInput(state, runtime, payload) {
  if (!isRecord(payload)) {
    throw new Error('Input payload must be an object.');
  }

  const instance = await runtime.getInstance();
  const input = instance.inputs.find((item) => item.id === String(payload.id ?? ''));

  if (!input) {
    throw new Error(`Clockface input "${String(payload.id ?? '')}" was not found.`);
  }

  const value = input.type === 'input-file' ? normalizeFileInput(payload.value) : String(payload.value ?? '');
  await instance.submitInput(input.id, value);
  runtime.lastFrame = undefined;
  runtime.notify({ type: 'input', id: input.id });

  return {
    ok: true,
    data: { ...instance.data }
  };
}

function normalizeFileInput(value) {
  if (!isRecord(value)) {
    throw new Error('File input value must be an object.');
  }

  return {
    name: String(value.name ?? 'upload'),
    type: String(value.type ?? 'application/octet-stream'),
    size: Number(value.size ?? 0),
    bytes: Uint8Array.from(value.bytes ?? [])
  };
}

function getFrameDelayMs(instance) {
  const updateIntervalMs = Number(instance.updateIntervalMs ?? 0);

  if (updateIntervalMs <= 0) {
    return 0;
  }

  return updateIntervalMs + (SIMULATED_PACING_MS.get(instance.resolution) ?? 0);
}

function toInputView({
  type,
  id,
  friendlyName,
  options,
  accept,
  min,
  max,
  step,
  isSetting
}) {
  return {
    type,
    id,
    friendlyName,
    options,
    accept,
    min,
    max,
    step,
    isSetting: isSetting === true
  };
}

async function readJsonRequest(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString('utf-8');
  return body ? JSON.parse(body) : {};
}

function handleEvents(_request, response, runtime) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  response.write('\n');
  runtime.eventClients.add(response);
  response.on('close', () => {
    runtime.eventClients.delete(response);
  });
}

function renderIndex(state) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(state.name)} - PixooPal Preview</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #101218;
        color: #f4f7fb;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        grid-template-columns: minmax(280px, 1fr) minmax(280px, 360px);
        gap: 24px;
        padding: 24px;
      }

      main {
        min-width: 0;
        display: grid;
        align-content: start;
        gap: 16px;
      }

      aside {
        min-width: 0;
        display: grid;
        align-content: start;
        gap: 16px;
      }

      h1, h2, p {
        margin: 0;
      }

      h1 {
        font-size: 22px;
        font-weight: 700;
      }

      h2 {
        font-size: 14px;
        color: #bac5d4;
        text-transform: uppercase;
      }

      .meta, .error {
        border: 1px solid #2c3442;
        border-radius: 8px;
        padding: 12px;
        background: #171b24;
      }

      .meta {
        display: grid;
        gap: 7px;
        color: #c8d1dd;
        font-size: 13px;
      }

      .error {
        display: none;
        color: #ffd8d8;
        border-color: #7f3030;
        background: #281719;
        white-space: pre-wrap;
      }

      #preview {
        width: min(720px, calc(100vw - 48px));
        max-width: 100%;
        aspect-ratio: 1;
        display: grid;
        background: #000;
        border: 1px solid #323b4c;
        image-rendering: pixelated;
      }

      .pixel {
        min-width: 0;
        aspect-ratio: 1;
      }

      .inputs {
        display: grid;
        gap: 10px;
      }

      .input-row {
        display: grid;
        gap: 10px;
      }

      .field {
        display: grid;
        gap: 6px;
      }

      label {
        font-size: 13px;
        color: #dbe4ef;
      }

      input, select, button {
        width: 100%;
        border: 1px solid #333c4d;
        border-radius: 6px;
        padding: 8px 10px;
        background: #171b24;
        color: #f4f7fb;
        font: inherit;
      }

      button {
        cursor: pointer;
        background: #263246;
      }

      button:hover {
        background: #31415c;
      }

      input[type="color"] {
        padding: 3px;
        height: 38px;
      }

      @media (max-width: 820px) {
        body {
          grid-template-columns: 1fr;
          padding: 16px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>${escapeHtml(state.name)}</h1>
      </header>
      <div id="error" class="error"></div>
      <div id="preview"></div>
    </main>
    <aside>
      <section class="meta" id="meta"></section>
      <section>
        <h2>Inputs</h2>
        <div class="inputs" id="inputs"></div>
      </section>
    </aside>
    <script>
      const preview = document.getElementById('preview');
      const meta = document.getElementById('meta');
      const inputsRoot = document.getElementById('inputs');
      const errorBox = document.getElementById('error');
      let timer;
      let initialized = false;
      let currentFrameDelay = 0;

      const events = new EventSource('/api/events');
      events.onmessage = () => {
        schedule(0);
        loadClockface();
      };

      async function loadClockface() {
        const view = await fetchJson('/api/clockface');
        meta.innerHTML =
          '<div><strong>Author:</strong> ' + escapeHtml(view.author || 'Unknown') + '</div>' +
          '<div><strong>Resolution:</strong> ' + view.resolution + 'x' + view.resolution + '</div>' +
          '<div><strong>SDK interval:</strong> ' + view.updateIntervalMs + 'ms</div>' +
          '<div><strong>Frame delay:</strong> ' + view.frameDelayMs + 'ms</div>' +
          '<div><strong>Build:</strong> ' + escapeHtml(view.buildPath) + '</div>';

        renderInputs(view);
        initialized = true;
      }

      function renderInputs(view) {
        inputsRoot.textContent = '';

        for (const row of view.inputs) {
          const rowElement = document.createElement('div');
          rowElement.className = 'input-row';

          for (const input of row) {
            rowElement.appendChild(renderInput(input, view.data[input.id]));
          }

          inputsRoot.appendChild(rowElement);
        }
      }

      function renderInput(input, value) {
        const field = document.createElement('div');
        field.className = 'field';
        const label = document.createElement('label');
        label.textContent = input.friendlyName || input.id;
        field.appendChild(label);

        if (input.type === 'button') {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = input.friendlyName || input.id;
          button.addEventListener('click', () => submitInput(input.id, ''));
          field.appendChild(button);
          return field;
        }

        if (input.type === 'select') {
          const select = document.createElement('select');
          for (const option of input.options || []) {
            const item = document.createElement('option');
            item.value = option.value;
            item.textContent = option.label;
            item.selected = option.value === value;
            select.appendChild(item);
          }
          select.addEventListener('change', () => submitInput(input.id, select.value));
          field.appendChild(select);
          return field;
        }

        const control = document.createElement('input');
        control.value = value || '';

        if (input.type === 'input-num') {
          control.type = 'number';
          if (input.min !== undefined) control.min = input.min;
          if (input.max !== undefined) control.max = input.max;
          if (input.step !== undefined) control.step = input.step;
        } else if (input.type === 'colorpicker') {
          control.type = 'color';
        } else if (input.type === 'input-file') {
          control.type = 'file';
          if (input.accept) control.accept = input.accept;
          control.addEventListener('change', async () => {
            const file = control.files && control.files[0];
            if (!file) return;
            const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
            await submitInput(input.id, {
              name: file.name,
              type: file.type || 'application/octet-stream',
              size: file.size,
              bytes
            });
          });
          field.appendChild(control);
          return field;
        } else {
          control.type = 'text';
        }

        control.addEventListener('change', () => submitInput(input.id, control.value));
        field.appendChild(control);
        return field;
      }

      async function submitInput(id, value) {
        await fetchJson('/api/input', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, value })
        });
        schedule(0);
        await loadClockface();
      }

      async function render() {
        try {
          if (!initialized) {
            await loadClockface();
          }

          const frame = await fetchJson('/api/frame');
          errorBox.style.display = 'none';
          currentFrameDelay = frame.frameDelayMs;
          preview.style.gridTemplateColumns = 'repeat(' + frame.size + ', 1fr)';
          preview.textContent = '';

          for (let index = 0; index < frame.buffer.length; index += 3) {
            const pixel = document.createElement('div');
            pixel.className = 'pixel';
            pixel.style.backgroundColor =
              'rgb(' + (frame.buffer[index] || 0) + ',' + (frame.buffer[index + 1] || 0) + ',' + (frame.buffer[index + 2] || 0) + ')';
            preview.appendChild(pixel);
          }

          if (currentFrameDelay > 0) {
            schedule(currentFrameDelay);
          }
        } catch (error) {
          errorBox.textContent = error.message || String(error);
          errorBox.style.display = 'block';
          schedule(1000);
        }
      }

      function schedule(delay) {
        clearTimeout(timer);
        timer = setTimeout(render, delay);
      }

      async function fetchJson(url, options) {
        const response = await fetch(url, options);
        const text = await response.text();

        if (!response.ok) {
          throw new Error(text || response.statusText);
        }

        return text ? JSON.parse(text) : {};
      }

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (character) => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[character]);
      }

      schedule(0);
    </script>
  </body>
</html>`;
}

function sendHtml(response, body) {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8'
  });
  response.end(body);
}

function sendJson(response, body) {
  response.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(body));
}

function sendNotFound(response) {
  response.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  response.end('Not found');
}

function sendError(response, error) {
  response.writeHead(500, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  response.end(error instanceof Error ? error.message : String(error));
}

function parsePort(value) {
  const port = Number.parseInt(String(value), 10);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port "${value}".`);
  }

  return port;
}

function printRunHelp() {
  console.log(`Usage:
  pixoopal-preview run [--host 127.0.0.1] [--port 4174]`);
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
