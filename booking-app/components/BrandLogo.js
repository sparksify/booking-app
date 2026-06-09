/**
 * Sidebar brand mark. Shows the uploaded platform logo when set, otherwise
 * falls back to the default KANSO wordmark. Used in every dashboard sidebar.
 */
export default function BrandLogo({ logo }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt="Logo"
        style={{ maxHeight: 36, maxWidth: 168, objectFit: 'contain', display: 'block' }}
      />
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: '#0057FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>K</div>
      <span style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', letterSpacing: '-0.2px' }}>KANSO</span>
    </div>
  );
}
