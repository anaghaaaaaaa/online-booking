document.addEventListener('DOMContentLoaded', () => {
  const api = window.EventEaseApi;
  const root = document.getElementById('adminRoot') || document.getElementById('organizerRoot');
  if (!api || !root) return;
  const role = root.id === 'adminRoot' ? 'admin' : 'organizer';
  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
  const dateText = (value) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value)) : '—';
  const status = (value) => `<span class="org-status org-status-${escapeHtml(String(value || '').toLowerCase())}">${escapeHtml(value || '—')}</span>`;
  const routes = role === 'admin'
    ? [['dashboard', 'Overview'], ['events', 'Events'], ['requests', 'Organizer requests'], ['users', 'Users'], ['bookings', 'Bookings'], ['categories', 'Categories'], ['reports', 'Reports'], ['activity', 'Activity'], ['profile', 'Profile']]
    : [['dashboard', 'Overview'], ['events', 'My events'], ['bookings', 'Bookings'], ['reports', 'Reports'], ['notifications', 'Notifications'], ['profile', 'Profile']];
  let user;

  function pageHeading(kicker, title, description, action = '') {
    return `<div class="org-page-heading"><div><span class="org-eyebrow">${escapeHtml(kicker)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${action}</div>`;
  }
  function panel(content) { return `<section class="org-panel">${content}</section>`; }
  function empty(message) { return `<div class="org-empty"><span class="org-empty-mark">✓</span><h3>${escapeHtml(message)}</h3></div>`; }
  function statCards(pairs) {
    return `<section class="org-stat-grid">${pairs.map(([label, value]) => `<article class="org-stat-card"><div class="org-stat-top"><span>${escapeHtml(label)}</span></div><strong>${escapeHtml(value)}</strong></article>`).join('')}</section>`;
  }
  function table(headers, rows) {
    return rows.length
      ? `<div class="org-table-scroll"><table class="org-table"><thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
      : empty('No records found.');
  }
  function alert(message, target = root) {
    let note = target.querySelector('[data-panel-error]');
    if (!note) {
      note = document.createElement('p');
      note.className = 'org-error-copy';
      note.dataset.panelError = 'true';
      note.setAttribute('role', 'alert');
      target.prepend(note);
    }
    note.textContent = message;
  }
  function setMain(content, active) {
    root.innerHTML = `<div class="org-shell ${role}-shell"><aside class="org-sidebar ${role}-sidebar"><a class="org-brand" href="#/dashboard"><span class="org-logo">E</span><span>EventEase<span class="org-brand-sub">${role === 'admin' ? 'ADMINISTRATION' : 'ORGANIZER STUDIO'}</span></span></a><nav class="org-nav" aria-label="${role} navigation">${routes.map(([path, label]) => `<a class="org-nav-link ${path === active ? 'is-active' : ''}" href="#/${path}"><span>${escapeHtml(label)}</span></a>`).join('')}</nav><div class="org-sidebar-bottom"><div class="org-avatar">${escapeHtml((user.name || 'E').slice(0, 1).toUpperCase())}</div><div class="org-person"><strong>${escapeHtml(user.name)}</strong><span>${role === 'admin' ? 'Administrator' : 'Event organizer'}</span></div><button class="org-logout" data-action="logout" aria-label="Log out" title="Log out">↗</button></div></aside><div class="org-main-column"><header class="org-topbar"><button class="org-menu-toggle" data-action="menu" aria-label="Open navigation">☰</button><div><span class="org-topbar-kicker">${role === 'admin' ? 'ADMIN WORKSPACE' : 'ORGANIZER WORKSPACE'}</span><strong>${escapeHtml(user.name)}</strong></div><div class="org-topbar-right"><span class="org-date">${dateText(new Date())}</span></div></header><main class="org-content" id="panelContent">${content}</main></div><div class="org-backdrop" data-action="menu-close"></div></div>`;
    bindLayout();
  }
  function bindLayout() {
    root.querySelector('[data-action="logout"]')?.addEventListener('click', async () => {
      try { await api.auth.logout(); } catch (error) { alert(error.message); }
      location.replace('login.html');
    });
    root.querySelector('[data-action="menu"]')?.addEventListener('click', () => document.body.classList.add('org-menu-open'));
    root.querySelector('[data-action="menu-close"]')?.addEventListener('click', () => document.body.classList.remove('org-menu-open'));
    root.querySelectorAll('form[data-panel-form]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try { await formHandlers[form.dataset.panelForm](form); }
      catch (error) { alert(error.message, form); }
      finally { button.disabled = false; }
    }));
    root.querySelectorAll('[data-panel-action]').forEach((button) => button.addEventListener('click', async () => {
      const method = actions[button.dataset.panelAction];
      if (!method) return;
      button.disabled = true;
      try { await method(button); }
      catch (error) { alert(error.message); button.disabled = false; }
    }));
    root.querySelectorAll('[data-export]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      try { await api.download(button.dataset.export, {}, button.dataset.filename || 'eventease-export.csv'); }
      catch (error) { alert(error.message); }
      finally { button.disabled = false; }
    }));
    root.querySelectorAll('form[data-filter]').forEach((form) => form.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = new URLSearchParams(new FormData(form));
      const route = form.dataset.filter;
      location.hash = `#/${route}${query.size ? `?${query}` : ''}`;
    }));
  }

  const formHandlers = {
    login: async (form) => {
      const data = new FormData(form);
      user = await api.auth.login({ email: data.get('email'), password: data.get('password') });
      if (user.role !== role) {
        location.replace(user.role === 'admin' ? 'admin.html#/dashboard' : user.role === 'organizer' ? 'organizer.html#/dashboard' : 'dashboard.html');
        return;
      }
      location.hash = '#/dashboard';
      await render();
    },
    event: async (form) => {
      if (!form.reportValidity()) return;
      const body = {};
      const numericFields = new Set(['categoryId', 'ticketPrice', 'capacity']);
      for (const name of ['title', 'description', 'categoryId', 'eventDate', 'venue', 'city', 'bannerImage', 'ticketPrice', 'capacity']) {
        const field = form.elements.namedItem(name);
        if (!field || field.disabled || field.value === '') continue;
        body[name] = numericFields.has(name) ? Number(field.value) : field.value;
      }
      const id = form.dataset.id;
      if (id) await api.organizer.updateEvent(id, body);
      else await api.organizer.createEvent(body);
      location.hash = '#/events';
      await render();
    },
    profile: async (form) => {
      const data = new FormData(form);
      user = await api.auth.updateProfile({ name: data.get('name'), phone: data.get('phone') || null, organization_name: data.get('organization_name') || null, bio: data.get('bio') || null });
      await render();
    },
    password: async (form) => {
      const data = new FormData(form);
      if (data.get('newPassword') !== data.get('confirmPassword')) throw new Error('New passwords do not match.');
      await api.auth.updatePassword({ currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') });
      form.reset();
      alert('Password updated.', form);
    },
    category: async (form) => {
      const data = new FormData(form);
      await api.admin.createCategory(data.get('categoryName'));
      await render();
    }
  };

  const actions = {
    approve: async (button) => { await api.admin.approveEvent(button.dataset.id); await render(); },
    reject: async (button) => {
      const reason = window.prompt('Enter a rejection reason (at least 10 characters):');
      if (reason === null) return;
      await api.admin.rejectEvent(button.dataset.id, reason.trim());
      await render();
    },
    remove: async (button) => {
      const reason = window.prompt('Enter a reason for removing this event (at least 10 characters):');
      if (reason === null) return;
      await api.admin.removeEvent(button.dataset.id, reason.trim());
      await render();
    },
    approveRequest: async (button) => { await api.admin.approveRequest(button.dataset.id); await render(); },
    rejectRequest: async (button) => {
      const note = window.prompt('Optional review note:');
      if (note === null) return;
      await api.admin.rejectRequest(button.dataset.id, note);
      await render();
    },
    userStatus: async (button) => {
      const next = button.dataset.status === 'Active' ? 'Blocked' : 'Active';
      if (!window.confirm(`${next} this account?`)) return;
      await api.admin.userStatus(button.dataset.id, next);
      await render();
    },
    userRole: async (button) => {
      const next = button.dataset.role === 'organizer' ? 'user' : 'organizer';
      if (!window.confirm(`Change this account role to ${next}?`)) return;
      await api.admin.userRole(button.dataset.id, next);
      await render();
    },
    deleteUser: async (button) => {
      if (!window.confirm('Delete this account? Accounts with bookings or events cannot be deleted.')) return;
      await api.admin.deleteUser(button.dataset.id);
      await render();
    },
    deleteCategory: async (button) => {
      if (!window.confirm('Delete this category? Categories used by events cannot be deleted.')) return;
      await api.admin.deleteCategory(button.dataset.id);
      await render();
    },
    editCategory: async (button) => {
      const name = window.prompt('New category name:', button.dataset.name);
      if (!name) return;
      await api.admin.updateCategory(button.dataset.id, name.trim());
      await render();
    },
    deleteEvent: async (button) => {
      if (!window.confirm('Delete this event? If it has confirmed bookings, cancel it instead.')) return;
      await api.organizer.deleteEvent(button.dataset.id);
      await render();
    },
    cancelEvent: async (button) => {
      if (!window.confirm('Cancel this event and notify attendees?')) return;
      await api.organizer.cancelEvent(button.dataset.id);
      await render();
    },
    markAllRead: async () => { await api.notifications.readAll(); await render(); },
    markRead: async (button) => { await api.notifications.read(button.dataset.id); await render(); }
  };

  async function dashboardPage() {
    if (role === 'admin') {
      const data = await api.admin.dashboard();
      const entries = [['Users', data.total_users], ['Organizers', data.organizers], ['Events', data.events], ['Pending approvals', data.pending_approvals], ['Bookings', data.bookings], ['Revenue', money(data.revenue)]];
      const rows = (data.recent_bookings || []).map((item) => `<tr><td>${escapeHtml(item.attendee_name)}</td><td>${escapeHtml(item.event_title)}</td><td>${item.quantity}</td><td>${status(item.booking_status)}</td></tr>`);
      return `${pageHeading('OVERVIEW', 'Administration dashboard', 'Platform activity and review queue.')}${statCards(entries)}${panel(`<h2>Recent bookings</h2>${table(['Attendee', 'Event', 'Tickets', 'Status'], rows)}`)}`;
    }
    const [data, events, bookings] = await Promise.all([api.organizer.dashboard(), api.organizer.events({ page: 1, limit: 50 }), api.organizer.bookings({ page: 1, limit: 5 })]);
    const entries = [['Events', data.total_events], ['Bookings', data.total_bookings], ['Tickets sold', data.tickets_sold], ['Revenue', money(data.revenue)], ['Seats available', data.available_seats], ['Pending approval', data.pending_approval]];
    const rows = bookings.items.map((item) => `<tr><td>${escapeHtml(item.attendee_name)}</td><td>${escapeHtml(item.event_title)}</td><td>${item.tickets}</td><td>${money(item.amount)}</td><td>${status(item.status)}</td></tr>`);
    return `${pageHeading('OVERVIEW', `Welcome back, ${user.name}`, 'Your current event and booking activity.', '<a class="org-button org-button-primary" href="#/events/new">＋ Create event</a>')}${statCards(entries)}${panel(`<h2>Upcoming events</h2>${table(['Event', 'Date', 'City', 'Availability', 'Status'], events.items.filter((event) => event.status !== 'Cancelled').map((event) => `<tr><td>${escapeHtml(event.title)}</td><td>${dateText(event.event_date)}</td><td>${escapeHtml(event.city)}</td><td>${event.seatsLeft} / ${event.capacity}</td><td>${status(event.status)}</td></tr>`))}`)}${panel(`<h2>Recent bookings</h2>${table(['Attendee', 'Event', 'Tickets', 'Amount', 'Status'], rows)}`)}`;
  }

  function queryFromHash() {
    const raw = location.hash.split('?')[1] || '';
    return Object.fromEntries(new URLSearchParams(raw));
  }

  async function eventFormPage(id) {
    const [categories, event] = await Promise.all([
      api.events.categories(),
      id ? api.organizer.event(id) : Promise.resolve(null)
    ]);
    const sold = Number(event?.confirmed_tickets || 0);
    const restrictApproved = event?.status === 'Approved' && sold > 0;
    const options = categories.map((item) => `<option value="${item.id}" ${Number(item.id) === Number(event?.category_id) ? 'selected' : ''}>${escapeHtml(item.category_name)}</option>`).join('');
    const date = event?.event_date ? new Date(event.event_date).toISOString().slice(0, 16) : '';
    const locked = restrictApproved ? 'disabled aria-disabled="true"' : '';
    const rule = restrictApproved ? `<div class="org-info-callout org-field-full">This approved event has ${sold} confirmed tickets. Title, category, date, time, price, and city are locked. You may update description, image, venue, or increase capacity (minimum ${sold}).</div>` : '';
    return `${pageHeading('EVENT DETAILS', id ? 'Edit event' : 'Create event', 'The API validates approval and booking restrictions when saving.')}<form class="org-form-grid org-panel" data-panel-form="event" ${id ? `data-id="${escapeHtml(id)}"` : ''}><label class="org-field"><span>Event title</span><input name="title" required minlength="3" maxlength="180" value="${escapeHtml(event?.title || '')}" ${locked}></label><label class="org-field"><span>Category</span><select name="categoryId" required ${locked}>${options}</select></label><label class="org-field org-field-full"><span>Description</span><textarea name="description" required minlength="30">${escapeHtml(event?.description || '')}</textarea></label>${rule}<label class="org-field"><span>Date and time</span><input name="eventDate" type="datetime-local" required value="${escapeHtml(date)}" ${locked}></label><label class="org-field"><span>Venue</span><input name="venue" required value="${escapeHtml(event?.venue || '')}"></label><label class="org-field"><span>City</span><input name="city" required value="${escapeHtml(event?.city || '')}" ${locked}></label><label class="org-field"><span>Banner image URL</span><input name="bannerImage" type="url" required value="${escapeHtml(event?.banner_image || event?.bannerImage || '')}"></label><label class="org-field"><span>Ticket price</span><input name="ticketPrice" type="number" min="0" step="0.01" required value="${Number(event?.ticket_price ?? event?.ticketPrice ?? 0)}" ${locked}></label><label class="org-field"><span>Capacity</span><input name="capacity" type="number" min="${Math.max(1, sold)}" max="100000" required value="${Number(event?.capacity || 1)}"></label><button class="org-button org-button-primary org-field-full" type="submit">Save event</button></form>`;
  }

  async function eventsPage() {
    if (role === 'organizer' && location.hash.includes('/events/new')) return eventFormPage(null);
    const editMatch = role === 'organizer' && location.hash.match(/^#\/events\/(\d+)\/edit/);
    if (editMatch) return eventFormPage(editMatch[1]);
    const bookingsMatch = role === 'organizer' && location.hash.match(/^#\/events\/(\d+)\/bookings/);
    if (bookingsMatch) return eventBookingsPage(bookingsMatch[1]);
    const query = queryFromHash();
    const result = role === 'admin' ? await api.admin.events({ ...query, page: 1, limit: 50 }) : await api.organizer.events({ ...query, page: 1, limit: 50 });
    const rows = result.items.map((event) => {
      const actions = role === 'admin'
        ? `${event.status === 'Pending' ? `<button data-panel-action="approve" data-id="${event.id}">Approve</button><button data-panel-action="reject" data-id="${event.id}">Reject</button>` : ''}${!['Removed', 'Cancelled'].includes(event.status) ? `<button data-panel-action="remove" data-id="${event.id}">Remove</button>` : ''}`
        : `<a href="#/events/${event.id}/edit">Edit</a><a href="#/events/${event.id}/bookings">Bookings</a><button data-panel-action="${event.status === 'Approved' ? 'cancelEvent' : 'deleteEvent'}" data-id="${event.id}">${event.status === 'Approved' ? 'Cancel' : 'Delete'}</button>`;
      return `<tr><td>${escapeHtml(event.title)}</td><td>${escapeHtml(event.category_name || event.category)}</td><td>${dateText(event.event_date || event.eventDate)}</td><td>${escapeHtml(event.city)}</td><td>${money(event.ticket_price ?? event.price)}</td><td>${event.available_seats ?? event.seatsLeft} / ${event.capacity}</td><td>${status(event.status)}${event.rejection_reason ? `<small>${escapeHtml(event.rejection_reason)}</small>` : ''}</td><td><div class="org-row-actions">${actions}</div></td></tr>`;
    });
    const filters = `<form class="org-filters" data-filter="events"><input name="q" placeholder="Search events" value="${escapeHtml(query.q || '')}"><select name="status"><option value="">All statuses</option>${['Pending', 'Approved', 'Rejected', 'Cancelled', 'Removed'].map((value) => `<option ${query.status === value ? 'selected' : ''}>${value}</option>`).join('')}</select><button class="org-button org-button-outline">Filter</button></form>`;
    return `${pageHeading('EVENTS', role === 'admin' ? 'Manage events' : 'My events', 'Review event status and details.', role === 'organizer' ? '<a class="org-button org-button-primary" href="#/events/new">＋ Create event</a>' : '')}${panel(`${filters}${table(['Title', 'Category', 'Date', 'City', 'Price', 'Seats', 'Status', 'Actions'], rows)}`)}`;
  }

  async function requestsPage() {
    const query = queryFromHash();
    const result = await api.admin.requests({ ...query, page: 1, limit: 50 });
    const rows = result.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.email)}</td><td>${escapeHtml(item.organization_name)}</td><td>${escapeHtml(item.reason)}</td><td>${status(item.status)}</td><td><button data-panel-action="approveRequest" data-id="${item.id}">Approve</button><button data-panel-action="rejectRequest" data-id="${item.id}">Reject</button></td></tr>`);
    return `${pageHeading('ACCESS', 'Organizer requests', 'Approve eligible users to create and manage events.')}${panel(table(['User', 'Email', 'Organization', 'Reason', 'Status', 'Actions'], rows))}`;
  }

  async function usersPage() {
    const query = queryFromHash();
    const result = await api.admin.users({ ...query, page: 1, limit: 50 });
    const rows = result.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.email)}</td><td>${escapeHtml(item.role)}</td><td>${status(item.status)}</td><td>${dateText(item.created_at)}</td><td><button data-panel-action="userStatus" data-id="${item.id}" data-status="${escapeHtml(item.status)}">${item.status === 'Active' ? 'Block' : 'Unblock'}</button>${item.role !== 'admin' ? `<button data-panel-action="userRole" data-id="${item.id}" data-role="${escapeHtml(item.role)}">${item.role === 'organizer' ? 'Set user' : 'Set organizer'}</button><button data-panel-action="deleteUser" data-id="${item.id}">Delete</button>` : ''}</td></tr>`);
    return `${pageHeading('ACCOUNTS', 'Manage users', 'Search accounts and manage access and roles.')}${panel(`<form class="org-filters" data-filter="users"><input name="q" placeholder="Search name or email" value="${escapeHtml(query.q || '')}"><select name="role"><option value="">All roles</option>${['user', 'organizer', 'admin'].map((value) => `<option ${query.role === value ? 'selected' : ''}>${value}</option>`).join('')}</select><select name="status"><option value="">All statuses</option>${['Active', 'Blocked'].map((value) => `<option ${query.status === value ? 'selected' : ''}>${value}</option>`).join('')}</select><button class="org-button org-button-outline">Filter</button></form>${table(['Name', 'Email', 'Role', 'Status', 'Joined', 'Actions'], rows)}`)}`;
  }

  async function bookingsPage() {
    const query = queryFromHash();
    const result = role === 'admin' ? await api.admin.bookings({ ...query, page: 1, limit: 50 }) : await api.organizer.bookings({ ...query, page: 1, limit: 50 });
    const rows = result.items.map((item) => `<tr><td>${escapeHtml(item.ticket_id)}</td><td>${escapeHtml(item.attendee_name)}</td><td>${escapeHtml(item.event_title || item.title)}</td><td>${item.quantity}</td><td>${money(item.total_amount)}</td><td>${status(item.booking_status)}</td><td>${dateText(item.created_at)}</td></tr>`);
    const exportAction = role === 'admin' ? '<button class="org-button org-button-outline" data-export="/admin/bookings/export" data-filename="eventease-bookings.csv">Export CSV</button>' : '<button class="org-button org-button-outline" data-export="/organizer/bookings/export" data-filename="organizer-bookings.csv">Export CSV</button>';
    return `${pageHeading('RESERVATIONS', 'Bookings', 'Booking records from the database.', exportAction)}${panel(`${table(['Ticket ID', 'Attendee', 'Event', 'Tickets', 'Amount', 'Status', 'Booked'], rows)}`)}`;
  }

  async function eventBookingsPage(id) {
    const result = await api.organizer.eventBookings(id, { page: 1, limit: 50 });
    const rows = result.items.map((item) => `<tr><td>${escapeHtml(item.ticket_id)}</td><td>${escapeHtml(item.attendee_name)}</td><td>${escapeHtml(item.attendee_email)}</td><td>${item.quantity}</td><td>${money(item.total_amount)}</td><td>${status(item.booking_status)}</td></tr>`);
    return `${pageHeading('ATTENDEES', 'Event bookings', 'Attendee list for your event.', `<button class="org-button org-button-outline" data-export="/organizer/events/${encodeURIComponent(id)}/bookings/export" data-filename="event-${escapeHtml(id)}-attendees.csv">Export CSV</button>`)}${panel(table(['Ticket ID', 'Attendee', 'Email', 'Tickets', 'Amount', 'Status'], rows))}`;
  }

  async function categoriesPage() {
    const items = await api.admin.categories();
    const rows = items.map((item) => `<tr><td>${escapeHtml(item.category_name)}</td><td>${dateText(item.created_at)}</td><td><button data-panel-action="editCategory" data-id="${item.id}" data-name="${escapeHtml(item.category_name)}">Rename</button><button data-panel-action="deleteCategory" data-id="${item.id}">Delete</button></td></tr>`);
    return `${pageHeading('CATALOG', 'Categories', 'Manage the categories used by event listings.')}${panel(`<form class="org-form-grid" data-panel-form="category"><label class="org-field"><span>New category</span><input name="categoryName" minlength="2" maxlength="30" required></label><button class="org-button org-button-primary" type="submit">Add category</button></form>${table(['Category', 'Created', 'Actions'], rows)}`)}`;
  }

  async function reportsPage() {
    const query = queryFromHash();
    const data = role === 'admin' ? await api.admin.reports(query) : await api.organizer.reports({ eventId: query.eventId });
    const entries = role === 'admin'
      ? [['Bookings', data.bookings], ['Tickets sold', data.tickets_sold], ['Revenue', money(data.revenue)], ['Cancelled', data.cancelled]]
      : [['Tickets sold', data.tickets_sold], ['Revenue', money(data.revenue)], ['Occupancy', `${Number(data.occupancy_rate || 0).toFixed(1)}%`], ['Cancelled bookings', data.cancelled_bookings]];
    const exportAction = role === 'admin' ? '<button class="org-button org-button-outline" data-export="/admin/reports/export" data-filename="eventease-report.csv">Export CSV</button>' : '';
    return `${pageHeading('ANALYTICS', 'Reports', 'Summary values reflect database booking records.', exportAction)}${statCards(entries)}${panel(`<pre class="org-report-data">${escapeHtml(JSON.stringify(role === 'admin' ? data.top_events : data.events, null, 2))}</pre>`)}`;
  }

  async function activityPage() {
    const result = await api.admin.activity({ page: 1, limit: 50 });
    const rows = result.items.map((item) => `<tr><td>${escapeHtml(item.action_type)}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.admin_name || 'Administrator')}</td><td>${dateText(item.created_at)}</td></tr>`);
    return `${pageHeading('AUDIT TRAIL', 'Activity log', 'Recent administrative actions.')}${panel(table(['Action', 'Description', 'Administrator', 'Date'], rows))}`;
  }

  async function notificationsPage() {
    const [data] = await Promise.all([api.notifications.list({ page: 1, limit: 50 })]);
    const rows = data.items.map((item) => `<article class="org-notice"><strong>${item.is_read ? 'Read' : 'New'}</strong><p>${escapeHtml(item.message)}</p><small>${dateText(item.created_at)}</small>${item.is_read ? '' : `<button data-panel-action="markRead" data-id="${item.id}">Mark read</button>`}</article>`).join('');
    return `${pageHeading('UPDATES', 'Notifications', 'Organizer account notifications.', '<button class="org-button org-button-outline" data-panel-action="markAllRead">Mark all read</button>')}${panel(rows || empty('No notifications.'))}`;
  }

  async function profilePage() {
    const profile = await api.auth.me();
    return `${pageHeading('ACCOUNT', 'Profile settings', 'Update your account details and password.')}${panel(`<form class="org-form-grid" data-panel-form="profile"><label class="org-field"><span>Name</span><input name="name" required value="${escapeHtml(profile.name || '')}"></label><label class="org-field"><span>Email</span><input readonly value="${escapeHtml(profile.email || '')}"></label><label class="org-field"><span>Phone</span><input name="phone" value="${escapeHtml(profile.phone || '')}"></label><label class="org-field"><span>Organization</span><input name="organization_name" value="${escapeHtml(profile.organization_name || '')}"></label><label class="org-field org-field-full"><span>Bio</span><textarea name="bio">${escapeHtml(profile.bio || '')}</textarea></label><button class="org-button org-button-primary" type="submit">Save profile</button></form><form class="org-form-grid" data-panel-form="password"><h2 class="org-field-full">Change password</h2><label class="org-field"><span>Current password</span><input name="currentPassword" type="password" autocomplete="current-password" required></label><label class="org-field"><span>New password</span><input name="newPassword" type="password" minlength="8" autocomplete="new-password" required></label><label class="org-field"><span>Confirm password</span><input name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required></label><button class="org-button org-button-outline" type="submit">Change password</button></form>`)}`;
  }

  async function render() {
    document.body.classList.remove('org-menu-open');
    try {
      user = await api.auth.me();
      api.user = user;
      if (user.role !== role) {
        location.replace(user.role === 'admin' ? 'admin.html#/dashboard' : user.role === 'organizer' ? 'organizer.html#/dashboard' : 'dashboard.html');
        return;
      }
      const hash = location.hash.replace(/^#\/?/, '');
      const [routePath = 'dashboard'] = hash.split('?');
      const [route] = routePath.split('/');
      setMain('<p class="org-form-message">Loading…</p>', route);
      let content;
      if (route === 'dashboard') content = await dashboardPage();
      else if (route === 'events') content = await eventsPage();
      else if (route === 'requests' && role === 'admin') content = await requestsPage();
      else if (route === 'users' && role === 'admin') content = await usersPage();
      else if (route === 'bookings') {
        const match = location.hash.match(/^#\/events\/(\d+)\/bookings/);
        content = match ? await eventBookingsPage(match[1]) : await bookingsPage();
      } else if (route === 'categories' && role === 'admin') content = await categoriesPage();
      else if (route === 'reports') content = await reportsPage();
      else if (route === 'activity' && role === 'admin') content = await activityPage();
      else if (route === 'notifications' && role === 'organizer') content = await notificationsPage();
      else if (route === 'profile') content = await profilePage();
      else content = `${pageHeading('NOT FOUND', 'Page not found', 'Choose a section from the navigation.')}`;
      setMain(content, route);
    } catch (error) {
      if (error.status === 401) {
        root.innerHTML = `<main class="org-login ${role}-login"><section class="org-login-panel"><div class="org-login-form-wrap"><span class="org-eyebrow">EVENTEASE · ${role.toUpperCase()}</span><h2>Sign in to continue</h2><form class="org-form-grid" data-panel-form="login"><label class="org-field org-field-full"><span>Email address</span><input type="email" name="email" autocomplete="username" required></label><label class="org-field org-field-full"><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label><button class="org-button org-button-primary org-field-full" type="submit">Sign in</button></form><a class="org-back-link" href="login.html">Use the EventEase login page</a></div></section></main>`;
        bindLayout();
        return;
      }
      alert(error.message);
    }
  }

  window.addEventListener('hashchange', () => { void render(); });
  void render();
});
