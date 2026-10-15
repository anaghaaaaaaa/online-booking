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
      if (form.id === 'loginForm' || form.id === 'organizerRequestForm') return;
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

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = document.getElementById('loginEmail').value.trim().toLowerCase();
      const password = document.getElementById('loginPassword').value;
      const message = document.getElementById('loginMessage');
      if (email === 'organizer@eventease.com' && password === 'Organizer@123') {
        localStorage.setItem('eventease.organizer.session', JSON.stringify({ id: 'organizer-demo', email, name: 'Avery Morgan', role: 'organizer' }));
        window.location.href = 'organizer.html#/dashboard';
        return;
      }
      if (email === 'admin@eventease.com' && password === 'Admin@123') {
        localStorage.setItem('eventease.organizer.session', JSON.stringify({ id: 'eventease-admin', email, name: 'EventEase Admin', role: 'admin' }));
        window.location.href = 'admin.html#/dashboard';
        return;
      }
      const approvedOrganizer = JSON.parse(localStorage.getItem('eventease.organizer.users') || '[]').find((user) => user.email.toLowerCase() === email && user.role === 'organizer');
      if (approvedOrganizer && password === approvedOrganizer.password) {
        const profiles = JSON.parse(localStorage.getItem('eventease.organizer.profiles') || '{}');
        const profile = profiles[approvedOrganizer.id] || {};
        localStorage.setItem('eventease.organizer.session', JSON.stringify({ id: approvedOrganizer.id, email, name: profile.name || approvedOrganizer.name, role: 'organizer' }));
        window.location.href = 'organizer.html#/dashboard';
        return;
      }
      message.textContent = 'Email or password is incorrect. Use the organizer demo details below to open Organizer Studio.';
    });
  }

  const organizerRequestForm = document.getElementById('organizerRequestForm');
  organizerRequestForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!organizerRequestForm.reportValidity()) return;
    const request = Object.fromEntries(new FormData(organizerRequestForm).entries());
    const requests = JSON.parse(localStorage.getItem('eventease.organizer.requests') || '[]');
    requests.push({ ...request, id: `request-${Date.now()}`, status: 'Pending', createdAt: new Date().toISOString() });
    localStorage.setItem('eventease.organizer.requests', JSON.stringify(requests));
    organizerRequestForm.reset();
    document.getElementById('organizerRequestMessage').textContent = 'Request saved for admin review.';
  });
});
