import {
  defineClockface,
  data,
  input,
  type ClockfaceContext,
  type ClockfaceFileInputValue,
  type ClockfacePixel,
  type MediaType
} from '@pixoopal/clockface';
import { measureBitmapText } from '@pixoopal/clockface/bitmap-text';
import localPicture from './picture.png';

const RESOLUTION = __RESOLUTION__;
const STAR_COUNT = Math.max(10, Math.floor(RESOLUTION * 0.7));

let frame = 0;
let uploadedMedia: ClockfaceFileInputValue | undefined;
let uploadedMediaType: MediaType = 'image';
let stars = createStars();

export default defineClockface({
  // 16, 32 or 64 - it's the resolution of your clockface. Please note that lower resolution means better FPS.
  resolution: RESOLUTION,

  // It's a number of queued frames renderer will cache before sending. It saves us from CPU spikes, but it's important to know that any input will clear the queue. 
  // It should be equal to 0 in interactive clockfaces where state matters (like Snake game), because queue clearing will mess with it. 
  frameQueueSize: 1,

  // data is something persistent across clockface restarts. Good thing to have.
  data: {
    message: data.string('PIXOO'),
    size: data.number(Math.max(6, Math.floor(RESOLUTION / 4))),
    accent: data.color('#ffd650'),
    background: data.color('#05070c'),
    mode: data.select('all')
  },
  
  // There's all available methods. If their ID match with "data", then it'll automaticly save it's state.
  inputs: [
    input.text('message', 'Message'),
    input.number('size', 'Size', { min: 4, max: Math.max(8, Math.floor(RESOLUTION / 2)), step: 1 }),
    input.color('accent', 'Accent'),
    input.color('background', 'Background'),
    input.select('mode', 'Mode', [
      { value: 'all', label: 'All' },
      { value: 'media', label: 'Media' },
      { value: 'sparkle', label: 'Sparkle' }
    ]),
    input.file('media', 'Media', {
      accept: 'image/png,image/jpeg,image/webp,image/gif,video/*',
      isSetting: false,
      onSubmit(value, context) {
        if (
          typeof value !== 'object' ||
          value === null ||
          !('bytes' in value) ||
          !(value.bytes instanceof Uint8Array)
        ) {
          return;
        }

        uploadedMedia = value;
        uploadedMediaType = value.type.startsWith('video/')
          ? 'video'
          : value.type === 'image/gif' || value.name.toLowerCase().endsWith('.gif')
            ? 'gif'
            : 'image';
        context.data.mode = 'media';
      }
    }),
    input.button('reset', 'Reset', {
      isSetting: false,
      onSubmit(_value, context) {
        uploadedMedia = undefined;
        uploadedMediaType = 'image';
        context.data.message = 'HELLO';
        context.data.size = String(Math.max(6, Math.floor(context.resolution / 4)));
        context.data.accent = '#ffd650';
        context.data.background = '#05070c';
        context.data.mode = 'all';
        stars = createStars();
      }
    })
  ],
  interval: 120,
  render: (context) => {
    frame += 1;
    const size = Math.max(4, Math.min(Math.floor(context.resolution / 2), Number.parseInt(context.data.size, 10) || 12));

    drawBackdrop(context);
    drawStars(context);
    drawHeroShape(context, size);
    drawOrbit(context, size);

    const textX = 1;
    const text = fitBitmapText(context.data.message.toUpperCase(), context.resolution - textX - 1);
    context.canvas.text(text, textX, Math.max(0, context.resolution - 10), {
      fill: '#ffffff'
    });

    // If you want to draw existing animation, you don't have to worry about it's frames. Each render tick will automatically rotate frames for you.
    if (uploadedMedia && (context.data.mode === 'media' || context.data.mode === 'all')) {
      const mediaSize = Math.max(8, Math.floor(context.resolution * 0.34));
      context.canvas.media(uploadedMedia, uploadedMediaType, {
        x: context.resolution - mediaSize - 3,
        y: 3,
        width: mediaSize,
        height: mediaSize
      });
    }

    // You can also draw local assets from your Clockface folder.
    if (context.data.mode === 'media' || context.data.mode === 'all') {
      const assetSize = Math.max(6, Math.floor(context.resolution * 0.2));
      context.canvas.media(localPicture, 'image', {
        x: context.resolution - assetSize - 3,
        y: context.resolution - assetSize - 3,
        width: assetSize,
        height: assetSize
      });
    }

    // You can always work straight with a flat RGB pixel buffer if provided methods are not enough for you.
    if (context.data.mode === 'sparkle' || context.data.mode === 'all') {
      for (let pixelIndex = frame % 11; pixelIndex < context.resolution * context.resolution; pixelIndex += 37) {
        const offset = pixelIndex * 3;
        context.canvas.buffer[offset] = 255;
        context.canvas.buffer[offset + 1] = Math.max(context.canvas.buffer[offset + 1] ?? 0, 220);
        context.canvas.buffer[offset + 2] = Math.max(context.canvas.buffer[offset + 2] ?? 0, 130);
      }
    }
  }
});

