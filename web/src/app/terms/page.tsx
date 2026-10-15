import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { SITE } from '@/lib/site';
export const metadata: Metadata = { title: 'Terms of use' };

export default function Terms() {
  return (
    <LegalPage title="Terms of use">
      <p>These terms cover your use of the {SITE.brand} app and website. By creating an account you agree to them.</p>
      <h2>Orders and prices</h2>
      <ul><li>Prices are in Nepali rupees and include VAT and service. Nothing is added at the counter.</li><li>You pay when you order (Fonepay QR or a pass) or at the counter in cash where offered. An order is accepted when you see its pickup number.</li><li>Stations can stop taking orders if they are closed, paused or out of an item. We will not charge you for an order we cannot make.</li><li>You can cancel before the barista starts. After that the drink is being made and cannot be cancelled.</li></ul>
      <h2>Refunds</h2>
      <p>If something is wrong with your order, tell the station or contact support. We refund orders we cannot fulfil or that are not as described. Digital refunds go back through the payment provider and can take a few working days.</p>
      <h2>10-cup pass</h2>
      <p>Each pass gives ten drinks (food and merch are not included) at any Sadhai station and has its own code. You can buy as many passes as you like and they are used one after another. A pass starts its 30 days when you use its first cup, and a pass you have not started can wait up to 180 days from purchase. Unused cups expire with the pass. A pass belongs to your account and is not transferable or redeemable for cash.</p>
      <h2>Coupons, offers and referrals</h2>
      <p>Offers have the limits shown with them: one per customer, an end date, a monthly cap on referral cups. Offers of the day are set by stations and can change or end. We may withdraw offers used in a way that is not fair, such as fake accounts.</p>
      <h2>Your account</h2>
      <p>Keep your password private. You are responsible for activity on your account. You can delete it at any time from the app.</p>
      <h2>Using the service properly</h2>
      <p>Do not misuse the service, attempt to access other accounts, or interfere with how it works.</p>
      <h2>Partner cafes</h2>
      <p>Some stations are run by independent partner cafes under licence. Food preparation and the counter experience are the cafe’s responsibility, and {SITE.brand} remains responsible for your order, payment and support.</p>
      <h2>Liability</h2>
      <p>We do our best to keep the service running and your coffee hot, but we cannot promise it will always be available. Nothing in these terms limits rights you have under Nepali consumer law.</p>
      <h2>Contact</h2>
      <p>{SITE.company}, {SITE.address}. <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.</p>
      <p className="note small">Draft for review: have a Nepali lawyer confirm these terms before you publish to the stores.</p>
    </LegalPage>
  );
}
