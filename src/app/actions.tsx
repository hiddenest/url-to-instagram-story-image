'use server';

import { parse } from 'node-html-parser';
import sharp from 'sharp';
import satori from 'satori';
import { Transformer } from '@napi-rs/image';
import Color from 'color';

interface OGData {
  title: string;
  description: string;
  image: string;
  host: string;
}

async function fetchOGData(url: string): Promise<OGData> {
  const response = await fetch(url);
  const html = await response.text();
  const root = parse(html);

  const title =
    root.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    '';
  let description =
    root
      .querySelector('meta[property="og:description"]')
      ?.getAttribute('content') || '';
  const image =
    root.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
    '';

  // Get host from url
  const host = url.split('/')[2];

  // add ... to description if it's too long
  if (description.length > 50) {
    description = description.slice(0, 50) + '...';
  }

  return { title, description, image, host };
}

function generateLighterHarmoniousColor(baseColor: Color): Color {
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

async function generateGradient(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { dominant } = await sharp(buffer).stats();
  const baseColor = Color.rgb(dominant.r, dominant.g, dominant.b);

  const lighterColor = generateLighterHarmoniousColor(baseColor);

  return `linear-gradient(180deg, ${baseColor.rgb().string()}, ${lighterColor
    .rgb()
    .string()})`;
}

export async function generateOGImage(url: string): Promise<string> {
  const ogData = await fetchOGData(url);
  const gradient = await generateGradient(ogData.image);
  const fonts = await Promise.all(
    getFonts().map(async ({ promise, weight }) => {
      const data = await promise;
      return {
        name: 'Wanted Sans',
        style: 'normal' as const,
        data,
        weight,
      };
    }),
  );

  const svg = await satori(
    <div
      tw='w-full h-full flex flex-col justify-center items-center'
      style={{
        background: gradient,
        fontFamily: '"Wanted Sans", sans-serif',
      }}
    >
      <div tw='flex flex-col w-4/5 overflow-hidden rounded-[40px] shadow-2xl border border-solid border-black/10'>
        <img src={ogData.image} tw='object-contain' />
        <div tw='flex flex-col px-10 pt-7 pb-9 bg-white'>
          <h1 tw='w-full text-4xl leading-snug font-medium mb-0.5 text-[#08090A] m-0 mb-1'>
            {ogData.title}
          </h1>
          <p tw='w-full text-3xl leading-tight truncate text-[#3E4951] m-0 mb-6'>
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

function getFonts() {
  const FONT_CDN_HOST =
    'https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/otf';

  return [
    {
      name: 'normal',
      weight: 400 as const,
      promise: fetch(`${FONT_CDN_HOST}/WantedSans-Regular.otf`, {
        next: { revalidate: false },
      }).then(async (res) => res.arrayBuffer()),
    },
    {
      name: 'medium',
      weight: 500 as const,
      promise: fetch(`${FONT_CDN_HOST}/WantedSans-Medium.otf`, {
        next: { revalidate: false },
      }).then(async (res) => res.arrayBuffer()),
    },
  ];
}
