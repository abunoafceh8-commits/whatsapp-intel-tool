// WhatsApp Intel - Phone number OSINT
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function parsePhone(phone) {
  const clean = phone.replace(/[^0-9+]/g, '');
  const hasPlus = clean.startsWith('+');
  const digits = clean.replace('+', '');
  
  // Country detection
  const prefixes = {
    '1': { country: 'US/CA', flag: '🇺🇸' },
    '44': { country: 'UK', flag: '🇬🇧' },
    '966': { country: 'Saudi Arabia', flag: '🇸🇦' },
    '971': { country: 'UAE', flag: '🇦🇪' },
    '967': { country: 'Yemen', flag: '🇾🇪' },
    '20': { country: 'Egypt', flag: '🇪🇬' },
    '962': { country: 'Jordan', flag: '🇯🇴' },
    '961': { country: 'Lebanon', flag: '🇱🇧' },
    '964': { country: 'Iraq', flag: '🇮🇶' },
    '963': { country: 'Syria', flag: '🇸🇾' },
    '968': { country: 'Oman', flag: '🇴🇲' },
    '974': { country: 'Qatar', flag: '🇶🇦' },
    '973': { country: 'Bahrain', flag: '🇧🇭' },
    '965': { country: 'Kuwait', flag: '🇰🇼' },
    '212': { country: 'Morocco', flag: '🇲🇦' },
    '216': { country: 'Tunisia', flag: '🇹🇳' },
    '213': { country: 'Algeria', flag: '🇩🇿' },
    '218': { country: 'Libya', flag: '🇱🇾' },
    '249': { country: 'Sudan', flag: '🇸🇩' },
  };
  
  let country = { country: 'Unknown', flag: '🌍' };
  for (const [prefix, info] of Object.entries(prefixes)) {
    if (digits.startsWith(prefix)) {
      country = info;
      break;
    }
  }
  
  return { digits, country, formatted: hasPlus ? clean : '+' + clean };
}

async function checkWhatsApp(phone) {
  try {
    // Check if number is on WhatsApp via contact check API
    const r = await fetch(`https://api.whatsapp.com/send/?phone=${phone.digits}`, {
      headers: { 'User-Agent': UA },
      redirect: 'manual',
      signal: AbortSignal.timeout(5000)
    });
    const url = r.headers.get('location') || r.url;
    const onWhatsApp = url.includes('whatsapp.com') && !url.includes('phone_not_found');
    return { onWhatsApp, checkUrl: url };
  } catch {
    return { onWhatsApp: null };
  }
}

async function checkTruecaller(phone) {
  try {
    const r = await fetch(`https://search5-noneu.truecaller.com/v2/search?q=${phone.formatted}&countryCode=${phone.country.country}`, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    if (r.ok) {
      const data = await r.json();
      return { found: true, data };
    }
  } catch {}
  return { found: false };
}

async function searchGooglePhone(phone) {
  try {
    const r = await fetch(`https://www.google.com/search?q=%22${phone.formatted}%22`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(5000)
    });
    const html = await r.text();
    const mentions = [...html.matchAll(new RegExp(phone.digits.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3|$1-$2-$3|$1 $2 $3'), 'g'))];
    return { googleMentions: mentions.length };
  } catch {
    return { googleMentions: 0 };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = req.method === 'POST' 
    ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {})
    : {};
  const phone = body.phone || req.query?.phone || '';
  
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  const parsed = parsePhone(phone);
  
  const [wa, tc, google] = await Promise.allSettled([
    checkWhatsApp(parsed),
    checkTruecaller(parsed),
    searchGooglePhone(parsed)
  ]);

  res.json({
    found: true,
    phone: parsed,
    whatsapp: wa.status === 'fulfilled' ? wa.value : null,
    truecaller: tc.status === 'fulfilled' ? tc.value : null,
    google: google.status === 'fulfilled' ? google.value : null,
    intelligence: {
      country: parsed.country,
      formats: {
        international: parsed.formatted,
        national: parsed.digits.slice(-10) || parsed.digits,
        digits: parsed.digits
      },
      whatsappLink: `https://wa.me/${parsed.digits}`,
      timestamp: new Date().toISOString()
    }
  });
}
