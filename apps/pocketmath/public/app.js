import { tipBill, splitBill, discountPrice, formatMoney, formatRate } from './core.mjs';

function textItem(tag, text) { const element = document.createElement(tag); element.textContent = text; return element; }
function renderSteps(form, steps) {
  const list = form.querySelector('.steps');
  list.replaceChildren(...steps.map(step => textItem('li', step)));
}
function renderShares(form, allocation, totalCents) {
  const output = form.querySelector('.amount');
  output.textContent = allocation.extraPeople ? `${formatMoney(allocation.baseCents)}–${formatMoney(allocation.baseCents + 1n)}` : formatMoney(allocation.baseCents);
  const list = form.querySelector('.shares');
  list.replaceChildren(...allocation.groups.map(group => textItem('li', `${group.count.toLocaleString('en-US')} ${group.count === 1 ? 'person pays' : 'people pay'} ${formatMoney(group.shareCents)} each`)));
  form.querySelector('.detail').textContent = `Allocated total ${formatMoney(totalCents)} · ${allocation.people.toLocaleString('en-US')} ${allocation.people === 1 ? 'person' : 'people'}`;
  form.querySelector('.rounding-note').textContent = allocation.extraPeople
    ? `The first ${allocation.extraPeople.toLocaleString('en-US')} ${allocation.extraPeople === 1 ? 'person pays' : 'people pay'} one extra cent of the bill. All shares add up exactly; you can agree who pays that cent.`
    : 'Every share is equal to the cent. All shares add up exactly.';
}

for (const form of document.querySelectorAll('form[data-kind]')) {
  function update() {
    const error = form.querySelector('.error'), results = form.querySelector('.calculated');
    try {
      const values = [...form.querySelectorAll('input')].map(input => input.value);
      if (form.dataset.kind === 'tip') {
        const result = tipBill(...values);
        renderShares(form, result.allocation, result.totalCents);
        renderSteps(form, [
          `Apply ${formatRate(result.rateHundredths)} to ${formatMoney(result.billCents)}. Round the tip to the nearest cent, with a half-cent rounded up: ${formatMoney(result.tipCents)}.`,
          `Add the tip: ${formatMoney(result.billCents)} + ${formatMoney(result.tipCents)} = ${formatMoney(result.totalCents)}.`,
          `Divide the total among ${result.allocation.people.toLocaleString('en-US')} people, then distribute any remaining cents as shown above.`
        ]);
      } else if (form.dataset.kind === 'split') {
        const result = splitBill(...values);
        renderShares(form, result.allocation, result.totalCents);
        renderSteps(form, [
          `Add the shared amounts: ${formatMoney(result.billCents)} + ${formatMoney(result.extraCents)} = ${formatMoney(result.totalCents)}.`,
          `Start with ${formatMoney(result.allocation.baseCents)} per person; that accounts for ${formatMoney(result.allocation.baseCents * BigInt(result.allocation.people))}.`,
          `Distribute the remaining ${result.allocation.extraPeople} ${result.allocation.extraPeople === 1 ? 'cent' : 'cents'} one each. The listed payments add up to ${formatMoney(result.totalCents)}.`
        ]);
      } else {
        const result = discountPrice(...values);
        form.querySelector('.amount').textContent = formatMoney(result.finalCents);
        form.querySelector('.detail').textContent = `You save ${formatMoney(result.totalSavingCents)}${result.effectiveRateHundredths === null ? '' : ` · effective reduction ${formatRate(result.effectiveRateHundredths)} (rounded)`}`;
        renderSteps(form, result.stages.map(stage => `Stage ${stage.number}: ${formatRate(stage.rateHundredths)} of ${formatMoney(stage.beforeCents)} gives a rounded saving of ${formatMoney(stage.savingCents)}. Price remaining: ${formatMoney(stage.afterCents)}.`));
        form.querySelector('.rounding-note').textContent = 'Each discount is applied to the remaining price. Its saving is rounded half-up to cents before the next stage. Your retailer may use a different rounding method.';
      }
      error.textContent = ''; results.hidden = false;
    } catch (cause) {
      error.textContent = cause.message; results.hidden = true;
    }
  }
  form.addEventListener('input', update);
  form.addEventListener('submit', event => { event.preventDefault(); update(); });
  update();
}
