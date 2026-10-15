'use client';
import { createContext, useContext, useEffect, useState } from 'react';

const dict: Record<string, [string, string]> = {
  tagline: ['Good coffee, every day.', 'सधैं राम्रो कफी।'],
  support: ['Grown in the hills. Ready in 90 seconds.', 'पहाडमा फलेको, ९० सेकेन्डमा तयार।'],
  order_ahead: ['Order ahead', 'अगाडि अर्डर गर्नुहोस्'],
  choose_station: ['Choose a station', 'स्टेशन छान्नुहोस्'],
  open_now: ['Open now', 'अहिले खुला'],
  closed: ['Closed', 'बन्द'],
  wait: ['wait', 'प्रतीक्षा'],
  min: ['min', 'मिनेट'],
  add: ['Add', 'थप्नुहोस्'],
  cart: ['Your order', 'तपाईंको अर्डर'],
  checkout: ['Checkout', 'भुक्तानी'],
  place_order: ['Place order', 'अर्डर गर्नुहोस्'],
  pay_with: ['Pay with', 'भुक्तानी विधि'],
  cash: ['Cash at counter', 'काउन्टरमा नगद'],
  pass: ['10-cup pass', '१०-कप पास'],
  prices_note: ['Prices in NPR. VAT and service included.', 'सबै कर समावेश, थप केही छैन।'],
  my_account: ['Account', 'खाता'],
  sold_out: ['Finished for today', 'आजको लागि सकियो'],
  offer: ['Offer', 'अफर'],
  none: ['No offer', 'अफर छैन'],
  total: ['Total', 'जम्मा'],
  your_coffee: ['Your coffee in 90 seconds.', '९० सेकेन्डमा तपाईंको कफी तयार।'],
};
type L = 'en' | 'ne';
const Ctx = createContext<{ lang: L; setLang: (l: L) => void; t: (k: string) => string }>({ lang: 'en', setLang() {}, t: (k) => k });
export const useI18n = () => useContext(Ctx);
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setL] = useState<L>('en');
  useEffect(() => { try { const v = localStorage.getItem('sadhai.lang'); if (v === 'ne' || v === 'en') setL(v); } catch {} }, []);
  const setLang = (l: L) => { setL(l); try { localStorage.setItem('sadhai.lang', l); } catch {} };
  const t = (k: string) => dict[k]?.[lang === 'ne' ? 1 : 0] ?? k;
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
export const LangToggle = () => {
  const { lang, setLang } = useI18n();
  return <button className="btn ghost sm" onClick={() => setLang(lang === 'en' ? 'ne' : 'en')} aria-label="Change language">{lang === 'en' ? 'नेपाली' : 'English'}</button>;
};
