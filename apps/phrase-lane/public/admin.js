'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let nextCursor = null;
  let busy = false;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const number = value => finite(value) ? value.toLocaleString('en-US') : 'Not retrieved';
  const text = value => value === undefined || value === null || value === '' ? 'Not retrieved' : String(value);
  const date = value => {
    if (value === undefined || value === null || value === '' || (typeof value === 'number' && value <= 0)) return 'Not retrieved';
    const parsed = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC' : 'Not retrieved';
  };
  const element = (tag, value) => {
    const result = document.createElement(tag);
    if (value !== undefined) result.textContent = text(value);
    return result;
  };
  async function request(path) {
    const response = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    let data;
    try { data = await response.json(); } catch { throw new Error('The owner records returned an unreadable response.'); }
    if (!response.ok) {
      const error = new Error(response.status === 401 ? 'Owner records require sign-in and a recent authentication. Open Account and confirm Google sign-in again.' : response.status === 403 ? 'Owner access was denied. An ordinary customer account cannot view these records; the server must grant the owner role and require recent authentication.' : data.error || 'Owner records could not be retrieved.');
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function status(message, error = false) {
    $('adminStatus').textContent = message;
    $('adminStatus').classList.toggle('error', error);
  }
  function meter(usage) {
    if (!usage || typeof usage !== 'object') return 'Not retrieved';
    return `Audio: ${number(usage.audio?.used)} / ${number(usage.audio?.limit)} seconds; ${number(usage.audio?.reserved)} reserved; ${number(usage.audio?.attempts)} / ${number(usage.audio?.attemptLimit)} attempts. Text: ${number(usage.text?.used)} / ${number(usage.text?.limit)} characters; ${number(usage.text?.reserved)} reserved; ${number(usage.text?.attempts)} / ${number(usage.text?.attemptLimit)} attempts.`;
  }
  function customers(data, append = false) {
    if (!Array.isArray(data.items)) throw new Error('Customer records were not retrieved in the expected format.');
    const target = $('customers');
    let body = append ? target.querySelector('tbody') : null;
    if (!body) {
      target.replaceChildren();
      const table = element('table');
      const head = element('thead');
      const heading = element('tr');
      for (const label of ['Customer ID', 'Email', 'Plan', 'Status', 'Paid until', 'Usage']) {
        const cell = element('th', label);
        cell.scope = 'col';
        heading.append(cell);
      }
      head.append(heading);
      body = element('tbody');
      table.append(head, body);
      target.append(table);
    }
    if (!data.items.length && !append) {
      const row = element('tr');
      const cell = element('td', 'No customer records were returned.');
      cell.colSpan = 6;
      row.append(cell);
      body.append(row);
    } else for (const item of data.items) {
      const row = element('tr');
      for (const value of [text(item.id), text(item.email), text(item.plan), text(item.status), date(item.paid_until), meter(item.usage)]) row.append(element('td', value));
      body.append(row);
    }
    nextCursor = typeof data.nextCursor === 'string' && data.nextCursor ? data.nextCursor : null;
    $('moreCustomers').hidden = !nextCursor;
    $('customerSync').textContent = `Last retrieved: ${date(data.syncedAt)}`;
  }
  function amount(value, currency) {
    if (!finite(value)) return 'Not retrieved';
    try {
      // The API returns Stripe-style integer amounts in each currency's minor unit.
      const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' });
      const digits = formatter.resolvedOptions().maximumFractionDigits;
      return formatter.format(value / 10 ** digits);
    } catch { return `${number(value)} minor units · ${text(currency)}`; }
  }
  function revenue(data) {
    if (!Array.isArray(data.currencies)) throw new Error('Payment metrics were not retrieved in the expected format.');
    const target = $('revenue');
    target.replaceChildren();
    if (!data.currencies.length) target.append(element('p', 'No currency metrics were returned. This does not establish zero sales or zero profit.'));
    const cards = element('div');
    cards.className = 'grid3';
    for (const metrics of data.currencies) {
      const currency = typeof metrics.currency === 'string' && /^[A-Za-z]{3}$/.test(metrics.currency) ? metrics.currency.toUpperCase() : null;
      const card = element('section');
      card.className = 'card';
      card.append(element('h3', currency || 'Currency: Not retrieved'));
      const list = element('dl');
      for (const [field, label] of [['gross', 'Gross sales'], ['refunds', 'Refunds'], ['fees', 'Processing fees'], ['net', 'Net payment receipts'], ['mrr', 'Monthly recurring revenue (MRR)'], ['available', 'Available balance'], ['pending', 'Pending balance'], ['payouts', 'Payouts']]) {
        list.append(element('dt', label), element('dd', currency ? amount(metrics[field], currency) : 'Not retrieved'));
      }
      card.append(list);
      cards.append(card);
    }
    target.append(cards);
    $('revenueSync').textContent = `Last retrieved: ${date(data.syncedAt)}`;
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    nextCursor = null;
    $('moreCustomers').hidden = true;
    $('refreshAdmin').disabled = true;
    $('customers').replaceChildren(element('p', 'Not retrieved'));
    $('revenue').replaceChildren(element('p', 'Not retrieved'));
    $('customerSync').textContent = 'Last retrieved: Not retrieved';
    $('revenueSync').textContent = 'Last retrieved: Not retrieved';
    status('Retrieving owner records…');
    try {
      const results = await Promise.allSettled([request('/api/admin/customers'), request('/api/admin/revenue')]);
      const denied = results.find(result => result.status === 'rejected' && [401, 403].includes(result.reason.status));
      if (denied) throw denied.reason;
      const errors = [];
      if (results[0].status === 'fulfilled') { try { customers(results[0].value); } catch (error) { errors.push(error.message); } }
      else errors.push(results[0].reason.message);
      if (results[1].status === 'fulfilled') { try { revenue(results[1].value); } catch (error) { errors.push(error.message); } }
      else errors.push(results[1].reason.message);
      status(errors.length ? errors.join(' ') + ' Unavailable fields remain Not retrieved.' : 'Owner records retrieved. Unknown payment fields remain Not retrieved.', errors.length > 0);
    } catch (error) { status(error.message, true); }
    finally { busy = false; $('refreshAdmin').disabled = false; }
  }
  $('refreshAdmin').addEventListener('click', refresh);
  $('moreCustomers').addEventListener('click', async () => {
    if (!nextCursor || busy) return;
    busy = true;
    $('moreCustomers').disabled = true;
    try {
      const data = await request('/api/admin/customers?cursor=' + encodeURIComponent(nextCursor));
      customers(data, true);
      status('Additional customer records retrieved.');
    } catch (error) { status(error.message, true); }
    finally { busy = false; $('moreCustomers').disabled = false; }
  });
  refresh();
})();
