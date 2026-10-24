import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal';
import { SITE } from '@/lib/site';
export const metadata: Metadata = { title: 'Privacy policy' };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>{SITE.brand} (“we”, “us”) runs a coffee ordering app and website for stations and partner cafes in Nepal. This policy explains what we collect, why, who sees it, how long we keep it, and the choices you have. The data controller is {SITE.company}, {SITE.address}. Questions: <a href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a>.</p>

      <h2>What we collect</h2>
      <table><thead><tr><th>Data</th><th>Why we need it</th><th>Optional?</th></tr></thead><tbody>
        <tr><td>Name, mobile number, password (stored as a one-way hash)</td><td>Create and secure your account, show your name on your order</td><td>Required to order</td></tr>
        <tr><td>Email address</td><td>Receipts and account help</td><td>Optional</td></tr>
        <tr><td>Orders, items, pickup number, ratings and notes</td><td>Make and hand over your order, support, refunds, loyalty and our accounts</td><td>Required to order</td></tr>
        <tr><td>Payment method (cash or pass) and the amount</td><td>Record what you paid and balance the counter's cash. We take no online payments, so we never see or store a card, wallet or bank login</td><td>Required to pay</td></tr>
        <tr><td>Approximate or precise location, only while you use “Use my location”</td><td>Sort stations by distance. Your coordinates are sent with that one request and are not saved or logged</td><td>Optional. You can pick a station by hand</td></tr>
        <tr><td>Notification token and device type (if you allow notifications)</td><td>Send push notifications: your order is ready, your pass is ending, and offers if you have not opted out. Offers are limited to one a day and can be turned off in Profile</td><td>Optional</td></tr>
        <tr><td>Name and mobile number typed at a self-order kiosk</td><td>Call your order and, if the number belongs to a Sadhai account, link the order to it. You are asked to agree on the kiosk screen</td><td>Required to use the kiosk. You can order at the counter instead</td></tr>
        <tr><td>Staff only: shifts, check-in and check-out times, hourly rate and payslips</td><td>Plan the roster and pay people correctly. Only that person, the managers of their station and the owner can see it</td><td>Required to work a shift</td></tr>
        <tr><td>Passes, coupons, referral code and bean balance</td><td>Run the offers you have earned</td><td>Part of your account</td></tr>
      </tbody></table>
      <p>We do not use advertising identifiers, we do not track you across other apps or websites, we do not sell personal data, and we do not collect contacts, photos or microphone data.</p>

      <h2>Who sees it</h2>
      <ul>
        <li><strong>The station or partner cafe you order from</strong> sees your first name, pickup number and order so they can make it. Partner cafes do not receive your phone number.</li>
        <li><strong>Our staff</strong> (managers and owners) see orders and account details to run the service, handle refunds and keep accurate records. Access is by role and every sensitive action is logged.</li>
        <li><strong>Hosting and infrastructure providers</strong> store data on our behalf under contract.</li>
        <li>Authorities, where the law requires it.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>Account data is kept while your account is open. If you delete your account we erase your name, phone, email, notification token and messages and expire unused coupons and passes. We keep order and payment records, with your identity removed, for as long as tax and accounting law in Nepal requires. Orders placed at a kiosk without an account keep the name and number typed at the kiosk; email us and we will remove them from those records.</p>

      <h2>Your choices and rights</h2>
      <ul>
        <li><strong>Delete your account</strong> inside the app (Account, Profile, Delete my account) or on <a href="/delete-account">this page</a>.</li>
        <li><strong>Download your data</strong> from Profile, Download my data.</li>
        <li><strong>Correct your details</strong> in Profile, or ask us.</li>
        <li><strong>Turn off location or notifications</strong> in your phone settings at any time. The app keeps working.</li>
        <li>Contact <a href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a> for any other request.</li>
      </ul>

      <h2>Security</h2>
      <p>Connections use HTTPS. Passwords are hashed. Sign-in tokens expire and can be revoked. Staff access is limited by role. No system is perfectly secure, so please use a password you do not use elsewhere.</p>

      <h2>Children</h2>
      <p>The service is for people aged 16 and over, or younger with a parent’s agreement. We do not knowingly collect data from children under 13.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we will tell you in the app before it takes effect.</p>
      <p className="note small">Draft for review: have a Nepali lawyer confirm this text and fill in the company details in <code>web/src/lib/site.ts</code> before you publish to the stores.</p>
    </LegalPage>
  );
}
