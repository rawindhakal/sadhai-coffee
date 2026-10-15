'use client';
import { useEffect, useState } from 'react';
import { api } from './api';

// Built-in artwork used wherever the owner has not uploaded a picture.
export const HERO_DEFAULTS = { sun: '/img/hero-sun.svg', far: '/img/hero-far.svg', mid: '/img/hero-mid.svg', near: '/img/hero-near.svg', cup: '/img/cup-hot.svg' };
export const STEP_ART = ['/img/scene-kiosk.svg', '/img/scene-roastery.svg', '/img/scene-farm.svg'];
export const STORY_ART = ['/img/scene-farm.svg', '/img/scene-roastery.svg', '/img/scene-kiosk.svg'];

let cache: any = null;
let inflight: Promise<any> | null = null;
export function loadSiteContent() {
  inflight ||= api('/site', { auth: false }).then((s) => { cache = s; return s; }).catch(() => null);
  return inflight;
}
/** Hero text and pictures, steps, story, partner and investor pages as the owner last saved them. Null until loaded. */
export function useSiteContent(): any {
  const [site, setSite] = useState<any>(cache);
  useEffect(() => { loadSiteContent().then((s) => s && setSite(s)); }, []);
  return site;
}
export const pic = (slot: { url: string } | null | undefined, fallback: string) => slot?.url || fallback;

let cfgCache: any = null;
export function useConfig(): any {
  const [cfg, setCfg] = useState<any>(cfgCache);
  useEffect(() => { if (!cfgCache) api('/config', { auth: false }).then((c) => { cfgCache = c; setCfg(c); }).catch(() => {}); }, []);
  return cfg;
}