function drawBackdrop(context: ClockfaceContext) {
  const top = colorFromHex(context.data.background);
  const bottom = mixPixel(top, colorFromHex(context.data.accent), 0.26);

  for (let y = 0; y < context.resolution; y += 1) {
    const amount = y / Math.max(1, context.resolution - 1);
    const color = mixPixel(top, bottom, amount);

    for (let x = 0; x < context.resolution; x += 1) {
      context.canvas.pixel(x, y, color);
    }
  }
}

function drawStars(context: ClockfaceContext) {
  for (const star of stars) {
    const twinkle = 0.45 + Math.sin(frame * star.speed + star.phase) * 0.35;
    const brightness = Math.max(60, Math.min(255, Math.round(star.brightness * twinkle)));
    context.canvas.pixel(star.x, star.y, [brightness, brightness, brightness]);
  }
}

function drawHeroShape(context: ClockfaceContext, size: number) {
  const center = Math.floor(context.resolution / 2);
  const accent = colorFromHex(context.data.accent);
  const radius = Math.max(3, size);

  context.canvas.circle(center, center, radius + 3, {
    fill: mixPixel(accent, [255, 255, 255], 0.18),
    opacity: 0.18
  });
  context.canvas.circle(center, center, radius, {
    fill: accent,
    stroke: '#ffffff',
    opacity: 0.82
  });
  context.canvas.circle(
    center - Math.max(1, Math.floor(radius / 3)),
    center - Math.max(1, Math.floor(radius / 3)),
    Math.max(1, Math.floor(radius / 4)),
    { fill: '#ffffff', opacity: 0.34 }
  );
}

function drawOrbit(context: ClockfaceContext, size: number) {
  const center = Math.floor(context.resolution / 2);
  const orbit = Math.max(4, Math.floor(context.resolution / 3));
  const x = center + Math.round(Math.cos(frame / 8) * orbit);
  const y = center + Math.round(Math.sin(frame / 8) * orbit);
  const dotSize = Math.max(1, Math.floor(size / 6));

  context.canvas.circle(x, y, dotSize, { fill: '#ffffff' });
  context.canvas.blendPixel(center, y, '#ffffff', 0.5);
  context.canvas.blendPixel(x, center, context.data.accent, 0.55);
}

function createStars() {
  return Array.from({ length: STAR_COUNT }, (_value, index) => ({
    x: (index * 17 + 3) % RESOLUTION,
    y: (index * 29 + 7) % RESOLUTION,
    speed: 0.08 + (index % 5) * 0.018,
    phase: index * 0.73,
    brightness: 130 + (index % 6) * 18
  }));
}

function fitBitmapText(text: string, maxWidth: number) {
  let result = '';

  for (const character of text) {
    const next = result + character;

    if (measureBitmapText(next) > maxWidth) {
      break;
    }

    result = next;
  }

  return result;
}

function colorFromHex(value: string): ClockfacePixel {
  const match = value.trim().match(/^#?([0-9a-f]{6})$/i);
  const hex = match?.[1] ?? 'ffffff';

  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ];
}

function mixPixel(start: ClockfacePixel, end: ClockfacePixel, amount: number): ClockfacePixel {
  const clamped = Math.max(0, Math.min(1, amount));

  return [
    Math.round(start[0] + (end[0] - start[0]) * clamped),
    Math.round(start[1] + (end[1] - start[1]) * clamped),
    Math.round(start[2] + (end[2] - start[2]) * clamped)
  ];
}
