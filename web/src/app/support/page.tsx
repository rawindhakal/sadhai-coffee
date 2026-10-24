import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { SITE } from '@/lib/site';
export const metadata: Metadata = { title: 'Support' };

export default function Support() {
  return (
    <LegalPage title="Support">
      <p>We answer every message. Email <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a> with your pickup number and the station, and we will sort it out.</p>
      <h2>Common questions</h2>
      <ul>
        <li><strong>My order is late.</strong> Show your pickup number to the barista. If it is more than five minutes past the time shown, tell us and we will refund or remake it.</li>
        <li><strong>I paid but have no order.</strong> Open Orders in the app. If it is missing, email us the eSewa reference.</li>
        <li><strong>How do I delete my account or download my data?</strong> In the app: Account, Profile. Or see <a href="/delete-account">Delete your account</a>.</li>
        <li><strong>My pass or coupon is missing.</strong> Check Offers. Expired and used ones are hidden there. Email us if you think one is wrong.</li>
      </ul>
      <h2 id="partner">Run Sadhai at your cafe</h2>
      <p>If you already run a cafe, a hospital counter or a campus kiosk, you can become a Sadhai partner: you keep your team and your space, we bring the app, the beans and the customers, and you earn a share of every sale on a clear statement. Email <a href={`mailto:${SITE.supportEmail}?subject=Partner%20cafe`}>{SITE.supportEmail}</a> with your cafe name and area.</p>
    </LegalPage>
  );
}
