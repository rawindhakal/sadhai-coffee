import Link from 'next/link';

/**
 * The one Sadhai logo: the bean mark and the lowercase wordmark. Every page, dashboard, kiosk and legal page uses this
 * component so the logo is identical everywhere. Do not restyle it per page.
 */
export function Logo({ size = 30, href = '/', as = 'link', onClick }: { size?: number; href?: string; as?: 'link' | 'button' | 'plain'; onClick?: () => void }) {
  const inner = (
    <>
      <img src="/mark-cherry.svg" alt="" width={size} height={size} style={{ width: size, height: size }} />
      <span>sadhai</span>
    </>
  );
  const style = { fontSize: Math.round(size * 0.8) };
  if (as === 'button') return <button className="brand" style={{ ...style, background: 'none', border: 0, cursor: 'pointer' }} onClick={onClick} aria-label="Sadhai Coffee">{inner}</button>;
  if (as === 'plain') return <span className="brand" style={style} aria-label="Sadhai Coffee">{inner}</span>;
  return <Link href={href} className="brand" style={style} aria-label="Sadhai Coffee home">{inner}</Link>;
}
