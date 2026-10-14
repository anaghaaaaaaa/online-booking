document.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
  }

  const passwordToggles = document.querySelectorAll('[data-toggle-password]');
  passwordToggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const input = document.getElementById(toggle.dataset.togglePassword);
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      toggle.textContent = isPassword ? 'Hide' : 'Show';
    });
  });

  const qtyButtons = document.querySelectorAll('[data-qty-action]');
  qtyButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById('ticketQty');
      if (!input) return;
      const current = Number(input.value) || 1;
      const step = Number(button.dataset.qtyAction) || 1;
      const newValue = Math.max(1, current + step);
      input.value = newValue;
      updateTicketSummary(newValue);
    });
  });

  const qtyInput = document.getElementById('ticketQty');
  if (qtyInput) {
    qtyInput.addEventListener('input', (event) => {
      const value = Number(event.target.value) || 1;
      updateTicketSummary(value);
    });
  }

  function updateTicketSummary(value) {
    const priceOutput = document.querySelector('[data-price-per-seat]');
    const totalOutput = document.querySelector('[data-total-price]');
    if (!priceOutput || !totalOutput) return;
    const unitPrice = Number(priceOutput.dataset.pricePerSeat) || 0;
    totalOutput.textContent = `₹${(unitPrice * value).toLocaleString('en-IN')}`;
  }

  const planner = document.getElementById('plannerSearch');
  if (planner) {
    planner.addEventListener('submit', (event) => {
      event.preventDefault();
      const keyword = document.getElementById('eventKeyword')?.value || '';
      const location = document.getElementById('eventLocation')?.value || '';
      const date = document.getElementById('eventDate')?.value || '';
      const message = [keyword, location, date].filter(Boolean).join(' · ');
      const status = document.getElementById('searchStatus');
      if (status) {
        status.textContent = message ? `Showing matches for: ${message}` : 'Showing all available events.';
      }
    });
  }

  const forms = document.querySelectorAll('form');
  forms.forEach((form) => {
    form.addEventListener('submit', (event) => {
      const submitButton = form.querySelector('button[type="submit"]');
      if (!submitButton) return;
      if (submitButton.dataset.confirmText) { 
        submitButton.textContent = submitButton.dataset.confirmText;
      }
      const resultText = form.dataset.resultText;
      if (resultText) {
        const helper = document.createElement('p');
        helper.className = 'form-note';
        helper.textContent = resultText;
        const existing = form.querySelector('.form-note');
        if (existing) existing.remove();
        form.appendChild(helper);
      }
    });
  });
});
