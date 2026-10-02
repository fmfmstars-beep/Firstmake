// Logic smoke tests with DOM doubles. These do not replace a browser/CSP test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function element() {
  const attributes = new Map();
  const classes = new Set();
  const events = new Map();
  return {
    textContent: '', focused: false,
    getAttribute: (key) => attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: (key) => attributes.delete(key),
    classList: { add: (key) => classes.add(key), contains: (key) => classes.has(key), toggle: (key, value) => value ? classes.add(key) : classes.delete(key) },
    addEventListener: (type, fn) => events.set(type, [...(events.get(type) ?? []), fn]),
    emit: (type, event = {}) => (events.get(type) ?? []).forEach((fn) => fn(event)),
    focus() { this.focused = true; },
  };
}
function setup({ reduced = false, email = '', hostname = 'preview.workers.dev', search = '', preferences = {} } = {}) {
  const toggle = element(); toggle.setAttribute('aria-expanded', 'false');
  const nav = element(); const header = element(); const target = element();
  const document = element(); document.documentElement = element();
  const appended = [];
  document.createElement = () => element();
  document.head = { appendChild: (node) => appended.push(node) };
  const window = element();
  window.location = { hostname, search }; window.navigator = preferences;
  const mobile = { matches: true };
  const motion = element(); motion.matches = reduced;
  const contact = element(); const status = element(); const year = element();
  const dialog = element(); dialog.open = false;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  dialog.getBoundingClientRect = () => ({ left: 10, top: 10, right: 100, bottom: 100 });
  header.contains = (node) => [header, toggle, nav].includes(node);
  const reveal = [element(), element()]; const observers = [];
  const selectors = { '.nav-toggle': toggle, '#site-nav': nav, '.site-header': header, '#about': target, '#contact-dialog': dialog, '#contact-status': status, '#year': year };
  document.querySelector = (key) => selectors[key];
  document.querySelectorAll = (key) => key === '.reveal' ? reveal : [contact];
  window.matchMedia = (query) => query.includes('max-width') ? mobile : motion;
  function IntersectionObserver(callback) {
    this.observed = new Set(); this.callback = callback; this.disconnected = false;
    this.observe = (node) => this.observed.add(node);
    this.unobserve = (node) => this.observed.delete(node);
    this.disconnect = () => { this.disconnected = true; this.observed.clear(); };
    observers.push(this);
  }
  window.IntersectionObserver = IntersectionObserver;
  runInNewContext(source.replace("const CONTACT_EMAIL = '';", `const CONTACT_EMAIL = ${JSON.stringify(email)};`), { document, window, IntersectionObserver });
  return { appended, toggle, nav, header, target, document, window, mobile, motion, contact, status, year, dialog, reveal, observers };
}

test('mobile navigation opens, Escape restores focus, links close and focus the target', () => {
  const s = setup();
  assert.ok(s.document.documentElement.classList.contains('nav-enhanced'));
  s.toggle.emit('click'); assert.equal(s.toggle.getAttribute('aria-expanded'), 'true');
  assert.ok(s.nav.classList.contains('is-open'));
  s.document.emit('keydown', { key: 'Escape' });
  assert.equal(s.toggle.getAttribute('aria-expanded'), 'false'); assert.ok(s.toggle.focused);
  s.toggle.emit('click');
  s.nav.emit('click', { target: { closest: () => ({ getAttribute: () => '#about' }) } });
  assert.equal(s.toggle.getAttribute('aria-expanded'), 'false'); assert.ok(s.target.focused);
  assert.equal(s.target.getAttribute('tabindex'), '-1');
  s.target.emit('blur'); assert.equal(s.target.getAttribute('tabindex'), null);
  s.toggle.emit('click'); s.document.emit('click', { target: {} });
  assert.equal(s.toggle.getAttribute('aria-expanded'), 'false');
  s.toggle.emit('click'); s.mobile.matches = false; s.window.emit('resize');
  assert.equal(s.toggle.getAttribute('aria-expanded'), 'false');
});

test('demo contact opens and dismisses its dialog; configured contact uses mailto', () => {
  const s = setup(); let prevented = false;
  s.contact.emit('click', { preventDefault: () => { prevented = true; } });
  assert.ok(prevented); assert.ok(s.dialog.open);
  s.dialog.emit('click', { target: s.dialog, clientX: 0, clientY: 0 });
  assert.equal(s.dialog.open, false);
  const configured = setup({ email: 'hello@example.com' });
  assert.ok(configured.contact.href.startsWith('mailto:hello@example.com?subject='));
  assert.ok(configured.status.textContent.includes('hello@example.com'));
  assert.equal(s.year.textContent, new Date().getFullYear());
});

test('scroll reveal and reduced-motion paths keep content available', () => {
  const s = setup(); const observer = s.observers[0];
  assert.equal(observer.observed.size, 2);
  observer.callback([{ target: s.reveal[0], isIntersecting: true }], observer);
  assert.ok(s.reveal[0].classList.contains('is-visible'));
  assert.equal(observer.observed.size, 1);
  s.motion.emit('change', { matches: true });
  assert.ok(observer.disconnected);
  assert.ok(s.reveal.every((node) => node.classList.contains('is-visible')));
  const reduced = setup({ reduced: true });
  assert.equal(reduced.observers.length, 0);
  assert.ok(reduced.reveal.every((node) => !node.classList.contains('is-ready')));
});


test('analytics runs only in production and respects verification and privacy exclusions', () => {
  const production = { hostname: 'firstmake.fmfm-stars.workers.dev' };
  const s = setup(production);
  assert.equal(s.appended.length, 1);
  assert.equal(s.appended[0].src, 'https://static.cloudflareinsights.com/beacon.min.js');
  assert.equal(JSON.parse(s.appended[0].getAttribute('data-cf-beacon')).spa, false);
  assert.equal(setup().appended.length, 0);
  for (const search of ['?noanalytics=1', '?x=1&noanalytics=1', '?noanalytics']) {
    assert.equal(setup({ ...production, search }).appended.length, 0);
  }
  for (const preferences of [{ doNotTrack: '1' }, { globalPrivacyControl: true }, { webdriver: true }]) {
    assert.equal(setup({ ...production, preferences }).appended.length, 0);
  }
});
