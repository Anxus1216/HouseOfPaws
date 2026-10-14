import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Tiny, original UI cues. Run with `node scripts/generate-audio.mjs` after edits.
const sampleRate = 22050;
const cues = {
  care: [[523, .10], [659, .10]],
  catch: [[784, .12]],
  adopt: [[523, .10], [659, .10], [784, .16]],
  level: [[659, .10], [784, .10], [1047, .20]],
};

function wav(notes) {
  const samples = [];
  for (const [frequency, seconds] of notes) {
    const count = Math.round(seconds * sampleRate);
    for (let i = 0; i < count; i++) {
      const phase = i / sampleRate;
      const envelope = Math.min(1, i / 180) * Math.min(1, (count - i) / 900);
      const tone = Math.sin(2 * Math.PI * frequency * phase) * .24 * envelope;
      samples.push(Math.round(tone * 32767));
    }
  }
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, 44 + index * 2));
  return buffer;
}

mkdirSync('audio', { recursive: true });
for (const [name, notes] of Object.entries(cues)) writeFileSync(join('audio', `${name}.wav`), wav(notes));
