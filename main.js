/* ── sticky nav ─────────────────────────────────── */
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('stuck', window.scrollY > 60);
}, { passive: true });

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
