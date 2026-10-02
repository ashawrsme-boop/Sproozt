/* ═══════════════════════════════════════════════════════
   Sproozt waitlist sign-up  →  POST /api/waitlist
   Adds the person to the Brevo waitlist and returns their
   member number (SPZ- + Brevo contact ID, zero-padded).

   Netlify environment variables:
     BREVO_API_KEY   Brevo → SMTP & API → API keys
     BREVO_LIST_ID   numeric ID of the "Waitlist" list in Brevo
═══════════════════════════════════════════════════════ */

const BREVO = 'https://api.brevo.com/v3';

const AGE_RANGES = ['18–24', '25–34', '35–44', '45–54', '55+', 'Prefer not to say'];
const GENDERS    = ['Woman', 'Man', 'Non-binary', 'Prefer not to say', 'Self-describe'];
const CAR_TYPES  = ['Hatchback', 'Sedan', 'Estate', 'SUV', 'Pickup', 'Van', 'Coupé / Sports', 'Other'];
const WASH_FREQS = ['Every week', 'Every 2 weeks', 'Once a month', 'Every few months', 'Rarely or never'];

export const config = { path: '/api/waitlist' };

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const apiKey = process.env.BREVO_API_KEY;
  const listId = Number(process.env.BREVO_LIST_ID);
  if (!apiKey || !Number.isInteger(listId) || listId <= 0) {
    console.error('Waitlist not configured: set BREVO_API_KEY and a positive whole-number BREVO_LIST_ID in Netlify.');
    return json(500, { error: 'not_configured' });
  }

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'invalid', field: 'form' }); }

  /* Spam trap: people never see this field */
  if (body.website) return json(400, { error: 'invalid', field: 'form' });

  const firstName = clean(body.firstName, 60);
  const lastName  = clean(body.lastName, 60);
  const email     = clean(body.email, 254).toLowerCase();
  const phone     = clean(body.phone, 24).replace(/^00/, '+').replace(/[\s\-().]/g, '');
  const ageRange  = AGE_RANGES.includes(body.ageRange) ? body.ageRange : '';
  const gender    = GENDERS.includes(body.gender) ? body.gender : '';
  const genderSelf = gender === 'Self-describe' ? clean(body.genderSelf, 60) : '';
  const carType   = CAR_TYPES.includes(body.carType) ? body.carType : '';
  const washFreq  = WASH_FREQS.includes(body.washFrequency) ? body.washFrequency : '';
  const marketing = body.marketing === true;

  if (!firstName) return json(400, { error: 'invalid', field: 'firstName' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'invalid', field: 'email' });
  if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) return json(400, { error: 'invalid', field: 'phone' });

  const attributes = {
    FIRSTNAME: firstName,
    ...(lastName && { LASTNAME: lastName }),
    ...(phone    && { SMS: phone }),          // Brevo's built-in phone field: international format, unique per contact
    WAITLIST_JOINED: new Date().toISOString().slice(0, 10),
    MARKETING_OPT_IN: marketing,
    ...(ageRange   && { AGE_RANGE: ageRange }),
    ...(gender     && { GENDER: gender }),
    ...(genderSelf && { GENDER_SELF: genderSelf }),
    ...(carType    && { CAR_TYPE: carType }),
    ...(washFreq   && { WASH_FREQUENCY: washFreq })
  };

  const brevo = (path, method, payload) => fetch(BREVO + path, {
    method,
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined
  });

  const contactPath = '/contacts/' + encodeURIComponent(email);
  const memberNumberFor = id => 'SPZ-' + String(id).padStart(5, '0');

  /* Saves the member number on the contact, with one retry. Returns whether Brevo confirmed it. */
  const saveMemberNumber = async memberNumber => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await brevo(contactPath, 'PUT', { attributes: { MEMBER_NUMBER: memberNumber } });
        if (res.ok) return true;
        console.error(`Saving ${memberNumber} failed (attempt ${attempt}): Brevo ${res.status} ${await res.text().catch(() => '')}`);
      } catch (e) {
        console.error(`Saving ${memberNumber} failed (attempt ${attempt}):`, e);
      }
    }
    return false;
  };

  try {
    /* 1. Try to create a brand-new contact on the waitlist */
    const created = await brevo('/contacts', 'POST', { email, attributes, listIds: [listId], updateEnabled: false });

    if (created.status === 201) {
      /* 2. New contact: the member number comes from the ID Brevo just assigned, so it needs a second request.
            The person is on the waitlist either way; memberNumberSaved says whether Brevo stored the number.
            If it didn't, step 3 completes it the next time this email is submitted. */
      const memberNumber = memberNumberFor((await created.json()).id);
      const memberNumberSaved = await saveMemberNumber(memberNumber);
      if (!memberNumberSaved) console.error(`Contact ${email} is on the waitlist but MEMBER_NUMBER ${memberNumber} is not saved in Brevo.`);
      return json(201, { memberNumber, memberNumberSaved });
    }

    const err = await created.json().catch(() => ({}));
    if (err.code !== 'duplicate_parameter') throw new Error(`Brevo create ${created.status}: ${err.message}`);

    /* 3. Something is already taken. Is it this email, or only the phone number? */
    const found = await brevo(contactPath, 'GET');
    if (found.status === 404) return json(409, { error: 'phone_taken' });   // email is free, so the phone clashed
    if (!found.ok) throw new Error(`Brevo lookup ${found.status}`);
    const contact = await found.json();
    const memberNumber = memberNumberFor(contact.id);

    if ((contact.listIds || []).includes(listId)) {
      /* Already on the waitlist with a number: a genuine duplicate */
      if (contact.attributes?.MEMBER_NUMBER) return json(409, { error: 'duplicate' });

      /* On the waitlist but the number never got saved (an earlier sign-up was interrupted):
         finish that registration instead of leaving the person stuck on a duplicate error */
      const memberNumberSaved = await saveMemberNumber(memberNumber);
      return json(201, { memberNumber, memberNumberSaved });
    }

    /* 4. Known contact (e.g. from another list) joining the waitlist for the first time.
          Its ID is already known, so everything is saved in one request. */
    const added = await brevo(contactPath, 'PUT', { attributes: { ...attributes, MEMBER_NUMBER: memberNumber }, listIds: [listId] });
    if (!added.ok) {
      const upd = await added.json().catch(() => ({}));
      if (upd.code === 'duplicate_parameter') return json(409, { error: 'phone_taken' });
      throw new Error(`Brevo update ${added.status}: ${upd.message}`);
    }
    return json(201, { memberNumber, memberNumberSaved: true });
  } catch (e) {
    console.error(e);
    return json(502, { error: 'upstream' });
  }
};

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}
