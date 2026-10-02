/* ── sticky nav ─────────────────────────────────── */
const nav = document.getElementById('nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('stuck', window.scrollY > 60);
  }, { passive: true });
}

/* ── scroll reveal ──────────────────────────────── */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      revealObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

/* ── mobile menu ────────────────────────────────── */
function openMenu() {
  document.getElementById('mob-menu').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeMenu() {
  document.getElementById('mob-menu').classList.remove('open');
  document.body.style.overflow = '';
}

/* Close mobile menu on Escape key */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeMenu();
});

/* ── faq accordion ──────────────────────────────── */
function toggleFaq(btn) {
  const item   = btn.parentElement;
  const answer = item.querySelector('.faq-a');
  const isOpen = item.classList.contains('active');

  /* Close all */
  document.querySelectorAll('.faq-item').forEach(i => {
    i.classList.remove('active');
    i.querySelector('.faq-a').style.maxHeight = '0';
  });

  /* Open clicked if it was closed */
  if (!isOpen) {
    item.classList.add('active');
    answer.style.maxHeight = answer.scrollHeight + 'px';
  }
}

/* ── hide scroll hint on scroll ─────────────────── */
const scrollHint = document.querySelector('.scroll-hint');
if (scrollHint) {
  window.addEventListener('scroll', () => {
    scrollHint.style.opacity = window.scrollY > 80 ? '0' : '';
  }, { passive: true });
}

/* ── waitlist sign-up ────────────────────────────────── */
const wlForm = document.getElementById('wl-form');
if (wlForm) {
  const status   = document.getElementById('wl-status');
  const success  = document.getElementById('wl-success');
  const memberNo = document.getElementById('wl-member-no');
  const submit   = wlForm.querySelector('.wl-submit');
  const selfBox  = document.getElementById('wl-self');
  const SUBMIT_LABEL = submit.textContent;

  const MSG = {
    firstName: 'Enter your first name.',
    email:     'Enter a valid email address, like you@example.com.',
    phone:     'Enter your number with the country code, like +46 70 123 45 67 — or leave it empty.',
    phoneTaken:'That phone number is already linked to another Sproozt member. Use a different number or leave it empty.',
    duplicate: 'That email is already connected to the Sproozt waitlist.',
    network:   'Your sign-up didn\'t go through. Check your connection and try again.',
    server:    'We couldn\'t add you to the waitlist just now. Please try again in a few minutes.'
  };

  const fields = {
    firstName: { el: document.getElementById('wl-first'), ok: v => v.trim() !== '' },
    email:     { el: document.getElementById('wl-email'), ok: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) },
    phone:     { el: document.getElementById('wl-phone'), ok: v => v.trim() === '' || /^\+[1-9]\d{6,14}$/.test(cleanPhone(v)) }
  };

  /* "+46 70-123 45 67" -> "+46701234567"; a leading 00 counts as + */
  function cleanPhone(v) {
    return v.trim().replace(/^00/, '+').replace(/[\s\-().]/g, '');
  }

  function setError(name, msg) {
    const { el } = fields[name];
    document.getElementById(el.id + '-err').textContent = msg || '';
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    el.closest('.field').classList.toggle('has-error', !!msg);
  }

  function validate() {
    let firstBad = null;
    for (const [name, f] of Object.entries(fields)) {
      const good = f.ok(f.el.value);
      setError(name, good ? '' : MSG[name]);
      if (!good && !firstBad) firstBad = f.el;
    }
    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  /* Clear an error as soon as it's fixed */
  for (const [name, f] of Object.entries(fields)) {
    f.el.addEventListener('input', () => { if (f.ok(f.el.value)) setError(name, ''); });
  }

  /* Optional answers: show the self-describe box, and let people take their answers back.
     Each "Clear" button lists the radio groups it resets in data-clear. */
  const clearBtns = [...wlForm.querySelectorAll('.wl-clear[data-clear]')];
  wlForm.addEventListener('change', e => {
    if (e.target.name === 'gender') {
      selfBox.hidden = e.target.value !== 'Self-describe';
      if (!selfBox.hidden) selfBox.querySelector('input').focus();
    }
    clearBtns.forEach(b => { if (b.dataset.clear.split(',').includes(e.target.name)) b.hidden = false; });
  });
  clearBtns.forEach(b => b.addEventListener('click', () => {
    const names = b.dataset.clear.split(',');
    names.forEach(n => wlForm.querySelectorAll(`input[name="${n}"]`).forEach(r => { r.checked = false; }));
    if (names.includes('gender')) {
      selfBox.querySelector('input').value = '';
      selfBox.hidden = true;
    }
    b.hidden = true;
  }));

  wlForm.addEventListener('submit', async e => {
    e.preventDefault();
    status.textContent = '';
    if (!validate()) return;

    const fd = new FormData(wlForm);
    const payload = {
      firstName:  fd.get('firstName').trim(),
      lastName:   (fd.get('lastName') || '').trim(),
      email:      fd.get('email').trim(),
      phone:      cleanPhone(fd.get('phone') || ''),
      ageRange:   fd.get('ageRange') || '',
      gender:     fd.get('gender') || '',
      genderSelf: fd.get('gender') === 'Self-describe' ? (fd.get('genderSelf') || '').trim() : '',
      carType:       fd.get('carType') || '',
      washFrequency: fd.get('washFrequency') || '',
      marketing:  fd.get('marketing') === 'yes',
      website:    fd.get('website') || ''
    };

    submit.disabled = true;
    submit.textContent = 'Joining…';

    let res, reply = {};
    try {
      res = await fetch(wlForm.getAttribute('action'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      reply = await res.json().catch(() => ({}));
    } catch {
      return fail(MSG.network);
    }

    if (res.status === 201 && reply.memberNumber) {
      memberNo.textContent = reply.memberNumber;
      wlForm.hidden = true;
      success.hidden = false;
      success.scrollIntoView({ behavior: 'smooth', block: 'center' });
      success.focus({ preventScroll: true });
      return;
    }
    if (res.status === 409) {
      const field = reply.error === 'phone_taken' ? 'phone' : 'email';
      setError(field, field === 'phone' ? MSG.phoneTaken : MSG.duplicate);
      fields[field].el.focus();
      return fail('');
    }
    if (res.status === 400 && fields[reply.field]) {
      setError(reply.field, MSG[reply.field]);
      fields[reply.field].el.focus();
      return fail('');
    }
    fail(MSG.server);
  });

  function fail(msg) {
    status.textContent = msg;
    submit.disabled = false;
    submit.textContent = SUBMIT_LABEL;
  }
}

/* ── intro video: pause/play, and respect reduced motion ── */
const introVideo = document.querySelector('.iv-video');
const introToggle = document.querySelector('.iv-toggle');
if (introVideo && introToggle) {
  const setPaused = paused => {
    paused ? introVideo.pause() : introVideo.play().catch(() => {});
    introToggle.setAttribute('aria-pressed', String(paused));
    introToggle.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
  };
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true);
  introToggle.addEventListener('click', () => setPaused(!introVideo.paused));
}
