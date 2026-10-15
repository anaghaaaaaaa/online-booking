(() => {
  const KEYS = {
    events: 'eventease.organizer.events',
    users: 'eventease.organizer.users',
    requests: 'eventease.organizer.requests',
    session: 'eventease.organizer.session',
    notifications: 'eventease.organizer.notifications',
    profiles: 'eventease.organizer.profiles'
  };
  const ADMIN = { id: 'eventease-admin', email: 'admin@eventease.com', password: 'Admin@123', role: 'admin', name: 'EventEase Admin' };
  const DEMO_ORGANIZER = { id: 'organizer-demo', email: 'organizer@eventease.com', password: 'Organizer@123', role: 'organizer', name: 'Avery Morgan' };
  const root = document.getElementById('adminRoot');
  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
  const formatDate = (value) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value)) : '—';
  const setSession = (session) => write(KEYS.session, session);
  const dateIn = (days) => { const value = new Date(); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); };

  function seed() {
    const users = read(KEYS.users, []);
    if (!users.some((user) => user.email === ADMIN.email)) users.push(ADMIN);
    if (!users.some((user) => user.email === DEMO_ORGANIZER.email)) users.push(DEMO_ORGANIZER);
    write(KEYS.users, users);
    if (!read(KEYS.events, []).length) {
      write(KEYS.events, [
        { id: 'event-ai-summit', organizerId: DEMO_ORGANIZER.id, title: 'Future of AI Summit', category: 'Business', description: 'A practical gathering for people building the next generation of intelligent products and services.', date: dateIn(32), time: '09:30', venue: 'Innovation Hall', city: 'Bengaluru', price: 1499, capacity: 120, seatsLeft: 118, image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=900&q=80', status: 'Approved', rejectionReason: '', createdAt: new Date().toISOString() },
        { id: 'event-neon-nights', organizerId: DEMO_ORGANIZER.id, title: 'Neon Nights Live', category: 'Music', description: 'An open-air evening of local artists, live electronic music, and late-night food stalls.', date: dateIn(44), time: '19:00', venue: 'Riverside Grounds', city: 'Hyderabad', price: 2999, capacity: 240, seatsLeft: 236, image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80', status: 'Approved', rejectionReason: '', createdAt: new Date().toISOString() },
        { id: 'event-design-lab', organizerId: DEMO_ORGANIZER.id, title: 'Creative Design Bootcamp', category: 'Workshop', description: 'A hands-on day for designers to sharpen their visual thinking and prototype useful ideas.', date: dateIn(52), time: '10:00', venue: 'Studio North', city: 'Pune', price: 899, capacity: 80, seatsLeft: 80, image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=80', status: 'Pending', rejectionReason: '', createdAt: new Date().toISOString() }
      ]);
    }
    if (!localStorage.getItem(KEYS.requests)) write(KEYS.requests, []);
    if (!localStorage.getItem(KEYS.notifications)) write(KEYS.notifications, []);
    if (!localStorage.getItem(KEYS.profiles)) write(KEYS.profiles, {});
  }

  function loginView() {
    root.innerHTML = `<main class="org-login admin-login"><div class="org-login-art admin-login-art"><span class="org-eyebrow">EVENTEASE · ADMINISTRATION</span><h1>Keep every event on the right track.</h1><p>Review event submissions, support organizers, and keep the EventEase community moving.</p><div class="org-login-decor"><span>REVIEW<br><strong>WITH CARE</strong></span><i></i><span>BUILD<br><strong>TRUST</strong></span></div></div><section class="org-login-panel"><a class="org-brand org-brand-login" href="index.html"><span class="org-logo">E</span><span>EventEase<span class="org-brand-sub">ADMINISTRATION</span></span></a><div class="org-login-form-wrap"><span class="org-eyebrow">ADMIN ACCESS</span><h2>Sign in to administration</h2><p>Review pending events and organizer access requests.</p><form id="adminLoginForm" class="org-form-grid"><label class="org-field org-field-full"><span>Email address</span><input type="email" name="email" autocomplete="username" required placeholder="admin@eventease.com"></label><label class="org-field org-field-full"><span>Password</span><input type="password" name="password" autocomplete="current-password" required placeholder="Enter your password"></label><div class="org-form-message" id="adminLoginMessage" role="alert"></div><button class="org-button org-button-primary org-field-full">Sign in</button></form><div class="org-demo-credentials"><strong>Demo administrator</strong><span>admin@eventease.com</span><span>Admin@123</span></div><a class="org-back-link" href="index.html">← Back to EventEase</a></div></section></main>`;
    root.querySelector('#adminLoginForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      if (String(form.get('email')).toLowerCase() !== ADMIN.email || form.get('password') !== ADMIN.password) {
        document.getElementById('adminLoginMessage').textContent = 'Email or password is incorrect.';
        return;
      }
      setSession({ id: ADMIN.id, email: ADMIN.email, name: ADMIN.name, role: 'admin' });
      location.hash = '#/dashboard';
      render();
    });
  }

  const events = () => read(KEYS.events, []);
  const requests = () => read(KEYS.requests, []);
  const pendingEvents = () => events().filter((event) => event.status === 'Pending');
  const pendingRequests = () => requests().filter((request) => request.status === 'Pending');
  const statusBadge = (status) => `<span class="org-status org-status-${String(status).toLowerCase()}">${escapeHtml(status)}</span>`;
  const heading = (eyebrow, title, text, action = '') => `<div class="org-page-heading"><div><span class="org-eyebrow">${eyebrow}</span><h1>${title}</h1><p>${text}</p></div>${action}</div>`;
  const emptyState = (title, text) => `<div class="org-empty"><span class="org-empty-mark">✓</span><h3>${title}</h3><p>${text}</p></div>`;

  function layout(content, active) {
    const queuedEvents = pendingEvents().length;
    const queuedRequests = pendingRequests().length;
    const links = [['dashboard', 'Overview', '◫'], ['events', 'Event approvals', '▦'], ['requests', 'Organizer requests', '♙']];
    return `<div class="org-shell admin-shell"><aside class="org-sidebar admin-sidebar"><a class="org-brand" href="#/dashboard"><span class="org-logo">E</span><span>EventEase<span class="org-brand-sub">ADMINISTRATION</span></span></a><nav class="org-nav" aria-label="Admin navigation">${links.map(([route, label, icon]) => `<a class="org-nav-link ${active === route ? 'is-active' : ''}" href="#/${route}"><span class="org-nav-icon" aria-hidden="true">${icon}</span><span>${label}</span>${route === 'events' && queuedEvents ? `<span class="org-nav-count">${queuedEvents}</span>` : ''}${route === 'requests' && queuedRequests ? `<span class="org-nav-count">${queuedRequests}</span>` : ''}</a>`).join('')}</nav><div class="org-sidebar-bottom"><div class="org-avatar">A</div><div class="org-person"><strong>EventEase Admin</strong><span>Administrator</span></div><button class="org-logout" data-action="logout" aria-label="Log out" title="Log out">↗</button></div></aside><div class="org-main-column"><header class="org-topbar"><button class="org-menu-toggle" data-action="menu" aria-label="Open navigation">☰</button><div><span class="org-topbar-kicker">ADMIN WORKSPACE</span><strong>Platform review queue</strong></div><div class="org-topbar-right"><span class="org-date">${new Intl.DateTimeFormat('en-IN', { dateStyle: 'full' }).format(new Date())}</span></div></header><main class="org-content" id="adminContent">${content}</main></div><div class="org-backdrop" data-action="menu-close"></div></div>`;
  }

  function dashboard() {
    const allEvents = events();
    const allRequests = requests();
    const organizers = read(KEYS.users, []).filter((user) => user.role === 'organizer');
    const cards = [['Events awaiting review', pendingEvents().length, 'Review event content', '▦'], ['Organizer applications', pendingRequests().length, 'Access requests to review', '♙'], ['Approved events', allEvents.filter((event) => event.status === 'Approved').length, 'Visible to the public when upcoming', '✓'], ['Organizers', organizers.length, 'Registered organizer accounts', '◉']];
    const eventRows = pendingEvents().slice(0, 5).map((event) => `<tr><td><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.category)} · ${escapeHtml(event.city)}</small></td><td>${escapeHtml(organizerName(event.organizerId))}</td><td>${formatDate(event.date)}</td><td>${money(event.price)}</td><td>${statusBadge(event.status)}</td><td><a class="org-button org-button-outline" href="#/events">Review</a></td></tr>`).join('');
    return `${heading('PLATFORM PULSE', 'Administration', 'A review queue for event quality and organizer access.', '<a class="org-button org-button-outline" href="index.html">View public site ↗</a>')}<section class="org-stat-grid admin-stat-grid">${cards.map(([label, value, note, icon]) => `<article class="org-stat-card"><div class="org-stat-top"><span>${label}</span><b>${icon}</b></div><strong>${value}</strong><small>${note}</small></article>`).join('')}</section><section class="org-panel"><div class="org-panel-heading"><div><span class="org-eyebrow">NEEDS ATTENTION</span><h2>Events awaiting approval</h2></div><a href="#/events">Review all →</a></div>${eventRows ? `<div class="org-table-scroll"><table class="org-table"><thead><tr><th>Event</th><th>Organizer</th><th>Date</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody>${eventRows}</tbody></table></div>` : emptyState('No event submissions to review', 'New event submissions will appear here.')}</section><section class="org-panel"><div class="org-panel-heading"><div><span class="org-eyebrow">ACCESS REQUESTS</span><h2>Organizer applications</h2></div><a href="#/requests">Review all →</a></div>${pendingRequests().length ? `<p class="admin-queue-note">${pendingRequests().length} application${pendingRequests().length === 1 ? '' : 's'} need a decision.</p>` : emptyState('No pending applications', 'Organizer requests submitted through Contact will appear here.')}</section>`;
  }

  function eventReviewPage() {
    const allEvents = events();
    const filter = new URLSearchParams(location.hash.split('?')[1] || '').get('status') || 'Pending';
    const filtered = allEvents.filter((event) => !filter || event.status === filter).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    const cards = filtered.map((event) => `<article class="admin-review-card"><div class="admin-review-image">${event.image ? `<img src="${escapeHtml(event.image)}" alt="${escapeHtml(event.title)} banner">` : '<span>EVENT</span>'}</div><div class="admin-review-body"><div class="admin-review-title"><div><span class="org-eyebrow">${escapeHtml(event.category)} · ${dateText(event.date)}</span><h2>${escapeHtml(event.title)}</h2></div>${statusBadge(event.status)}</div><p>${escapeHtml(event.description)}</p><div class="admin-event-meta"><span><small>ORGANIZER</small><strong>${escapeHtml(organizerName(event.organizerId))}</strong></span><span><small>LOCATION</small><strong>${escapeHtml(event.venue)}, ${escapeHtml(event.city)}</strong></span><span><small>TICKETS</small><strong>${money(event.price)} · ${event.capacity} seats</strong></span><span><small>SUBMITTED</small><strong>${formatDate(event.createdAt)}</strong></span></div>${event.rejectionReason ? `<div class="org-error-callout">Previously rejected: ${escapeHtml(event.rejectionReason)}</div>` : ''}${event.status === 'Pending' ? `<div class="admin-review-actions"><button class="org-button org-button-primary" data-action="approve-event" data-id="${escapeHtml(event.id)}">Approve event</button><button class="org-button org-button-danger" data-action="reject-event" data-id="${escapeHtml(event.id)}">Reject</button></div>` : ''}</div></article>`).join('');
    return `${heading('CONTENT REVIEW', 'Event approvals', 'Review submissions before they appear on the public event pages.') }<section class="org-panel"><div class="admin-filter-row"><label for="eventStatusFilter">Show</label><select id="eventStatusFilter"><option value="Pending" ${filter === 'Pending' ? 'selected' : ''}>Pending</option><option value="Approved" ${filter === 'Approved' ? 'selected' : ''}>Approved</option><option value="Rejected" ${filter === 'Rejected' ? 'selected' : ''}>Rejected</option><option value="Cancelled" ${filter === 'Cancelled' ? 'selected' : ''}>Cancelled</option><option value="" ${filter === '' ? 'selected' : ''}>All events</option></select><span>${filtered.length} event${filtered.length === 1 ? '' : 's'}</span></div>${cards ? `<div class="admin-review-list">${cards}</div>` : emptyState('No events in this view', filter === 'Pending' ? 'New event submissions will appear here.' : 'Try another status filter.')}</section>`;
  }

  function requestPage() {
    const allRequests = requests().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const cards = allRequests.map((request) => `<article class="admin-request-card"><div class="admin-request-top"><div><span class="org-eyebrow">ORGANIZER APPLICATION · ${formatDate(request.createdAt)}</span><h2>${escapeHtml(request.organization)}</h2></div>${statusBadge(request.status || 'Pending')}</div><div class="admin-request-data"><span><small>CONTACT</small><strong>${escapeHtml(request.name)}</strong></span><span><small>EMAIL</small><strong>${escapeHtml(request.email)}</strong></span></div><p>${escapeHtml(request.details)}</p>${request.status === 'Pending' ? `<div class="admin-review-actions"><button class="org-button org-button-primary" data-action="approve-request" data-id="${escapeHtml(request.id)}">Approve access</button><button class="org-button org-button-danger" data-action="reject-request" data-id="${escapeHtml(request.id)}">Decline request</button></div>` : request.status === 'Approved' ? `<div class="admin-credential-note">Organizer account created. Sign-in email: <strong>${escapeHtml(request.email)}</strong><br>Temporary password: <strong>${escapeHtml(request.tempPassword || 'Use the organizer password set by admin')}</strong></div>` : ''}</article>`).join('');
    return `${heading('ORGANIZER ACCESS', 'Organizer requests', 'Approve trusted creators to manage their own events.') }<section class="org-panel">${cards || emptyState('No applications yet', 'Requests submitted from the Contact page will be listed here.')}</section>`;
  }

  function dateText(value) {
    if (!value) return 'Date not set';
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
  }

  function organizerName(id) {
    const user = read(KEYS.users, []).find((item) => item.id === id);
    return user?.name || read(KEYS.profiles, {})[id]?.name || (id === 'organizer-demo' ? 'Avery Morgan' : 'Organizer');
  }

  function sendNotification(organizerId, message) {
    const items = read(KEYS.notifications, []);
    items.unshift({ id: crypto.randomUUID(), organizerId, message, createdAt: new Date().toISOString(), read: false });
    write(KEYS.notifications, items.slice(0, 200));
  }

  function approveEvent(id) {
    const records = events();
    const event = records.find((item) => item.id === id && item.status === 'Pending');
    if (!event) return;
    event.status = 'Approved';
    event.rejectionReason = '';
    event.reviewedAt = new Date().toISOString();
    write(KEYS.events, records);
    sendNotification(event.organizerId, `“${event.title}” has been approved and can now be listed publicly.`);
    render();
  }

  function rejectEvent(id) {
    const records = events();
    const event = records.find((item) => item.id === id && item.status === 'Pending');
    if (!event) return;
    const reason = window.prompt('Add a reason for rejecting this event:');
    if (!reason || !reason.trim()) return;
    event.status = 'Rejected';
    event.rejectionReason = reason.trim();
    event.reviewedAt = new Date().toISOString();
    write(KEYS.events, records);
    sendNotification(event.organizerId, `“${event.title}” was rejected. Reason: ${event.rejectionReason}`);
    render();
  }

  function approveRequest(id) {
    const records = requests();
    const request = records.find((item) => item.id === id && item.status === 'Pending');
    if (!request) return;
    const users = read(KEYS.users, []);
    let user = users.find((item) => item.email.toLowerCase() === request.email.toLowerCase());
    const temporaryPassword = `Event@${Math.floor(1000 + Math.random() * 9000)}A`;
    if (!user) {
      user = { id: crypto.randomUUID(), email: request.email, name: request.name, password: temporaryPassword, role: 'organizer' };
      users.push(user);
      write(KEYS.users, users);
    } else {
      user.role = 'organizer';
      user.password = user.password || temporaryPassword;
      write(KEYS.users, users);
    }
    const profiles = read(KEYS.profiles, {});
    profiles[user.id] = { name: request.name, email: request.email, phone: '', organization: request.organization, bio: request.details, password: user.password };
    write(KEYS.profiles, profiles);
    request.status = 'Approved';
    request.reviewedAt = new Date().toISOString();
    request.tempPassword = user.password;
    request.organizerId = user.id;
    write(KEYS.requests, records);
    render();
  }

  function rejectRequest(id) {
    const records = requests();
    const request = records.find((item) => item.id === id && item.status === 'Pending');
    if (!request) return;
    if (!window.confirm(`Decline the organizer request from ${request.name}?`)) return;
    request.status = 'Rejected';
    request.reviewedAt = new Date().toISOString();
    write(KEYS.requests, records);
    render();
  }

  function render() {
    seed();
    const session = read(KEYS.session, null);
    if (session?.role !== 'admin' || session.id !== ADMIN.id) { loginView(); return; }
    const hash = location.hash.replace(/^#\/?/, '');
    const [route, query] = hash.split('?');
    let content;
    const active = route || 'dashboard';
    if (active === 'events') content = eventReviewPage();
    else if (active === 'requests') content = requestPage();
    else content = dashboard();
    root.innerHTML = layout(content, active);
    bind();
  }

  function bind() {
    document.querySelector('[data-action="logout"]')?.addEventListener('click', () => { localStorage.removeItem(KEYS.session); location.hash = ''; render(); });
    document.querySelector('[data-action="menu"]')?.addEventListener('click', () => document.body.classList.add('org-menu-open'));
    document.querySelector('[data-action="menu-close"]')?.addEventListener('click', () => document.body.classList.remove('org-menu-open'));
    document.querySelectorAll('[data-action="approve-event"]').forEach((button) => button.addEventListener('click', () => approveEvent(button.dataset.id)));
    document.querySelectorAll('[data-action="reject-event"]').forEach((button) => button.addEventListener('click', () => rejectEvent(button.dataset.id)));
    document.querySelectorAll('[data-action="approve-request"]').forEach((button) => button.addEventListener('click', () => approveRequest(button.dataset.id)));
    document.querySelectorAll('[data-action="reject-request"]').forEach((button) => button.addEventListener('click', () => rejectRequest(button.dataset.id)));
    document.getElementById('eventStatusFilter')?.addEventListener('change', (event) => { location.hash = `#/events${event.target.value ? `?status=${encodeURIComponent(event.target.value)}` : ''}`; });
  }

  window.addEventListener('hashchange', () => { document.body.classList.remove('org-menu-open'); render(); });
  seed();
  render();
})();
