// Renders the brand mark into the PNGs the app stores need. Source of truth: /brand/*.svg
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
const out = new URL('../../mobile/assets/icon/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const mark = (fill, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><g transform="rotate(20 48 48)"><ellipse cx="48" cy="48" rx="33" ry="42" fill="${fill}"/><path d="M47 10 L55 32 L41 48 L55 64 L47 86" fill="none" stroke="${stroke}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
const CHERRY = '#A81F2A', CREAM = '#FBF4E8';

// iOS and Play listing icon: full bleed, no transparency (the stores round the corners themselves).
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${CHERRY}"/><g transform="translate(96 96) scale(3.3333)">${mark(CREAM, CHERRY).replace(/<\/?svg[^>]*>/g, '')}</g></svg>`;
await sharp(Buffer.from(full), { density: 384 }).resize(1024, 1024).flatten({ background: CHERRY }).png().toFile(out + 'icon.png');
// Android adaptive foreground: mark inside the 66% safe zone on a transparent canvas.
const fg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><g transform="translate(24 24) scale(.625)">${mark(CREAM, CHERRY).replace(/<\/?svg[^>]*>/g, '')}</g></svg>`;
await sharp(Buffer.from(fg), { density: 600 }).resize(1024, 1024).png().toFile(out + 'icon_foreground.png');
// Splash mark (cherry bean on cream).
await sharp(Buffer.from(mark(CHERRY, CREAM)), { density: 600 }).resize(512, 512).png().toFile(out + 'splash.png');
console.log('icons written to', out);
