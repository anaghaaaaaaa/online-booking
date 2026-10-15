(() => {
  const KEYS = {
    events: 'eventease.organizer.events',
    bookings: 'eventease.organizer.bookings',
    users: 'eventease.organizer.users',
    session: 'eventease.organizer.session',
    notifications: 'eventease.organizer.notifications',
    profile: 'eventease.organizer.profile',
    profiles: 'eventease.organizer.profiles',
    requests: 'eventease.organizer.requests'
  };
  const DEMO = { id: 'organizer-demo', email: 'organizer@eventease.com', password: 'Organizer@123', role: 'organizer', name: 'Avery Morgan' };
  const CATEGORIES = ['Music', 'Business', 'Art', 'Sports', 'Food', 'Technology', 'Workshop', 'Community'];
  const root = document.getElementById('organizerRoot');
  const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
  const dateText = (value) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`)) : 'Not set';
  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const today = new Date();
  const dateIn = (days) => { const date = new Date(today); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };

  function seed() {
    const users = read(KEYS.users, []);
    if (!users.some((user) => user.email === DEMO.email)) users.push(DEMO);
    write(KEYS.users, users);
    if (!localStorage.getItem(KEYS.events)) {
      write(KEYS.events, [
        { id: 'event-ai-summit', organizerId: DEMO.id, title: 'Future of AI Summit', category: 'Business', description: 'A practical gathering for people building the next generation of intelligent products and services.', date: dateIn(32), time: '09:30', venue: 'Innovation Hall', city: 'Bengaluru', price: 1499, capacity: 120, seatsLeft: 118, image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=900&q=80', status: 'Approved', createdAt: new Date().toISOString() },
        { id: 'event-neon-nights', organizerId: DEMO.id, title: 'Neon Nights Live', category: 'Music', description: 'An open-air evening of local artists, live electronic music, and late-night food stalls.', date: dateIn(44), time: '19:00', venue: 'Riverside Grounds', city: 'Hyderabad', price: 2999, capacity: 240, seatsLeft: 236, image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80', status: 'Approved', createdAt: new Date().toISOString() },
        { id: 'event-design-lab', organizerId: DEMO.id, title: 'Creative Design Bootcamp', category: 'Workshop', description: 'A hands-on day for designers to sharpen their visual thinking and prototype useful ideas.', date: dateIn(52), time: '10:00', venue: 'Studio North', city: 'Pune', price: 899, capacity: 80, seatsLeft: 80, image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=80', status: 'Pending', createdAt: new Date().toISOString() }
      ]);
    }
    if (!localStorage.getItem(KEYS.bookings)) {
      write(KEYS.bookings, [
        { id: 'BK-24891', ticketId: 'ET-529184', eventId: 'event-ai-summit', attendeeId: 'attendee-priya', attendee: 'Priya Sharma', email: 'priya@example.com', tickets: 2, amount: 2998, status: 'Confirmed', bookedAt: new Date().toISOString(), cancelledAt: '' },
        { id: 'BK-24875', ticketId: 'ET-529022', eventId: 'event-neon-nights', attendeeId: 'attendee-rahul', attendee: 'Rahul Nair', email: 'rahul@example.com', tickets: 4, amount: 11996, status: 'Confirmed', bookedAt: new Date(Date.now() - 86400000).toISOString(), cancelledAt: '' },
        { id: 'BK-24811', ticketId: 'ET-528410', eventId: 'event-neon-nights', attendeeId: 'attendee-sana', attendee: 'Sana Iyer', email: 'sana@example.com', tickets: 2, amount: 5998, status: 'Cancelled', bookedAt: new Date(Date.now() - 172800000).toISOString(), cancelledAt: new Date(Date.now() - 86400000).toISOString() }
      ]);
    }
    if (!localStorage.getItem(KEYS.notifications)) write(KEYS.notifications, []);
    const profiles = read(KEYS.profiles, {});
    profiles[DEMO.id] ||= read(KEYS.profile, { name: DEMO.name, phone: '', organization: 'EventEase Studio', bio: '', email: DEMO.email, password: DEMO.password });
    write(KEYS.profiles, profiles);
    if (!localStorage.getItem(KEYS.profile)) write(KEYS.profile, profiles[DEMO.id]);
  }

  const getSession = () => read(KEYS.session, null);
  const setSession = (session) => write(KEYS.session, session);
  const getProfile = (id = getSession()?.id) => read(KEYS.profiles, {})[id] || read(KEYS.profile, DEMO);
  const getOwnEvents = () => {
    const session = getSession();
    return read(KEYS.events, []).filter((event) => session?.role === 'organizer' && event.organizerId === session.id);
  };
  const getOwnedEvent = (id) => getOwnEvents().find((event) => event.id === id);
  const bookingsFor = (eventId) => read(KEYS.bookings, []).filter((booking) => booking.eventId === eventId);
  const confirmedFor = (eventId) => bookingsFor(eventId).filter((booking) => booking.status === 'Confirmed');
  const soldFor = (eventId) => confirmedFor(eventId).reduce((sum, booking) => sum + Number(booking.tickets), 0);
  const ownedBookings = () => {
    const eventIds = new Set(getOwnEvents().map((event) => event.id));
    return read(KEYS.bookings, []).filter((booking) => eventIds.has(booking.eventId));
  };
  const notify = (message) => {
    const notifications = read(KEYS.notifications, []);
    notifications.unshift({ id: crypto.randomUUID(), organizerId: getSession()?.id, message, createdAt: new Date().toISOString(), read: false });
    write(KEYS.notifications, notifications.slice(0, 50));
  };

  function createEvent(data) {
    const session = getSession();
    if (session?.role !== 'organizer') return { ok: false, error: 'Organizer access is required.' };
    const event = { ...data, id: crypto.randomUUID(), organizerId: session.id, status: 'Pending', rejectionReason: '', createdAt: new Date().toISOString(), seatsLeft: Number(data.capacity) };
    const events = read(KEYS.events, []);
    events.push(event);
    write(KEYS.events, events);
    notify(`“${event.title}” was submitted for admin approval.`);
    return { ok: true, event };
  }

  function updateEvent(id, patch) {
    patch = Object.fromEntries(Object.entries(patch).filter(([key]) => ['title', 'category', 'description', 'date', 'time', 'venue', 'city', 'price', 'capacity', 'image'].includes(key)));
    const event = getOwnedEvent(id);
    if (!event) return { ok: false, error: 'This event is not available in your organizer account.' };
    const sold = soldFor(id);
    const past = new Date(`${event.date}T${event.time || '00:00'}`) < new Date();
    if (event.status === 'Cancelled' || event.status === 'Completed' || past) return { ok: false, error: 'Cancelled or past events are read-only.' };
    const critical = ['title', 'date', 'price', 'capacity'];
    const changes = critical.some((key) => patch[key] !== undefined && String(patch[key]) !== String(event[key]));
    if (event.status === 'Approved' && sold > 0) {
      if (patch.title !== undefined || patch.category !== undefined || patch.date !== undefined || patch.time !== undefined || patch.price !== undefined || patch.city !== undefined) return { ok: false, error: 'With confirmed bookings, title, category, date, time, price, and city are locked.' };
      if (patch.capacity !== undefined && Number(patch.capacity) < sold) return { ok: false, error: `Capacity cannot be below ${sold} tickets already sold.` };
      if (patch.capacity !== undefined && Number(patch.capacity) < Number(event.capacity)) return { ok: false, error: 'Capacity can only be increased after an approved event receives bookings.' };
    }
    const events = read(KEYS.events, []);
    const index = events.findIndex((item) => item.id === id && item.organizerId === getSession()?.id);
    if (index < 0) return { ok: false, error: 'This event is not available in your organizer account.' };
    const next = { ...events[index], ...patch, seatsLeft: Number(patch.capacity ?? event.capacity) - sold };
    if (event.status === 'Rejected') { next.status = 'Pending'; next.rejectionReason = ''; }
    else if (event.status === 'Approved' && sold === 0 && changes) next.status = 'Pending';
    events[index] = next;
    write(KEYS.events, events);
    if (next.status === 'Pending' && event.status !== 'Pending') notify(`“${next.title}” was resubmitted for approval.`);
    return { ok: true, event: next };
  }

  function deleteEvent(id) {
    const event = getOwnedEvent(id);
    if (!event) return { ok: false, error: 'This event is not available in your organizer account.' };
    if (confirmedFor(id).length) return { ok: false, error: 'This event has confirmed bookings. Cancel it instead of deleting it.' };
    write(KEYS.events, read(KEYS.events, []).filter((item) => item.id !== id || item.organizerId !== getSession()?.id));
    return { ok: true };
  }

  function cancelEvent(id) {
    const event = getOwnedEvent(id);
    if (!event) return { ok: false, error: 'This event is not available in your organizer account.' };
    const events = read(KEYS.events, []);
    const index = events.findIndex((item) => item.id === id && item.organizerId === getSession()?.id);
    events[index] = { ...events[index], status: 'Cancelled', seatsLeft: Number(events[index].capacity) };
    write(KEYS.events, events);
    const bookings = read(KEYS.bookings, []);
    let cancelled = 0;
    bookings.forEach((booking) => {
      if (booking.eventId === id && booking.status === 'Confirmed') {
        booking.status = 'Cancelled';
        booking.cancelledAt = new Date().toISOString();
        cancelled += 1;
        notify(`Event “${event.title}” was cancelled. Booking ${booking.id} has been cancelled.`);
      }
    });
    write(KEYS.bookings, bookings);
    if (!cancelled) notify(`Event “${event.title}” was cancelled.`);
    return { ok: true };
  }

  function layout(content, active) {
    const session = getSession();
    const events = getOwnEvents();
    const pending = events.filter((event) => event.status === 'Pending').length;
    const profile = getProfile(session.id);
    const links = [
      ['dashboard', 'Dashboard', '◫'], ['events', 'My Events', '▦'], ['new', 'Create Event', '+'],
      ['bookings', 'Bookings', '▤'], ['reports', 'Reports', '▥'], ['profile', 'Profile', '◉']
    ];
    return `<div class="org-shell">
      <aside class="org-sidebar" id="orgSidebar">
        <a class="org-brand" href="#/dashboard"><span class="org-logo">E</span><span>EventEase<span class="org-brand-sub">ORGANIZER STUDIO</span></span></a>
        <nav class="org-nav" aria-label="Organizer navigation">${links.map(([route, label, icon]) => `<a class="org-nav-link ${active === route ? 'is-active' : ''}" href="#/${route === 'new' ? 'events/new' : route}"><span class="org-nav-icon" aria-hidden="true">${icon}</span><span>${label}</span>${route === 'events' && pending ? `<span class="org-nav-count">${pending}</span>` : ''}</a>`).join('')}</nav>
        <div class="org-sidebar-bottom"><div class="org-avatar">${escapeHtml((profile.name || session.name).slice(0, 1).toUpperCase())}</div><div class="org-person"><strong>${escapeHtml(profile.name || session.name)}</strong><span>Event organizer</span></div><button class="org-logout" data-action="logout" title="Log out" aria-label="Log out">↗</button></div>
      </aside>
      <div class="org-main-column"><header class="org-topbar"><button class="org-menu-toggle" data-action="menu" aria-label="Open navigation">☰</button><div><span class="org-topbar-kicker">ORGANIZER WORKSPACE</span><strong>${escapeHtml(profile.organization || 'Your organization')}</strong></div><div class="org-topbar-right"><span class="org-date">${new Intl.DateTimeFormat('en-IN', { dateStyle: 'full' }).format(today)}</span><button class="org-icon-button" data-action="notifications" aria-label="Notifications">♧<i class="notification-dot"></i></button></div></header><main class="org-content" id="orgContent">${content}</main></div>
      <div class="org-backdrop" data-action="menu-close"></div>
    </div>`;
  }

  const statusBadge = (status) => `<span class="org-status org-status-${String(status).toLowerCase()}">${escapeHtml(status)}</span>`;
  const heading = (eyebrow, title, subtitle, action = '') => `<div class="org-page-heading"><div><span class="org-eyebrow">${eyebrow}</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
  const emptyState = (title, text, action = '') => `<div class="org-empty"><span class="org-empty-mark">+</span><h3>${title}</h3><p>${text}</p>${action}</div>`;

  function dashboard() {
    const events = getOwnEvents();
    const bookings = ownedBookings();
    const confirmed = bookings.filter((item) => item.status === 'Confirmed');
    const cancelled = bookings.filter((item) => item.status === 'Cancelled');
    const sold = confirmed.reduce((sum, item) => sum + Number(item.tickets), 0);
    const capacity = events.reduce((sum, item) => sum + Number(item.capacity), 0);
    const revenue = confirmed.reduce((sum, item) => sum + Number(item.amount), 0);
    const count = (status) => events.filter((event) => event.status === status).length;
    const upcoming = events.filter((event) => event.date >= dateIn(0) && event.status !== 'Cancelled').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
    const recent = [...bookings].sort((a, b) => b.bookedAt.localeCompare(a.bookedAt)).slice(0, 5);
    const rejected = events.filter((event) => event.status === 'Rejected');
    const stats = [['Total events', events.length, 'Across all statuses', '◫'], ['Total bookings', bookings.length, `${cancelled.length} cancelled`, '▤'], ['Tickets sold', sold, 'Confirmed registrations', '▣'], ['Available seats', Math.max(0, capacity - sold), 'Across your events', '◷'], ['Total revenue', money(revenue), 'Confirmed bookings only', '₹'], ['Pending approval', count('Pending'), 'Awaiting review', '◌']];
    const eventRows = upcoming.map((event) => {
      const eventSold = soldFor(event.id);
      const percent = event.capacity ? Math.min(100, Math.round(eventSold / event.capacity * 100)) : 0;
      return `<div class="org-upcoming-row"><div class="org-event-thumb">${event.image ? `<img src="${escapeHtml(event.image)}" alt="" loading="lazy">` : 'E'}</div><div class="org-upcoming-info"><strong>${escapeHtml(event.title)}</strong><span>${dateText(event.date)} · ${escapeHtml(event.city)}</span><div class="org-progress"><i style="width:${percent}%"></i></div><small>${eventSold} / ${event.capacity} seats sold</small></div><div>${statusBadge(event.status)}</div></div>`;
    }).join('');
    const bookingRows = recent.map((booking) => {
      const event = events.find((item) => item.id === booking.eventId);
      return `<tr><td><strong>${escapeHtml(booking.attendee)}</strong><small>${escapeHtml(booking.email)}</small></td><td>${escapeHtml(event?.title || 'Event')}</td><td>${booking.tickets}</td><td>${money(booking.amount)}</td><td>${statusBadge(booking.status)}</td></tr>`;
    }).join('');
    const noticeList = rejected.map((event) => `<div class="org-notice"><strong>${escapeHtml(event.title)} was not approved</strong><p>${escapeHtml(event.rejectionReason || 'Review the event details and resubmit for approval.')}</p><a href="#/events/${encodeURIComponent(event.id)}/edit">Edit and resubmit →</a></div>`).join('');
    return `${heading('OVERVIEW', `Welcome back, ${escapeHtml(getProfile().name || DEMO.name)}`, 'Here is what is happening across your events.', '<a class="org-button org-button-primary" href="#/events/new">＋ Create event</a>')}
      ${noticeList ? `<div class="org-notice-list">${noticeList}</div>` : ''}
      <section class="org-stat-grid">${stats.map(([label, value, note, icon]) => `<article class="org-stat-card"><div class="org-stat-top"><span>${label}</span><b>${icon}</b></div><strong>${value}</strong><small>${note}</small></article>`).join('')}</section>
      <div class="org-content-grid org-dashboard-grid"><section class="org-panel"><div class="org-panel-heading"><div><span class="org-eyebrow">YOUR CALENDAR</span><h2>Upcoming events</h2></div><a href="#/events">All events →</a></div>${eventRows || emptyState('Nothing on the calendar yet', 'Create an event to start building your schedule.', '<a class="org-button org-button-outline" href="#/events/new">Create an event</a>')}</section>
      <section class="org-panel"><div class="org-panel-heading"><div><span class="org-eyebrow">APPROVAL STATUS</span><h2>Event overview</h2></div></div><div class="org-status-breakdown"><div>${statusBadge('Approved')}<strong>${count('Approved')}</strong></div><div>${statusBadge('Pending')}<strong>${count('Pending')}</strong></div><div>${statusBadge('Rejected')}<strong>${count('Rejected')}</strong></div></div><div class="org-quick-actions"><a href="#/events/new">＋ Create event</a><a href="#/bookings">View bookings →</a></div></section></div>
      <section class="org-panel org-recent-panel"><div class="org-panel-heading"><div><span class="org-eyebrow">LATEST ACTIVITY</span><h2>Recent bookings</h2></div><a href="#/bookings">All bookings →</a></div>${recent.length ? `<div class="org-table-scroll"><table class="org-table"><thead><tr><th>Attendee</th><th>Event</th><th>Tickets</th><th>Amount</th><th>Status</th></tr></thead><tbody>${bookingRows}</tbody></table></div>` : emptyState('No bookings yet', 'Bookings will appear here when guests reserve tickets.')}</section>`;
  }

  function eventTable() {
    const events = getOwnEvents();
    const query = new URLSearchParams(location.hash.split('?')[1] || '').get('q')?.toLowerCase() || '';
    const status = new URLSearchParams(location.hash.split('?')[1] || '').get('status') || '';
    const category = new URLSearchParams(location.hash.split('?')[1] || '').get('category') || '';
    const filtered = events.filter((event) => event.title.toLowerCase().includes(query) && (!status || event.status === status) && (!category || event.category === category)).sort((a, b) => a.date.localeCompare(b.date));
    const rows = filtered.map((event) => {
      const sold = soldFor(event.id);
      return `<tr><td><div class="org-table-event"><div class="org-event-thumb">${event.image ? `<img src="${escapeHtml(event.image)}" alt="" loading="lazy">` : 'E'}</div><strong>${escapeHtml(event.title)}</strong></div></td><td>${escapeHtml(event.category)}</td><td>${dateText(event.date)}</td><td>${escapeHtml(event.venue)}, ${escapeHtml(event.city)}</td><td>${money(event.price)}</td><td>${sold} / ${event.capacity}</td><td>${statusBadge(event.status)}</td><td><div class="org-row-actions"><a href="#/events/${encodeURIComponent(event.id)}/bookings" aria-label="View bookings" title="View bookings">▤</a><a href="#/events/${encodeURIComponent(event.id)}/edit" aria-label="Edit event" title="Edit event">✎</a><button data-action="delete" data-id="${escapeHtml(event.id)}" aria-label="Delete event" title="Delete event">⌫</button></div></td></tr>`;
    }).join('');
    const cards = filtered.map((event) => `<article class="org-event-mobile"><div class="org-event-mobile-top"><div class="org-event-thumb">${event.image ? `<img src="${escapeHtml(event.image)}" alt="" loading="lazy">` : 'E'}</div><div><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.category)} · ${dateText(event.date)}</span></div>${statusBadge(event.status)}</div><p>${escapeHtml(event.venue)}, ${escapeHtml(event.city)} · ${money(event.price)} · ${soldFor(event.id)} / ${event.capacity}</p><div class="org-row-actions"><a href="#/events/${encodeURIComponent(event.id)}/bookings">Bookings</a><a href="#/events/${encodeURIComponent(event.id)}/edit">Edit</a><button data-action="delete" data-id="${escapeHtml(event.id)}">Delete</button></div>${event.status === 'Rejected' ? `<p class="org-error-copy">${escapeHtml(event.rejectionReason || 'Review and resubmit this event.')}</p>` : ''}</article>`).join('');
    return `${heading('YOUR CATALOG', 'My events', 'Review approvals, availability, and event details.', '<a class="org-button org-button-primary" href="#/events/new">＋ Create event</a>')}
      <section class="org-panel"><form class="org-filters" id="eventFilters"><label class="org-search"><span>⌕</span><input type="search" name="q" placeholder="Search events" value="${escapeHtml(query)}"></label><select name="status" aria-label="Filter by status"><option value="">All statuses</option>${['Pending', 'Approved', 'Rejected', 'Cancelled', 'Completed'].map((item) => `<option ${status === item ? 'selected' : ''}>${item}</option>`).join('')}</select><select name="category" aria-label="Filter by category"><option value="">All categories</option>${CATEGORIES.map((item) => `<option ${category === item ? 'selected' : ''}>${item}</option>`).join('')}</select><button class="org-button org-button-outline">Filter</button></form>
      ${filtered.length ? `<div class="org-table-scroll desktop-only"><table class="org-table"><thead><tr><th>Event</th><th>Category</th><th>Date</th><th>Venue</th><th>Price</th><th>Booked / capacity</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div><div class="mobile-only org-mobile-list">${cards}</div>` : emptyState(events.length ? 'No matching events' : 'Your event list is empty', events.length ? 'Try a different search or filter.' : 'Create your first event and submit it for approval.', '<a class="org-button org-button-primary" href="#/events/new">Create an event</a>')}</section>`;
  }

  function eventForm(id = '') {
    const event = id ? getOwnedEvent(id) : null;
    if (id && !event) return `${heading('EVENT EDITOR', 'Event unavailable', 'This event does not belong to your organizer account or no longer exists.')}${emptyState('You cannot edit this event', 'Return to your own events to continue.', '<a class="org-button org-button-outline" href="#/events">My events</a>')}`;
    const sold = event ? soldFor(event.id) : 0;
    const past = event && new Date(`${event.date}T${event.time || '00:00'}`) < new Date();
    const locked = Boolean(event && (event.status === 'Cancelled' || event.status === 'Completed' || past));
    const restricted = Boolean(event && event.status === 'Approved' && sold > 0);
    const approvalEdit = Boolean(event && event.status === 'Approved' && sold === 0);
    const disabled = (field) => locked || (restricted && ['title', 'category', 'date', 'time', 'price', 'city'].includes(field));
    const action = event ? 'Update event' : 'Submit for approval';
    const fields = [
      ['title', 'Event title', 'text', event?.title || '', 'e.g. City Makers Conference'],
      ['category', 'Category', 'select', event?.category || '', ''],
      ['date', 'Event date', 'date', event?.date || '', ''],
      ['time', 'Start time', 'time', event?.time || '', ''],
      ['venue', 'Venue', 'text', event?.venue || '', 'Venue or location name'],
      ['city', 'City', 'text', event?.city || '', 'City'],
      ['price', 'Ticket price (₹)', 'number', event?.price ?? '', '0 for free entry'],
      ['capacity', 'Seat capacity', 'number', event?.capacity ?? '', 'Maximum 100,000'],
      ['image', 'Banner image URL', 'url', event?.image || '', 'https://example.com/event.jpg']
    ];
    const formFields = fields.map(([name, label, type, value, placeholder]) => `<label class="org-field"><span>${label}</span>${type === 'select' ? `<select name="${name}" required ${disabled(name) ? 'disabled' : ''}><option value="">Choose a category</option>${CATEGORIES.map((category) => `<option value="${category}" ${category === value ? 'selected' : ''}>${category}</option>`).join('')}</select>` : `<input name="${name}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${type === 'number' && name === 'price' ? 'min="0" step="1"' : ''} ${type === 'number' && name === 'capacity' ? `min="${Math.max(1, sold)}" max="100000" step="1"` : ''} ${disabled(name) ? 'disabled' : ''} required>`}</label>`).join('');
    let rule = '';
    if (locked) rule = '<div class="org-info-callout">This event is cancelled or has passed, so it is read-only.</div>';
    else if (restricted) rule = `<div class="org-info-callout">This approved event has ${sold} confirmed tickets. Title, category, date, time, price, and city are locked. You may update the description, image, venue, or increase capacity (minimum ${sold}).</div>`;
    else if (approvalEdit) rule = '<div class="org-info-callout">Changes to an approved event without bookings will send it back to Pending approval.</div>';
    else if (event?.status === 'Rejected') rule = `<div class="org-error-callout">Rejected: ${escapeHtml(event.rejectionReason || 'Please revise the details and resubmit.')}</div>`;
    return `${heading(event ? 'EVENT EDITOR' : 'NEW LISTING', event ? 'Edit event' : 'Create an event', event ? 'Make changes to your event details.' : 'Add the details guests need to plan and book.')}
      <form class="org-panel org-event-form" id="eventForm" data-id="${escapeHtml(id)}"><div class="org-form-grid">${formFields}<label class="org-field org-field-full"><span>Description</span><textarea name="description" minlength="30" rows="6" placeholder="Describe the experience, who it is for, and what attendees can expect." required ${locked ? 'disabled' : ''}>${escapeHtml(event?.description || '')}</textarea><small>At least 30 characters.</small></label><div class="org-field org-field-full"><span>Banner preview</span><div class="org-image-preview" id="imagePreview">${event?.image ? `<img src="${escapeHtml(event.image)}" alt="Event banner preview">` : '<span>Image preview will appear here</span>'}</div></div></div>${rule}<div class="org-form-footer"><a class="org-button org-button-outline" href="#/events">Cancel</a><button class="org-button org-button-primary" type="submit" ${locked ? 'disabled' : ''}>${action}</button></div></form>`;
  }

  function bookingTable(eventId = '') {
    const events = getOwnEvents();
    const event = eventId ? getOwnedEvent(eventId) : null;
    if (eventId && !event) return `${heading('REGISTRATIONS', 'Event unavailable', 'This event does not belong to your organizer account.')}${emptyState('No access to this event', 'Return to your event list.', '<a class="org-button org-button-outline" href="#/events">My events</a>')}`;
    const all = eventId ? bookingsFor(eventId) : ownedBookings();
    const hashQuery = new URLSearchParams(location.hash.split('?')[1] || '');
    const query = (hashQuery.get('q') || '').toLowerCase();
    const status = hashQuery.get('status') || '';
    const from = hashQuery.get('from') || '';
    const to = hashQuery.get('to') || '';
    const filtered = all.filter((booking) => {
      const bookedDate = booking.bookedAt.slice(0, 10);
      return `${booking.attendee} ${booking.email} ${booking.id}`.toLowerCase().includes(query) && (!status || booking.status === status) && (!from || bookedDate >= from) && (!to || bookedDate <= to);
    });
    const sold = all.filter((booking) => booking.status === 'Confirmed').reduce((sum, booking) => sum + Number(booking.tickets), 0);
    const revenue = all.filter((booking) => booking.status === 'Confirmed').reduce((sum, booking) => sum + Number(booking.amount), 0);
    const rows = filtered.map((booking) => {
      const related = events.find((item) => item.id === booking.eventId);
      return `<tr><td><strong>${escapeHtml(booking.id)}</strong><small>${escapeHtml(booking.ticketId || '—')}</small></td><td>${escapeHtml(booking.attendee)}<small>${escapeHtml(booking.email)}</small></td>${eventId ? '' : `<td>${escapeHtml(related?.title || 'Event')}</td>`}<td>${booking.tickets}</td><td>${money(booking.amount)}</td><td>${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(booking.bookedAt))}</td><td>${booking.cancelledAt ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(booking.cancelledAt)) : '—'}</td><td>${statusBadge(booking.status)}</td></tr>`;
    }).join('');
    const action = `<button class="org-button org-button-outline" data-action="csv" data-event="${escapeHtml(eventId)}">↓ Export CSV</button>`;
    return `${heading(eventId ? 'EVENT REGISTRATIONS' : 'REGISTRATION LOG', eventId ? escapeHtml(event.title) : 'All bookings', eventId ? 'Attendees and ticket status for this event.' : 'Bookings for events owned by your organizer account.', action)}
      ${event ? `<section class="org-panel org-event-summary"><div><span>EVENT DATE</span><strong>${dateText(event.date)} · ${escapeHtml(event.venue)}, ${escapeHtml(event.city)}</strong></div><div><span>CAPACITY</span><strong>${event.capacity}</strong></div><div><span>TICKETS SOLD</span><strong>${sold}</strong></div><div><span>SEATS LEFT</span><strong>${Math.max(0, event.capacity - sold)}</strong></div><div><span>REVENUE</span><strong>${money(revenue)}</strong></div></section>` : `<section class="org-booking-stats"><div><span>Total bookings</span><strong>${all.length}</strong></div><div><span>Confirmed</span><strong>${all.filter((booking) => booking.status === 'Confirmed').length}</strong></div><div><span>Cancelled</span><strong>${all.filter((booking) => booking.status === 'Cancelled').length}</strong></div><div><span>Confirmed revenue</span><strong>${money(revenue)}</strong></div></section>`}
      <section class="org-panel"><form class="org-filters" id="bookingFilters"><label class="org-search"><span>⌕</span><input type="search" name="q" placeholder="Search attendee or booking ID" value="${escapeHtml(query)}"></label>${eventId ? '' : `<select name="event"><option value="">All events</option>${events.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join('')}</select>`}<select name="status"><option value="">All statuses</option><option ${status === 'Confirmed' ? 'selected' : ''}>Confirmed</option><option ${status === 'Cancelled' ? 'selected' : ''}>Cancelled</option></select><button class="org-button org-button-outline">Filter</button></form>
      ${filtered.length ? `<div class="org-table-scroll"><table class="org-table"><thead><tr><th>Booking / ticket ID</th><th>Attendee</th>${eventId ? '' : '<th>Event</th>'}<th>Tickets</th><th>Amount</th><th>Booking date</th><th>Cancelled</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState('No registrations match', all.length ? 'Adjust your search or status filter.' : 'Registrations will appear here as guests book tickets.')}</section>`;
  }

  function reports() {
    const events = getOwnEvents();
    const bookings = ownedBookings();
    const selectedId = new URLSearchParams(location.hash.split('?')[1] || '').get('event') || '';
    const selected = events.find((event) => event.id === selectedId) || null;
    const scopeEvents = selected ? [selected] : events;
    const scopeIds = new Set(scopeEvents.map((event) => event.id));
    const scopeBookings = bookings.filter((booking) => scopeIds.has(booking.eventId));
    const confirmed = scopeBookings.filter((booking) => booking.status === 'Confirmed');
    const cancelled = scopeBookings.filter((booking) => booking.status === 'Cancelled');
    const sold = confirmed.reduce((sum, booking) => sum + Number(booking.tickets), 0);
    const capacity = scopeEvents.reduce((sum, event) => sum + Number(event.capacity), 0);
    const revenue = confirmed.reduce((sum, booking) => sum + Number(booking.amount), 0);
    const occupancy = capacity ? Math.round(sold / capacity * 100) : 0;
    const cancelRate = scopeBookings.length ? Math.round(cancelled.length / scopeBookings.length * 100) : 0;
    const bars = events.map((event) => {
      const eventSold = soldFor(event.id);
      const eventRevenue = confirmedFor(event.id).reduce((sum, booking) => sum + Number(booking.amount), 0);
      const eventBookings = confirmedFor(event.id).length;
      const max = Math.max(1, ...events.map((item) => confirmedFor(item.id).length));
      return `<div class="org-chart-row"><div><strong>${escapeHtml(event.title)}</strong><span>${eventBookings} bookings · ${eventSold} tickets · ${money(eventRevenue)}</span></div><div class="org-chart-track"><i style="width:${Math.round(eventBookings / max * 100)}%"></i></div></div>`;
    }).join('');
    const selectedSold = selected ? soldFor(selected.id) : sold;
    const selectedCapacity = selected ? Number(selected.capacity) : capacity;
    const selectedPct = selectedCapacity ? Math.min(100, Math.round(selectedSold / selectedCapacity * 100)) : 0;
    const rows = events.map((event) => {
      const list = bookingsFor(event.id);
      const eventSold = list.filter((booking) => booking.status === 'Confirmed').reduce((sum, booking) => sum + Number(booking.tickets), 0);
      const eventCancelled = list.filter((booking) => booking.status === 'Cancelled').length;
      const eventRevenue = list.filter((booking) => booking.status === 'Confirmed').reduce((sum, booking) => sum + Number(booking.amount), 0);
      return `<tr><td>${escapeHtml(event.title)}</td><td>${event.capacity}</td><td>${eventSold}</td><td>${eventCancelled}</td><td>${money(eventRevenue)}</td><td>${event.capacity ? Math.round(eventSold / event.capacity * 100) : 0}%</td></tr>`;
    }).join('');
    return `${heading('PERFORMANCE', 'Event reports', 'A clear view of ticket sales, revenue, and capacity.')}
      <section class="org-report-toolbar"><label for="reportEvent">Event</label><select id="reportEvent"><option value="">All my events</option>${events.map((event) => `<option value="${escapeHtml(event.id)}" ${selected?.id === event.id ? 'selected' : ''}>${escapeHtml(event.title)}</option>`).join('')}</select><button class="org-button org-button-outline" data-action="print">⎙ Print report</button></section>
      <section class="org-stat-grid org-report-stats"><article class="org-stat-card"><div class="org-stat-top"><span>Tickets sold</span><b>▣</b></div><strong>${sold}</strong><small>Confirmed bookings</small></article><article class="org-stat-card"><div class="org-stat-top"><span>Revenue</span><b>₹</b></div><strong>${money(revenue)}</strong><small>Confirmed bookings only</small></article><article class="org-stat-card"><div class="org-stat-top"><span>Occupancy</span><b>◷</b></div><strong>${occupancy}%</strong><small>${sold} of ${capacity} seats</small></article><article class="org-stat-card"><div class="org-stat-top"><span>Cancellation rate</span><b>↶</b></div><strong>${cancelRate}%</strong><small>${cancelled.length} cancelled bookings</small></article></section>
      <div class="org-content-grid"><section class="org-panel"><div class="org-panel-heading"><div><span class="org-eyebrow">BOOKINGS PER EVENT</span><h2>Confirmed bookings</h2></div></div>${bars || emptyState('No report data yet', 'Create events to see performance here.')}</section><section class="org-panel"><div class="org-panel-heading"><div><span class="org-eyebrow">CAPACITY</span><h2>${selected ? escapeHtml(selected.title) : 'Tickets sold vs available'}</h2></div></div><div class="org-capacity-chart"><div class="org-donut" style="--pct:${selectedPct}%"><div><strong>${selectedPct}%</strong><span>occupied</span></div></div><div class="org-capacity-legend"><span><i></i>Sold <strong>${selectedSold}</strong></span><span><i></i>Available <strong>${Math.max(0, selectedCapacity - selectedSold)}</strong></span></div></div></section></div>
      <section class="org-panel"><div class="org-panel-heading"><div><span class="org-eyebrow">EVENT BREAKDOWN</span><h2>Per-event summary</h2></div></div>${rows ? `<div class="org-table-scroll"><table class="org-table"><thead><tr><th>Event</th><th>Capacity</th><th>Sold</th><th>Cancelled bookings</th><th>Revenue</th><th>Occupancy</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState('Nothing to report yet', 'Create an event to start tracking results.')}</section>`;
  }

  function profile() {
    const data = getProfile();
    return `${heading('ACCOUNT', 'Organizer profile', 'Keep your organizer details and account credentials current.')}
      <div class="org-profile-grid"><section class="org-panel"><div class="org-panel-heading"><div><span class="org-eyebrow">PUBLIC DETAILS</span><h2>Organization profile</h2></div></div><form class="org-form-grid" id="profileForm"><label class="org-field"><span>Full name</span><input name="name" required value="${escapeHtml(data.name)}"></label><label class="org-field"><span>Email address</span><input type="email" value="${escapeHtml(data.email)}" disabled><small>Email is read-only.</small></label><label class="org-field"><span>Phone number</span><input name="phone" type="tel" value="${escapeHtml(data.phone)}" placeholder="+91 98765 43210"></label><label class="org-field"><span>Organization name</span><input name="organization" required value="${escapeHtml(data.organization)}"></label><label class="org-field org-field-full"><span>Short bio</span><textarea name="bio" rows="5" maxlength="300" placeholder="What kinds of events do you organize?">${escapeHtml(data.bio)}</textarea></label><div class="org-form-footer org-field-full"><button class="org-button org-button-primary">Save profile</button></div></form></section>
      <section class="org-panel"><div class="org-panel-heading"><div><span class="org-eyebrow">SECURITY</span><h2>Change password</h2></div></div><form class="org-form-grid" id="passwordForm"><label class="org-field org-field-full"><span>Current password</span><input type="password" name="currentPassword" required autocomplete="current-password"></label><label class="org-field org-field-full"><span>New password</span><input type="password" name="newPassword" minlength="8" required autocomplete="new-password"><small>Use at least 8 characters.</small></label><label class="org-field org-field-full"><span>Confirm new password</span><input type="password" name="confirmPassword" minlength="8" required autocomplete="new-password"></label><div class="org-form-footer org-field-full"><button class="org-button org-button-primary">Update password</button></div></form></section></div>`;
  }

  function notifications() {
    const items = read(KEYS.notifications, []).filter((item) => !item.organizerId || item.organizerId === getSession()?.id);
    const content = items.map((item) => `<article class="org-notification ${item.read ? '' : 'is-unread'}"><span class="org-notification-mark">${item.read ? '✓' : '•'}</span><div><strong>${escapeHtml(item.message)}</strong><small>${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</small></div></article>`).join('');
    return `${heading('UPDATES', 'Notifications', 'Approval, booking, and cancellation activity.')}${items.length ? `<div class="org-notification-list">${content}</div>` : emptyState('You are all caught up', 'Notifications will show here when something changes.')}`;
  }

  function render() {
    seed();
    const session = getSession();
    if (!session || session.role !== 'organizer') {
      root.innerHTML = `<main class="org-login"><div class="org-login-art"><span class="org-eyebrow">EVENTEASE · ORGANIZER STUDIO</span><h1>Make room for the moments people remember.</h1><p>One calm workspace for your event calendar, registrations, and performance.</p><div class="org-login-decor"><span>EVENTS<br><strong>01—∞</strong></span><i></i><span>CREATED<br><strong>BY YOU</strong></span></div></div><section class="org-login-panel"><a class="org-brand org-brand-login" href="index.html"><span class="org-logo">E</span><span>EventEase<span class="org-brand-sub">ORGANIZER STUDIO</span></span></a><div class="org-login-form-wrap"><span class="org-eyebrow">WELCOME BACK</span><h2>Sign in to your studio</h2><p>Manage your events and stay close to every booking.</p><form id="orgLoginForm" class="org-form-grid"><label class="org-field org-field-full"><span>Email address</span><input type="email" name="email" autocomplete="username" required placeholder="name@organization.com"></label><label class="org-field org-field-full"><span>Password</span><input type="password" name="password" autocomplete="current-password" required placeholder="Enter your password"></label><div class="org-form-message" id="loginMessage" role="alert"></div><button class="org-button org-button-primary org-field-full">Sign in</button></form><div class="org-demo-credentials"><strong>Demo organizer</strong><span>organizer@eventease.com</span><span>Organizer@123</span></div><a class="org-back-link" href="index.html">← Back to EventEase</a></div></section></main>`;
      root.querySelector('#orgLoginForm').addEventListener('submit', (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const user = read(KEYS.users, []).find((item) => item.email.toLowerCase() === String(form.get('email')).toLowerCase() && item.role === 'organizer');
        const profile = getProfile(user?.id);
        const password = user?.password || profile.password;
        if (!user || form.get('password') !== password) {
          document.getElementById('loginMessage').textContent = 'Email or password is incorrect.';
          return;
        }
        setSession({ id: user.id, email: user.email, name: profile.name || user.name, role: 'organizer' });
        location.hash = '#/dashboard';
        render();
      });
      return;
    }
    const hash = location.hash.replace(/^#\/?/, '');
    const [path, queryString] = hash.split('?');
    const pieces = (path || 'dashboard').split('/').filter(Boolean).map(decodeURIComponent);
    const route = pieces[0] || 'dashboard';
    let content = '';
    let active = route;
    if (route === 'dashboard') content = dashboard();
    else if (route === 'events' && pieces[1] === 'new') { content = eventForm(); active = 'new'; }
    else if (route === 'events' && pieces[2] === 'edit') content = eventForm(pieces[1]);
    else if (route === 'events' && pieces[2] === 'bookings') content = bookingTable(pieces[1]);
    else if (route === 'events') content = eventTable();
    else if (route === 'bookings') content = bookingTable();
    else if (route === 'reports') content = reports();
    else if (route === 'profile') content = profile();
    else if (route === 'notifications') { content = notifications(); active = ''; }
    else content = dashboard();
    root.innerHTML = layout(content, active);
    bindPage();
  }

  function bindPage() {
    document.querySelector('[data-action="menu"]')?.addEventListener('click', () => document.body.classList.add('org-menu-open'));
    document.querySelector('[data-action="menu-close"]')?.addEventListener('click', () => document.body.classList.remove('org-menu-open'));
    document.querySelector('[data-action="logout"]')?.addEventListener('click', () => { localStorage.removeItem(KEYS.session); location.hash = ''; render(); });
    document.querySelector('[data-action="notifications"]')?.addEventListener('click', () => { write(KEYS.notifications, read(KEYS.notifications, []).map((item) => ({ ...item, read: true }))); location.hash = '#/notifications'; });
    document.querySelector('[data-action="print"]')?.addEventListener('click', () => window.print());
    document.querySelectorAll('[data-action="delete"]').forEach((button) => button.addEventListener('click', () => {
      const event = getOwnedEvent(button.dataset.id);
      if (!event) return;
      const confirmed = confirmedFor(event.id).length > 0;
      const verb = confirmed ? 'cancel' : 'delete';
      if (!window.confirm(`Are you sure you want to ${verb} “${event.title}”?${confirmed ? ' All confirmed bookings will be cancelled.' : ''}`)) return;
      const result = confirmed ? cancelEvent(event.id) : deleteEvent(event.id);
      if (!result.ok) window.alert(result.error);
      render();
    }));
    document.querySelectorAll('[data-action="csv"]').forEach((button) => button.addEventListener('click', () => exportCsv(button.dataset.event)));

    document.getElementById('eventFilters')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const params = new URLSearchParams();
      ['q', 'status', 'category'].forEach((key) => data.get(key) && params.set(key, data.get(key)));
      location.hash = `#/events${params.size ? `?${params}` : ''}`;
    });
    const bookingForm = document.getElementById('bookingFilters');
    if (bookingForm) {
      const currentFilters = new URLSearchParams(location.hash.split('?')[1] || '');
      ['from', 'to'].forEach((key) => {
        const label = document.createElement('label');
        label.className = 'org-date-filter';
        label.innerHTML = `<span>${key === 'from' ? 'From' : 'To'}</span><input type="date" name="${key}" value="${escapeHtml(currentFilters.get(key) || '')}">`;
        bookingForm.insertBefore(label, bookingForm.querySelector('button'));
      });
    }
    bookingForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const eventMatch = location.hash.match(/^#\/events\/([^/?]+)\/bookings/);
      const eventId = data.get('event') || (eventMatch ? decodeURIComponent(eventMatch[1]) : '');
      const params = new URLSearchParams();
      ['q', 'status', 'from', 'to'].forEach((key) => data.get(key) && params.set(key, data.get(key)));
      location.hash = `${eventId ? `#/events/${encodeURIComponent(eventId)}/bookings` : '#/bookings'}${params.size ? `?${params}` : ''}`;
    });

    const eventFormNode = document.getElementById('eventForm');
    const imageInput = eventFormNode?.elements.image;
    imageInput?.addEventListener('input', () => previewImage(imageInput.value));
    eventFormNode?.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.reportValidity()) return;
      const submitted = Object.fromEntries(new FormData(form).entries());
      const original = form.dataset.id ? getOwnedEvent(form.dataset.id) : null;
      const data = { ...original, ...submitted };
      const error = validateEvent(data);
      if (error) { window.alert(error); return; }
      if (submitted.price !== undefined) submitted.price = Number(submitted.price);
      if (submitted.capacity !== undefined) submitted.capacity = Number(submitted.capacity);
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'Saving…';
      const result = form.dataset.id ? updateEvent(form.dataset.id, submitted) : createEvent(data);
      if (!result.ok) { window.alert(result.error); render(); return; }
      window.alert(form.dataset.id ? (result.event.status === 'Pending' ? 'Changes saved and submitted for admin approval.' : 'Event updated successfully.') : 'Submitted for admin approval.');
      location.hash = '#/events';
      render();
    });

    document.getElementById('reportEvent')?.addEventListener('change', (event) => {
      location.hash = `#/reports${event.target.value ? `?event=${encodeURIComponent(event.target.value)}` : ''}`;
    });
    document.getElementById('profileForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const previous = getProfile();
      const updated = { ...previous, ...values };
      const profiles = read(KEYS.profiles, {});
      profiles[getSession().id] = updated;
      write(KEYS.profiles, profiles);
      if (getSession().id === DEMO.id) write(KEYS.profile, updated);
      const users = read(KEYS.users, []);
      const index = users.findIndex((user) => user.id === getSession().id);
      if (index >= 0) { users[index].name = values.name; write(KEYS.users, users); }
      setSession({ ...getSession(), name: values.name });
      window.alert('Profile saved.');
      render();
    });
    document.getElementById('passwordForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const profile = getProfile();
      if (values.currentPassword !== profile.password) { window.alert('Current password is incorrect.'); return; }
      if (values.newPassword.length < 8 || values.newPassword !== values.confirmPassword) { window.alert('New passwords must match and contain at least 8 characters.'); return; }
      const updated = { ...profile, password: values.newPassword };
      const profiles = read(KEYS.profiles, {});
      profiles[getSession().id] = updated;
      write(KEYS.profiles, profiles);
      if (getSession().id === DEMO.id) write(KEYS.profile, updated);
      const users = read(KEYS.users, []);
      const index = users.findIndex((user) => user.id === getSession().id);
      if (index >= 0) { users[index].password = values.newPassword; write(KEYS.users, users); }
      window.alert('Password updated.');
      event.currentTarget.reset();
    });
  }

  function validateEvent(data) {
    if (Object.values(data).some((value) => !String(value ?? '').trim())) return 'Please complete all required fields.';
    if (String(data.description).trim().length < 30) return 'Description must be at least 30 characters.';
    if (!CATEGORIES.includes(data.category)) return 'Choose a valid event category.';
    if (new Date(`${data.date}T${data.time || '00:00'}`) <= new Date()) return 'Choose a date and time in the future.';
    if (!Number.isFinite(Number(data.price)) || Number(data.price) < 0) return 'Ticket price must be zero or more.';
    if (!Number.isInteger(Number(data.capacity)) || Number(data.capacity) < 1 || Number(data.capacity) > 100000) return 'Capacity must be a whole number from 1 to 100,000.';
    try { const image = new URL(data.image); if (!['http:', 'https:'].includes(image.protocol)) throw new Error(); } catch { return 'Enter a valid image URL beginning with http:// or https://.'; }
    return '';
  }

  function previewImage(url) {
    const preview = document.getElementById('imagePreview');
    if (!preview) return;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      preview.innerHTML = `<img src="${escapeHtml(parsed.href)}" alt="Event banner preview" onerror="this.parentElement.innerHTML='<span>Image could not be loaded</span>'">`;
    } catch { preview.innerHTML = '<span>Enter a valid image URL to preview it</span>'; }
  }

  function exportCsv(eventId = '') {
    const allowed = new Set(getOwnEvents().map((event) => event.id));
    const events = new Map(getOwnEvents().map((event) => [event.id, event]));
    const rows = read(KEYS.bookings, []).filter((booking) => allowed.has(booking.eventId) && (!eventId || booking.eventId === eventId));
    const columns = ['Booking ID', 'Ticket ID', 'Attendee', 'Email', 'Event', 'Tickets', 'Amount', 'Booking date', 'Status', 'Cancellation date'];
    const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [columns, ...rows.map((booking) => [booking.id, booking.ticketId, booking.attendee, booking.email, events.get(booking.eventId)?.title || '', booking.tickets, booking.amount, booking.bookedAt, booking.status, booking.cancelledAt || ''])].map((row) => row.map(quote).join(',')).join('\r\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = eventId ? 'event-attendees.csv' : 'organizer-bookings.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.addEventListener('hashchange', () => { document.body.classList.remove('org-menu-open'); render(); });
  window.EventEaseOrganizer = {
    createEvent,
    updateEvent,
    deleteEvent,
    cancelEvent,
    getOrganizerEvents: getOwnEvents,
    getEventBookings: (id) => {
      const event = getOwnedEvent(id);
      return event ? bookingsFor(id).map((booking) => ({ ...booking, event })) : [];
    },
    seed
  };
  seed();
  render();
})();
