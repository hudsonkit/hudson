#!/usr/bin/env bun
/**
 * Render the landing walkthrough's voiceover with ElevenLabs.
 *
 *   secret run ELEVENLABS_API_KEY -- bun scripts/render-walkthrough-voice.ts [--force]
 *
 * Writes one MP3 per step to apps/web/public/walkthrough/<id>.mp3 and the
 * manifest apps/web/marketing/walkthrough/voice.json ({ src, duration, text }).
 * A line is re-rendered only when its text (or the voice) changes.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { WALKTHROUGH } from '../apps/web/marketing/walkthrough/script';

const VOICE_ID = 'XrExE9yKIg1WjnnlVkGX'; // Matilda — clear, professional, informative
const MODEL_ID = 'eleven_multilingual_v2';
const VOICE_SETTINGS = { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true };

const root = join(import.meta.dir, '..');
const outDir = join(root, 'apps/web/public/walkthrough');
const manifestPath = join(root, 'apps/web/marketing/walkthrough/voice.json');

type Clip = { src: string; duration: number; text: string; voice: string };

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('ELEVENLABS_API_KEY is not set. Run through: secret run ELEVENLABS_API_KEY -- bun …');
  process.exit(1);
}
const force = process.argv.includes('--force');

const manifest: Record<string, Clip> = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{}'));
await mkdir(outDir, { recursive: true });

for (const step of WALKTHROUGH) {
  const existing = manifest[step.id];
  if (!force && existing && existing.text === step.say && existing.voice === VOICE_ID) {
    console.log(`= ${step.id} (unchanged)`);
    continue;
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: step.say, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
  });
  if (!res.ok) {
    console.error(`✗ ${step.id}: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const data = (await res.json()) as {
    audio_base64: string;
    alignment?: { character_end_times_seconds?: number[] };
  };
  const ends = data.alignment?.character_end_times_seconds ?? [];
  const duration = Math.round((ends.at(-1) ?? 0) * 100) / 100;

  await writeFile(join(outDir, `${step.id}.mp3`), Buffer.from(data.audio_base64, 'base64'));
  manifest[step.id] = { src: `/walkthrough/${step.id}.mp3`, duration, text: step.say, voice: VOICE_ID };
  console.log(`✓ ${step.id} ${duration}s`);
}

// Drop clips for steps that no longer exist.
for (const id of Object.keys(manifest)) {
  if (!WALKTHROUGH.some(step => step.id === id)) delete manifest[id];
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${manifestPath}`);
