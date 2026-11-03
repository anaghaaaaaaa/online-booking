document.addEventListener('DOMContentLoaded', () => {
  const api = window.EventEaseApi;
  if (!api) {
    showPageError('EventEase could not start. Reload the page and try again.');
    return;
  }

  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const money = (value) => Number(value) === 0 ? 'Free' : `₹${Number(value || 0).toLocaleString('en-IN')}`;
  const dateTime = (value) => value ? new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(value)) : '—';
  const page = location.pathname.split('/').pop().toLowerCase();

  function showPageError(message, target = document.querySelector('main')) {
    if (!target) return;
    let note = target.querySelector('[data-api-message]');
    if (!note) {
      note = document.createElement('p');
      note.dataset.apiMessage = 'true';
      note.className = 'form-note';
      note.setAttribute('role', 'alert');
      target.prepend(note);
    }
    note.textContent = message;
  }

  function messageFor(form) {
    let note = form.querySelector('[data-api-message]');
    if (!note) {
      note = document.createElement('p');
      note.className = 'form-note';
      note.dataset.apiMessage = 'true';
      note.setAttribute('role', 'status');
      form.append(note);
    }
    return note;
  }

  async function submitForm(form, action) {
    const button = form.querySelector('button[type="submit"]');
    if (button?.disabled) return;
    if (button) button.disabled = true;
    const note = messageFor(form);
    note.textContent = '';
    try {
      const result = await action();
      if (result) note.textContent = result;
      return true;
    } catch (error) {
      form.querySelectorAll('[data-field-error]').forEach((item) => item.remove());
      const fieldErrors = error.errors?.fieldErrors || {};
      Object.entries(fieldErrors).forEach(([field, errors]) => {
        const input = form.elements.namedItem(field);
        if (!input || !errors?.length) return;
        const fieldNote = document.createElement('span');
        fieldNote.className = 'form-note';
        fieldNote.dataset.fieldError = 'true';
        fieldNote.setAttribute('role', 'alert');
        fieldNote.textContent = errors.join(' ');
        input.insertAdjacentElement('afterend', fieldNote);
        input.setAttribute('aria-invalid', 'true');
      });
      note.textContent = error.message || 'The request could not be completed.';
      note.setAttribute('role', 'alert');
      return false;
    } finally {
      if (button) button.disabled = false;
    }
  }

  function getReturnTo() {
    const value = new URLSearchParams(location.search).get('returnTo') || '';
    if (!value || value.startsWith('//') || /^[a-z]+:/i.test(value)) return '';
    return value;
  }
  const returnTo = getReturnTo();
  if (page === 'login.html' && returnTo) {
    document.querySelectorAll('a[href="register.html"]').forEach((link) => {
      link.href = `register.html?returnTo=${encodeURIComponent(returnTo)}`;
    });
  }

  function roleHome(role) {
    if (role === 'admin') return 'admin.html#/dashboard';
    if (role === 'organizer') return 'organizer.html#/dashboard';
    return 'dashboard.html';
  }

  async function guardUserPage() {
    if (!['dashboard.html', 'book-event.html', 'booking-confirmation.html', 'my-bookings.html', 'my-tickets.html', 'my-profile.html', 'notifications.html'].includes(page)) return;
    let user;
    try { user = await api.auth.me(); }
    catch (error) {
      if (error.status === 401) location.replace(`login.html?returnTo=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`);
      throw error;
    }
    if (user.role !== 'user') location.replace(roleHome(user.role));
  }

  document.querySelectorAll('a').forEach((link) => {
    if (link.textContent.trim().toLowerCase() !== 'logout') return;
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        await api.auth.logout();
      } catch (error) {
        showPageError(error.message);
      } finally {
        location.replace('index.html');
      }
    });
  });

  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (menuToggle && navLinks) menuToggle.addEventListener('click', () => navLinks.classList.toggle('open'));

  document.querySelectorAll('[data-toggle-password], .field button[type="button"]').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const input = document.getElementById(toggle.dataset.togglePassword) || toggle.parentElement.querySelector('input');
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      toggle.textContent = input.type === 'password' ? 'Show' : 'Hide';
    });
  });

  const loginForm = document.getElementById('loginForm');
  loginForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitForm(loginForm, async () => {
      const user = await api.auth.login({
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value
      });
      const returnTo = getReturnTo();
      location.replace(user.role === 'user' && returnTo ? returnTo : roleHome(user.role));
    });
  });

  const registerForm = document.getElementById('registerForm');
  registerForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitForm(registerForm, async () => {
      const password = document.getElementById('registerPassword').value;
      if (password !== document.getElementById('confirmPassword').value) throw new Error('Passwords do not match.');
      const name = [document.getElementById('firstName').value, document.getElementById('lastName').value].map((item) => item.trim()).filter(Boolean).join(' ');
      const user = await api.auth.register({ name, email: document.getElementById('registerEmail').value.trim(), password });
      const returnTo = getReturnTo();
      location.replace(user.role === 'user' && returnTo ? returnTo : roleHome(user.role));
    });
  });

  const planner = document.getElementById('plannerSearch');
  planner?.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = new URLSearchParams();
    const keyword = document.getElementById('eventKeyword')?.value.trim();
    const locationName = document.getElementById('eventLocation')?.value.trim();
    const date = document.getElementById('eventDate')?.value;
    if (keyword) query.set('q', keyword);
    if (locationName) query.set('location', locationName);
    if (date) query.set('dateFrom', date);
    location.href = `explore.html${query.size ? `?${query}` : ''}`;
  });

  document.querySelectorAll('form[data-result-text]').forEach((form) => {
    if (form === loginForm || form === registerForm) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (page === 'forgot-password.html') {
        showPageError('Password reset is not available yet. Please contact support.', form);
      }
    });
    const resetForm = document.getElementById('resetForm');
    resetForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      showPageError('Password reset is not available yet. Please contact support.', resetForm);
    });
  });

  const contactForm = document.getElementById('contactForm');
  contactForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitForm(contactForm, async () => {
      await api.contact({
        name: document.getElementById('contactName').value.trim(),
        email: document.getElementById('contactEmail').value.trim(),
        message: document.getElementById('contactMessage').value.trim()
      });
      contactForm.reset();
      return 'Your message was sent.';
    });
  });

  const organizerRequestForm = document.getElementById('organizerRequestForm');
  organizerRequestForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitForm(organizerRequestForm, async () => {
      await api.organizerRequest({
        organizationName: document.getElementById('requestOrganization').value.trim(),
        reason: document.getElementById('requestDetails').value.trim()
      });
      organizerRequestForm.reset();
      return 'Your organizer request was submitted for review.';
    });
  });

  const bookingForm = document.getElementById('bookingForm');
  let selectedEvent = null;
  const quantity = document.getElementById('ticketQty');
  function updateTotal() {
    const count = Number(quantity?.value);
    const inRange = Number.isInteger(count) && count >= 1 && count <= 10;
    const available = !selectedEvent || count <= selectedEvent.seatsLeft;
    if (quantity) quantity.setCustomValidity(!inRange ? 'Choose a ticket quantity from 1 to 10.' : !available ? `Only ${selectedEvent.seatsLeft} seat(s) are available.` : '');
    const amount = (selectedEvent?.price || 0) * (Number.isFinite(count) && count > 0 ? count : 0);
    document.querySelectorAll('[data-total-price]').forEach((item) => { item.textContent = money(amount); });
    const countOutput = document.querySelector('[data-ticket-count]');
    if (countOutput) countOutput.textContent = quantity?.value || '—';
    const totalOutput = document.querySelector('[data-booking-total]');
    if (totalOutput) totalOutput.textContent = money(amount);
  }
  document.querySelectorAll('[data-qty-action]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!quantity) return;
      quantity.value = String(Math.min(10, Math.max(1, Number(quantity.value || 1) + Number(button.dataset.qtyAction || 0))));
      updateTotal();
    });
  });
  quantity?.addEventListener('input', updateTotal);

  async function loadBookableEvent() {
    const eventId = new URLSearchParams(location.search).get('event');
    if (!eventId) {
      location.replace('explore.html');
      return;
    }
    try {
      const { event } = await api.events.get(eventId);
      selectedEvent = event;
      document.querySelectorAll('.page-hero h1').forEach((node) => { node.textContent = event.title; });
      const description = document.querySelector('.page-hero p');
      if (description) description.textContent = 'Select your ticket quantity and confirm your reservation. No payment will be processed.';
      const image = document.querySelector('.detail-banner img');
      if (image) { image.src = event.image; image.alt = event.title; }
      const meta = document.querySelector('.detail-meta');
      if (meta) meta.innerHTML = [dateTime(event.eventDate), `${event.venue}, ${event.city}`].map((item) => `<span>${escapeHtml(item)}</span>`).join('');
      const price = document.querySelector('[data-price-per-seat]');
      if (price) { price.dataset.pricePerSeat = event.price; price.textContent = money(event.price); }
      const remaining = document.querySelector('[data-remaining-seats]');
      if (remaining) remaining.textContent = String(event.seatsLeft);
      if (quantity) quantity.max = '10';
      if (bookingForm) bookingForm.hidden = event.seatsLeft < 1;
      if (event.seatsLeft < 1) showPageError('This event is sold out.', document.querySelector('.booking-box'));
      updateTotal();
    } catch (error) {
      showPageError(error.message);
    }
  }

  bookingForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitForm(bookingForm, async () => {
      if (!selectedEvent) throw new Error('Event information is still loading.');
      const count = Number(quantity.value);
      if (!Number.isInteger(count) || count < 1 || count > 10 || count > selectedEvent.seatsLeft) throw new Error('Choose a valid ticket quantity within the available seats.');
      const result = await api.bookings.create(selectedEvent.id, count);
      location.replace(`booking-confirmation.html?booking=${encodeURIComponent(result.booking.id)}`);
    });
  });

  async function loadConfirmation() {
    const id = new URLSearchParams(location.search).get('booking');
    if (!id) { showPageError('No booking was selected.'); return; }
    try {
      const booking = await api.bookings.get(id);
      const rows = document.querySelectorAll('.summary-card .order-list li strong');
      const values = [booking.title, dateTime(booking.event_date), `${booking.venue}, ${booking.city}`, booking.quantity, money(booking.total_amount), booking.payment_status || 'Not Processed'];
      rows.forEach((row, index) => { if (values[index] !== undefined) row.textContent = values[index]; });
      const reference = document.querySelector('.summary-card .detail-meta');
      if (reference) reference.innerHTML = `<span>Ref: ${escapeHtml(booking.id)}</span><span>Ticket ID: ${escapeHtml(booking.ticket_id)}</span>`;
      const copy = document.querySelector('.success-box p');
      if (copy) copy.textContent = 'Your reservation is confirmed. No payment was processed.';
    } catch (error) { showPageError(error.message); }
  }

  async function loadDashboard() {
    try {
      const [summary, user] = await Promise.all([api.dashboard(), api.auth.me()]);
      const heading = document.querySelector('.page-hero h1');
      if (heading) heading.textContent = `Hello, ${user.name}!`;
      const stats = document.querySelectorAll('.summary-grid .dashboard-card strong');
      [summary.total, summary.upcoming.length, summary.completed, summary.cancelled].forEach((value, index) => {
        if (stats[index]) stats[index].textContent = String(Number(value || 0));
      });
      const list = document.querySelector('.dashboard-layout .booking-list');
      if (list) list.innerHTML = summary.upcoming.length ? summary.upcoming.map((item) => `<article class="booking-item"><div class="top"><h3>${escapeHtml(item.title)}</h3><span class="badge green">Confirmed</span></div><p class="muted">${dateTime(item.event_date)} · ${escapeHtml(item.venue)}, ${escapeHtml(item.city)}</p></article>`).join('') : '<p class="form-note">You have no upcoming bookings.</p>';
    } catch (error) { showPageError(error.message); }
  }

  async function loadBookings() {
    const container = document.querySelector('.booking-list');
    if (!container) return;
    const params = new URLSearchParams(location.search);
    const filterForm = document.getElementById('bookingFilters');
    if (filterForm) {
      filterForm.elements.q.value = params.get('q') || '';
      filterForm.elements.status.value = params.get('status') || '';
      filterForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const query = new URLSearchParams();
        if (filterForm.elements.q.value.trim()) query.set('q', filterForm.elements.q.value.trim());
        if (filterForm.elements.status.value) query.set('status', filterForm.elements.status.value);
        location.search = query.size ? `?${query}` : '';
      });
    }
    try {
      const data = await api.bookings.list({ q: params.get('q'), status: params.get('status'), page: 1, limit: 50 });
      if (!data.items.length) { container.innerHTML = '<p class="form-note">No bookings match these filters.</p>'; return; }
      container.innerHTML = data.items.map((booking) => `<article class="booking-item"><div class="top"><h3>${escapeHtml(booking.eventTitle)}</h3><span class="badge ${booking.status === 'Confirmed' ? 'green' : 'purple'}">${escapeHtml(booking.status)}</span></div><div class="booking-grid"><div><strong>Booking ID:</strong> ${escapeHtml(booking.id)}</div><div><strong>Tickets:</strong> ${booking.tickets}</div><div><strong>Date:</strong> ${dateTime(booking.date)}</div><div><strong>Amount:</strong> ${money(booking.amount)}</div></div><div class="actions" style="margin-top:14px;"><a href="booking-confirmation.html?booking=${encodeURIComponent(booking.id)}" class="btn btn-soft small-btn">View details</a>${booking.status === 'Confirmed' && new Date(booking.date).getTime() - Date.now() > 86400000 ? `<button type="button" class="btn btn-secondary small-btn" data-cancel-booking="${escapeHtml(booking.id)}">Cancel booking</button>` : ''}</div></article>`).join('');
      container.querySelectorAll('[data-cancel-booking]').forEach((button) => {
        button.addEventListener('click', async () => {
          if (!window.confirm('Cancel this booking? Available seats will be restored.')) return;
          button.disabled = true;
          try { await api.bookings.cancel(button.dataset.cancelBooking); await loadBookings(); }
          catch (error) { showPageError(error.message); button.disabled = false; }
        });
      });
    } catch (error) { showPageError(error.message); }
  }

  async function loadTickets() {
    const container = document.querySelector('.ticket-grid');
    if (!container) return;
    try {
      const tickets = await api.tickets();
      if (!tickets.length) { container.innerHTML = '<p class="form-note">You have no valid upcoming tickets.</p>'; return; }
      container.innerHTML = tickets.map((ticket) => `<article class="ticket-card"><div class="status-row"><h3>${escapeHtml(ticket.title)}</h3><span class="badge green">Valid</span></div><p class="muted">Ticket ID: ${escapeHtml(ticket.ticket_id)}</p><p class="muted">Booking ID: ${escapeHtml(ticket.booking_id)}</p><p class="muted">Attendee: ${escapeHtml(ticket.attendee_name)}</p><p class="muted">Date: ${dateTime(ticket.event_date)}</p><p class="muted">Location: ${escapeHtml(ticket.venue)}, ${escapeHtml(ticket.city)}</p><p class="muted">Quantity: ${Number(ticket.quantity)}</p><div class="qr-box"><img class="qr-image" src="${escapeHtml(ticket.qr_code_data_url)}" alt="QR code for ticket ${escapeHtml(ticket.ticket_id)}"></div><div class="actions"><button class="btn btn-primary small-btn" type="button" data-print-ticket>Print</button></div></article>`).join('');
      container.querySelectorAll('[data-print-ticket]').forEach((button) => button.addEventListener('click', () => window.print()));
    } catch (error) { showPageError(error.message); }
  }

  async function loadNotifications() {
    const container = document.querySelector('[data-notifications]');
    if (!container) return;
    try {
      const data = await api.notifications.list({ page: 1, limit: 50 });
      if (!data.items.length) { container.innerHTML = '<p class="form-note">You have no notifications.</p>'; return; }
      container.innerHTML = `<div class="booking-list">${data.items.map((item) => `<article class="booking-item"><div class="top"><h3>${item.is_read ? 'Update' : 'New notification'}</h3>${item.is_read ? '' : '<span class="badge green">Unread</span>'}</div><p>${escapeHtml(item.message)}</p><p class="muted">${dateTime(item.created_at)}</p>${item.is_read ? '' : `<button type="button" class="btn btn-soft small-btn" data-read-notification="${escapeHtml(item.id)}">Mark as read</button>`}</article>`).join('')}</div><button class="btn btn-secondary" type="button" data-read-all>Mark all as read</button>`;
      container.querySelectorAll('[data-read-notification]').forEach((button) => button.addEventListener('click', async () => {
        button.disabled = true;
        try { await api.notifications.read(button.dataset.readNotification); await loadNotifications(); }
        catch (error) { showPageError(error.message); button.disabled = false; }
      }));
      container.querySelector('[data-read-all]')?.addEventListener('click', async (event) => {
        event.currentTarget.disabled = true;
        try { await api.notifications.readAll(); await loadNotifications(); }
        catch (error) { showPageError(error.message); event.currentTarget.disabled = false; }
      });
    } catch (error) { showPageError(error.message); }
  }

  async function loadProfile() {
    const form = document.getElementById('profileForm');
    if (!form) return;
    try {
      const user = await api.auth.me();
      document.getElementById('profileName').value = user.name || '';
      document.getElementById('profileEmail').value = user.email || '';
      document.getElementById('profileEmail').readOnly = true;
      const overview = document.querySelectorAll('.profile-card:first-child p');
      if (overview[0]) overview[0].innerHTML = `<strong>Name:</strong> ${escapeHtml(user.name)}`;
      if (overview[1]) overview[1].innerHTML = `<strong>Email:</strong> ${escapeHtml(user.email)}`;
    } catch (error) { showPageError(error.message); }
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void submitForm(form, async () => {
        await api.auth.updateProfile({ name: document.getElementById('profileName').value.trim() });
        return 'Your profile was updated.';
      });
    });
    const passwordForm = document.getElementById('passwordForm');
    passwordForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      void submitForm(passwordForm, async () => {
        await api.auth.updatePassword({
          currentPassword: document.getElementById('currentPassword').value,
          newPassword: document.getElementById('newPassword').value
        });
        passwordForm.reset();
        return 'Your password was updated.';
      });
    });
  }

  if (quantity) void loadBookableEvent();
  if (page === 'booking-confirmation.html') void loadConfirmation();
  if (page === 'dashboard.html') void loadDashboard();
  if (page === 'my-bookings.html') void loadBookings();
  if (page === 'my-tickets.html') void loadTickets();
  if (page === 'my-profile.html') void loadProfile();
  if (page === 'notifications.html') void loadNotifications();
  void guardUserPage().catch((error) => showPageError(error.message));
});
