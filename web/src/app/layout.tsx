import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';
import { CartProvider } from '@/lib/cart';
import { ToastProvider } from '@/components/ui';

export const metadata: Metadata = {
  title: { default: 'Sadhai Coffee', template: '%s · Sadhai Coffee' },
  description: 'Good coffee, every day. Order ahead, pick up in 90 seconds.',
  icons: { icon: '/app-icon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#A81F2A' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Hind:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AuthProvider><I18nProvider><ToastProvider><CartProvider>{children}</CartProvider></ToastProvider></I18nProvider></AuthProvider>
      </body>
    </html>
  );
}
