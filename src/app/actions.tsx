'use server';

import { parse } from 'node-html-parser';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import path from 'node:path';
import sharp from 'sharp';
import satori from 'satori';
import { Transformer } from '@napi-rs/image';
import Color from 'color';

interface OGData {
  title: string;
  description: string;
  image: string | null;
  host: string;
}

const MAX_DESCRIPTION_LENGTH = 50;
const STORY_FONT_NAME = 'Story Sans';
const require = createRequire(import.meta.url);

function isPrivateOrLocalHost(hostname: string): boolean {
  const normalizedHost = hostname.toLowerCase();
  if (
    normalizedHost === 'localhost' ||
    normalizedHost.endsWith('.localhost') ||
    normalizedHost.endsWith('.local')
  ) {
    return true;
  }

  const ipType = isIP(normalizedHost);
  if (!ipType) {
    return false;
  }

  if (ipType === 4) {
    const [a, b] = normalizedHost.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  return (
    normalizedHost === '::1' ||
    normalizedHost.startsWith('fc') ||
    normalizedHost.startsWith('fd') ||
    normalizedHost.startsWith('fe80:')
  );
}

async function isPublicHostname(hostname: string): Promise<boolean> {
  if (isPrivateOrLocalHost(hostname)) {
    return false;
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0) {
      return false;
    }

    return addresses.every((address) => !isPrivateOrLocalHost(address.address));
  } catch {
    return false;
  }
}

function getMetaContent(root: ReturnType<typeof parse>, selector: string): string {
  return root.querySelector(selector)?.getAttribute('content')?.trim() || '';
}

async function fetchOGData(url: string): Promise<OGData> {
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  if (
    !['http:', 'https:'].includes(parsedUrl.protocol) ||
    !(await isPublicHostname(parsedUrl.hostname))
  ) {
    return {
      title: host,
      description: '',
      image: null,
      host,
    };
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; OGStoryGenerator/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }

    const html = await response.text();
    const root = parse(html);

    const title =
      getMetaContent(root, 'meta[property="og:title"]') ||
      getMetaContent(root, 'meta[name="twitter:title"]') ||
      root.querySelector('title')?.textContent.trim() ||
      host;

    let description =
      getMetaContent(root, 'meta[property="og:description"]') ||
      getMetaContent(root, 'meta[name="twitter:description"]');

    if (description.length > MAX_DESCRIPTION_LENGTH) {
      description = `${description.slice(0, MAX_DESCRIPTION_LENGTH)}...`;
    }

    const imageCandidate =
      getMetaContent(root, 'meta[property="og:image"]') ||
      getMetaContent(root, 'meta[name="twitter:image"]');

    const image = imageCandidate
      ? new URL(imageCandidate, response.url).toString()
      : null;

    return { title, description, image, host };
  } catch {
    return {
      title: host,
      description: '',
      image: null,
      host,
    };
  }
}

function generateLighterHarmoniousColor(baseColor: ReturnType<typeof Color.rgb>) {
  const hue = baseColor.hue();
  const saturation = baseColor.saturationl();
  const lightness = baseColor.lightness();

  // Shift hue slightly for variety
  const newHue = (hue + 20) % 360;

  // Reduce saturation and increase lightness
  const newSaturation = Math.max(saturation * 0.7, 20); // Ensure some saturation remains
  const newLightness = Math.min(lightness * 1.8, 95); // Make it lighter, but not pure white

  return Color.hsl(newHue, newSaturation, newLightness);
}

async function generateGradient(imageUrl: string | null): Promise<string> {
  const fallbackGradient = 'linear-gradient(180deg, #1f2937, #4b5563)';

  if (!imageUrl) {
    return fallbackGradient;
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return fallbackGradient;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { dominant } = await sharp(buffer).stats();
    const baseColor = Color.rgb(dominant.r, dominant.g, dominant.b);
    const lighterColor = generateLighterHarmoniousColor(baseColor);

    return `linear-gradient(180deg, ${baseColor.rgb().string()}, ${lighterColor
      .rgb()
      .string()})`;
  } catch {
    return fallbackGradient;
  }
}

export async function generateOGImage(url: string): Promise<string> {
  const ogData = await fetchOGData(url);
  const gradient = await generateGradient(ogData.image);
  const fonts = await getFonts();

  const svg = await satori(
    <div
      tw='w-full h-full flex flex-col justify-center items-center'
      style={{
        background: gradient,
        fontFamily: `"${STORY_FONT_NAME}", sans-serif`,
      }}
    >
      <div tw='flex flex-col w-4/5 overflow-hidden rounded-[40px] shadow-2xl border border-solid border-black/10'>
        {ogData.image ? (
          <img src={ogData.image} alt={ogData.title} tw='object-contain' />
        ) : (
          <div tw='h-[640px] flex items-center justify-center bg-black/20 text-white text-3xl'>
            No preview image
          </div>
        )}
        <div tw='flex flex-col px-10 pt-7 pb-9 bg-white'>
          <h1 tw='w-full text-4xl leading-snug font-medium mb-0.5 text-[#08090A] m-0 mb-1'>
            {ogData.title}
          </h1>
          <p tw='w-full text-3xl leading-tight text-[#3E4951] m-0 mb-6 max-h-[140px] overflow-hidden'>
            {ogData.description}
          </p>
          <p tw='text-2xl leading-none text-[#97A1A9] m-0'>{ogData.host}</p>
        </div>
      </div>
    </div>,
    {
      width: 1080,
      height: 1920,
      fonts,
    },
  );

  const trasformer = Transformer.fromSvg(svg); // satori result
  const png = await trasformer.png();

  return `data:image/png;base64,${png.toString('base64')}`;
}

async function getFonts() {
  const FONT_CDN_HOST =
    'https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/otf';

  const fontDefinitions = [
    {
      weight: 400 as const,
      url: `${FONT_CDN_HOST}/WantedSans-Regular.otf`,
    },
    {
      weight: 500 as const,
      url: `${FONT_CDN_HOST}/WantedSans-Medium.otf`,
    },
  ];

  const fonts = await Promise.all(
    fontDefinitions.map(async ({ url, weight }) => {
      try {
        const response = await fetch(url, {
          next: { revalidate: false },
        });

        if (!response.ok) {
          return null;
        }

        return {
          name: STORY_FONT_NAME,
          style: 'normal' as const,
          data: await response.arrayBuffer(),
          weight,
        };
      } catch {
        return null;
      }
    }),
  );

  const availableFonts = fonts.filter((font) => font !== null);
  if (availableFonts.length > 0) {
    return availableFonts;
  }

  const interPackagePath = require.resolve('@fontsource/inter/package.json');
  const localFallbackFontPath = path.join(
    path.dirname(interPackagePath),
    'files',
    'inter-latin-400-normal.woff',
  );
  const localFallbackFont = await readFile(localFallbackFontPath);

  return [
    {
      name: STORY_FONT_NAME,
      style: 'normal' as const,
      data: localFallbackFont,
      weight: 400 as const,
    },
  ];
}
