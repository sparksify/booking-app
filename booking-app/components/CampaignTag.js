import { resolveFacebookSource } from '@/lib/facebookAttribution.mjs';

export default function CampaignTag({ lead, booking }) {
  const source = resolveFacebookSource({ lead, booking });
  if (!source?.area) return null;
  const city = source.area.replace(/, [A-Z]{2}$/, '');
  return (
    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, lineHeight: 1.4, color: '#173C2A',
      background: '#EDF8F1', border: '1px solid #B7DEC5' }}>
      {city} campaign
    </span>
  );
}
