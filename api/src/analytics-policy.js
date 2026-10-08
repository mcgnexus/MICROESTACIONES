export const METRIC_EVENTS = ['home_visit', 'locked_tool_open', 'access_requested', 'contact_verified', 'first_expanded_query', 'agricultural_profile_completed', 'commercial_authorized', 'installation_interest'];
export const PUBLIC_METRIC_EVENTS = ['home_visit', 'locked_tool_open'];
const sources = ['google', 'bing', 'facebook', 'instagram', 'whatsapp', 'qr', 'newsletter', 'partner'];
const media = ['organic', 'social', 'email', 'cpc', 'qr', 'referral'];
// Un slug puede seguir siendo un teléfono o un token. Solo se admiten valores
// exactos del catálogo, nunca texto libre ni URLs/referrer.
export function campaignBucket(input = {}, campaigns = []) {
  const source = String(input.source ?? input.utm_source ?? '').toLowerCase();
  const medium = String(input.medium ?? input.utm_medium ?? '').toLowerCase();
  const campaign = String(input.campaign ?? input.utm_campaign ?? '').toLowerCase();
  return [source ? (sources.includes(source) ? source : 'other') : 'direct',
    media.includes(medium) ? medium : 'none', campaigns.includes(campaign) ? campaign : 'none'].join('|');
}
export function completedAgriculturalProfile(profile) {
  return ['agricultura', 'ganaderia', 'mixta'].includes(profile?.activity)
    && Boolean(profile?.municipality?.trim() && (profile.cropOrLivestock ?? profile.crop_or_livestock)?.trim() && profile.interest);
}
export function ratio(numerator, denominator) {
  return { numerator, denominator, percent: denominator ? Math.round(numerator / denominator * 1000) / 10 : null };
}

export function aggregateMetrics(counters, subjects, campaigns = []) {
  const buckets = new Map();
  const empty = () => ({ events: Object.fromEntries(METRIC_EVENTS.map((event) => [event, 0])), registered: 0, verified: 0, activated: 0, agricultural: 0, verifiedAgricultural: 0, authorized: 0, installation: 0, verifiedAgriculturalAuthorized: 0, agriculturalInstallation: 0 });
  for (const row of counters) {
    if (!METRIC_EVENTS.includes(row.event)) continue;
    if (!buckets.has(row.bucket)) buckets.set(row.bucket, empty());
    buckets.get(row.bucket).events[row.event] += row.count;
  }
  for (const s of subjects) {
    const bucket = campaignBucket(s.acquisition, campaigns);
    if (!buckets.has(bucket)) buckets.set(bucket, empty());
    const row = buckets.get(bucket); row.registered++;
    const agricultural = Boolean(s.agricultural);
    row.verified += Number(Boolean(s.verified)); row.activated += Number(Boolean(s.activated));
    row.agricultural += Number(agricultural); row.verifiedAgricultural += Number(agricultural && Boolean(s.verified));
    row.authorized += Number(Boolean(s.authorized)); row.installation += Number(Boolean(s.installation));
    row.verifiedAgriculturalAuthorized += Number(agricultural && Boolean(s.verified) && Boolean(s.authorized));
    row.agriculturalInstallation += Number(agricultural && Boolean(s.installation));
  }
  const total = empty();
  for (const row of buckets.values()) {
    for (const key of Object.keys(total).filter((key) => key !== 'events')) total[key] += row[key];
    for (const event of METRIC_EVENTS) total.events[event] += row.events[event];
  }
  const rates = (row) => ({ verified: ratio(row.verified, row.registered), activated: ratio(row.activated, row.registered),
    agricultural: ratio(row.verifiedAgricultural, row.registered), authorized: ratio(row.authorized, row.registered), installation: ratio(row.installation, row.registered) });
  return { total, rates: rates(total), channels: [...buckets].map(([bucket, row]) => ({ bucket, ...row, rates: rates(row) })) };
}
