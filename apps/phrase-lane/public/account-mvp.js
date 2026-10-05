'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let account = null;
  let challengeToken = '';
  let challengeId;
  let challengeLoading = false;
  let busy = false;
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : 'Not retrieved';
  const date = value => {
    if (value === undefined || value === null || value === '' || (typeof value === 'number' && value <= 0)) return 'Not retrieved';
    const parsed = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC' : 'Not retrieved';
  };
  const status = (message, error = false) => {
    if (!$('status')) return;
    $('status').textContent = message;
    $('status').classList.toggle('error', error);
  };
  async function request(path, body, method = 'POST') {
    const options = { method: body === undefined ? 'GET' : method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      if (account?.csrfToken) options.headers['X-CSRF-Token'] = account.csrfToken;
      options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    let data;
    try { data = await response.json(); } catch { throw new Error('The service returned an unreadable response. Please try again.'); }
    if (!response.ok) {
      const error = new Error(data.error || (response.status === 401 ? 'Sign in again to continue.' : 'The request could not be completed.'));
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function destination(raw, hostname) {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== hostname || url.username || url.password || (url.port && url.port !== '443')) throw new Error('The service returned an unexpected destination. No redirect was made.');
    return url.href;
  }
  function authEnabled() {
    return !!account?.oidcReady && !!account?.turnstileSiteKey && !!challengeToken && !busy;
  }
  function controls() {
    for (const id of ['googleSignIn', 'linkGoogle', 'reauthenticate']) if ($(id)) $(id).disabled = !authEnabled();
    if ($('restoreAccount')) $('restoreAccount').disabled = !account || busy;
    if ($('subscribe')) $('subscribe').disabled = !account?.signedIn || !account?.billingReady || account?.plan === 'pro' || !$('savedKey')?.checked || !$('acceptTerms')?.checked || busy;
    if ($('portal')) $('portal').disabled = !account?.signedIn || !account?.portalReady || busy;
    if ($('deleteAccount')) $('deleteAccount').disabled = !account?.signedIn || !$('deleteConfirm')?.checked || busy;
    if ($('logout')) $('logout').disabled = busy;
    if ($('refreshAccount')) $('refreshAccount').disabled = busy;
  }
  function showAllowance(part, usageId, attemptsId, attemptPeriod) {
    const use = part || {};
    if ($(usageId)) $(usageId).textContent = `${number(use.used)} used / ${number(use.limit)} limit · ${number(use.reserved)} temporarily reserved`;
    if ($(attemptsId)) $(attemptsId).textContent = `${number(use.attempts)} / ${number(use.attemptLimit)} attempts ${attemptPeriod}`;
  }
  function render() {
    const signed = account?.signedIn === true;
    const billing = account?.billingReady === true;
    const billingText = billing ? 'Pro checkout is available. Review the final amount, any applicable tax and monthly renewal terms before paying.' : 'New Pro subscriptions are temporarily unavailable. You can use fixed examples and the local subtitle tool. Existing subscribers can manage billing from their account when configured.';
    if ($('pricingState')) $('pricingState').textContent = billingText;
    if ($('billingState')) $('billingState').textContent = billingText;
    if ($('accountState')) $('accountState').textContent = signed ? `${account.plan === 'pro' ? 'Pro' : 'Free'} account signed in.` : 'You are not signed in. Check Google availability or restore an existing beta account below.';
    document.querySelectorAll('[data-signed]').forEach(element => { element.hidden = !signed; });
    document.querySelectorAll('[data-unsigned]').forEach(element => { element.hidden = signed; });
    if ($('accountIdentity')) $('accountIdentity').textContent = account?.email ? `Signed in as ${account.email}` : 'Existing beta recovery-key account. Verified email: Not retrieved';
    if ($('oidcState')) $('oidcState').textContent = account?.oidcReady ? (account?.turnstileSiteKey ? 'Complete the security check before continuing to Google.' : 'Sign-in security configuration is unavailable. New sign-in cannot start.') : 'Google sign-in is not configured. New account creation is disabled; existing beta recovery keys can still be restored.';
    if ($('migrationPanel')) $('migrationPanel').hidden = !signed || !account?.needsMigration;
    if ($('ownerPanel')) $('ownerPanel').hidden = !signed || account?.canAdmin !== true;
    const usage = account?.usage || {};
    if ($('usagePeriod')) $('usagePeriod').textContent = `Usage period: ${date(usage.startsAt)} — ${date(usage.endsAt)}`;
    showAllowance(usage.audio, 'audioUsage', 'audioAttempts', 'in this usage period');
    if ($('dailyAudioUsage')) $('dailyAudioUsage').textContent = account?.plan === 'pro' ? 'Not applicable to Pro' : `${number(usage.dailyAudio?.used)} used / ${number(usage.dailyAudio?.limit)} seconds · ${number(usage.dailyAudio?.reserved)} temporarily reserved`;
    showAllowance(usage.text, 'textUsage', 'textAttempts', account?.plan === 'pro' ? 'in this billing period' : 'in this UTC calendar month');
    if ($('checkoutNote')) $('checkoutNote').textContent = billing ? 'The payment provider will show the actual amount before you accept a purchase. A return to this page alone does not prove payment.' : 'Checkout is unavailable until the service and purchase requirements are ready. Existing subscribers can use billing management when configured.';
    controls();
    if ($('accountChallenge') && account?.oidcReady && account?.turnstileSiteKey) loadChallenge();
  }
  function loadChallenge() {
    if (challengeLoading || challengeId !== undefined) return;
    challengeLoading = true;
    const mount = () => {
      if (!window.turnstile || !$('accountChallenge')) { status('The sign-in security check could not load. Please reload and try again.', true); return; }
      try {
        challengeId = window.turnstile.render($('accountChallenge'), {
          sitekey: account.turnstileSiteKey,
          action: 'signup',
          callback: token => { challengeToken = token; controls(); },
          'expired-callback': () => { challengeToken = ''; controls(); },
          'error-callback': () => { challengeToken = ''; controls(); status('The sign-in security check failed. Please try again.', true); }
        });
      } catch { status('The sign-in security check could not start. Please reload.', true); }
    };
    if (window.turnstile) { mount(); return; }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = mount;
    script.onerror = () => { challengeLoading = false; status('The sign-in security check could not load. Please try again later.', true); };
    document.head.append(script);
  }
  function resetChallenge() {
    challengeToken = '';
    if (challengeId !== undefined && window.turnstile) window.turnstile.reset(challengeId);
    controls();
  }
  async function refresh() {
    account = await request('/api/me');
    render();
  }
  async function action(fn) {
    if (busy) return;
    busy = true;
    controls();
    try { await fn(); }
    catch (error) { status(error.message, true); }
    finally { busy = false; controls(); }
  }
  function signedCsrf() {
    if (!account?.signedIn || !account.csrfToken) throw new Error('Your authenticated session is unavailable. Refresh the account and sign in again.');
  }
  async function startGoogle(link = false) {
    if (!account?.oidcReady || !challengeToken) throw new Error('Google sign-in or its security check is unavailable.');
    status('Opening Google sign-in…');
    try {
      if (link) signedCsrf();
      const data = await request(link ? '/api/auth/link-start' : '/api/auth/start', { turnstileToken: challengeToken });
      location.assign(destination(data.url, 'accounts.google.com'));
    } catch (error) { resetChallenge(); throw error; }
  }
  for (const [id, link] of [['googleSignIn', false], ['reauthenticate', false], ['linkGoogle', true]]) if ($(id)) $(id).addEventListener('click', () => action(() => startGoogle(link)));
  if ($('loginForm')) $('loginForm').addEventListener('submit', event => {
    event.preventDefault();
    action(async () => {
      const key = $('loginKey').value.trim();
      if (!key) throw new Error('Enter your existing recovery key.');
      status('Restoring account…');
      await request('/api/login', { key });
      $('loginKey').value = '';
      await refresh();
      status('Existing account restored.');
    });
  });
  if ($('refreshAccount')) $('refreshAccount').addEventListener('click', () => action(async () => { await refresh(); status('Account usage retrieved.'); }));
  if ($('logout')) $('logout').addEventListener('click', () => action(async () => {
    signedCsrf();
    await request('/api/logout', {});
    resetChallenge();
    await refresh();
    status('Signed out of this browser.');
  }));
  for (const id of ['savedKey', 'acceptTerms', 'deleteConfirm']) if ($(id)) $(id).addEventListener('change', controls);
  if ($('subscribe')) $('subscribe').addEventListener('click', () => action(async () => {
    signedCsrf();
    if (!account.billingReady || !$('savedKey').checked || !$('acceptTerms').checked) throw new Error('Checkout is unavailable or the required confirmations are incomplete.');
    status('Preparing secure checkout…');
    const result = await request('/api/checkout', { plan: 'pro', savedKey: true, acceptedTerms: true });
    location.assign(destination(result.url, 'checkout.stripe.com'));
  }));
  if ($('portal')) $('portal').addEventListener('click', () => action(async () => {
    signedCsrf();
    if (!account.portalReady) throw new Error('The billing portal is not available for this account in the current service configuration.');
    const result = await request('/api/billing/portal', {});
    location.assign(destination(result.url, 'billing.stripe.com'));
  }));
  if ($('deleteAccount')) $('deleteAccount').addEventListener('click', () => action(async () => {
    signedCsrf();
    if (!$('deleteConfirm').checked) throw new Error('Confirm the deletion request first.');
    $('deletionState').textContent = 'Submitting the deletion request…';
    try {
      const result = await request('/api/account', {}, 'DELETE');
      if (result.state === 'completed') {
        $('deletionState').textContent = 'The service reports that account deletion is completed. Any legally required payment records may follow the billing policy.';
        await refresh();
        status('Account deletion completed.');
      } else if (result.state === 'pending') {
        $('deletionState').textContent = 'Deletion is pending. Subscription cancellation or required record handling may still be in progress. This does not confirm that all data has been deleted.';
        status('The deletion request is pending.');
      } else throw new Error('The deletion state could not be confirmed. Contact support before assuming completion.');
    } catch (error) {
      $('deletionState').textContent = 'Deletion was not confirmed. You may need to confirm Google sign-in again and retry.';
      throw error;
    }
  }));
  refresh().catch(error => {
    if ($('pricingState')) $('pricingState').textContent = 'Sales status could not be retrieved. Purchases remain unavailable from this page.';
    if ($('accountState')) $('accountState').textContent = 'Account status: Not retrieved';
    if ($('billingState')) $('billingState').textContent = 'Billing readiness: Not retrieved. Purchases remain unavailable.';
    if ($('oidcState')) $('oidcState').textContent = 'Sign-in availability: Not retrieved';
    status(error.message, true);
    controls();
  });
})();
