document.addEventListener('DOMContentLoaded', () => {
  const events = (() => {
    try { return JSON.parse(localStorage.getItem('eventease.organizer.events') || '[]'); } catch { return []; }
  })();
  const now = new Date();
  const approved = events.filter((event) => event.status === 'Approved' && new Date(`${event.date}T${event.time || '00:00'}`) > now);
  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const money = (amount) => Number(amount) === 0 ? 'Free' : `₹${Number(amount).toLocaleString('en-IN')}`;
  const cards = Array.from(document.querySelectorAll('.event-card'));

  cards.forEach((card) => {
    const title = card.querySelector('h3')?.textContent.trim();
    const matching = events.find((event) => event.title === title);
    if (matching && !approved.some((event) => event.id === matching.id)) card.remove();
  });

  const grid = document.querySelector('.events-grid');
  approved.forEach((event) => {
    if (cards.some((card) => card.querySelector('h3')?.textContent.trim() === event.title)) return;
    if (!grid || !event.image) return;
    let imageUrl;
    try {
      imageUrl = new URL(event.image);
      if (!['http:', 'https:'].includes(imageUrl.protocol)) return;
    } catch { return; }
    const available = Math.max(0, Number(event.seatsLeft ?? event.capacity));
    const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(`${event.date}T00:00:00`));
    const card = document.createElement('article');
    card.className = 'event-card';
    card.innerHTML = `<img src="${escapeHtml(imageUrl.href)}" alt="${escapeHtml(event.title)}" loading="lazy"><div class="body"><div class="card-top"><span class="badge purple">${escapeHtml(event.category)}</span><span class="meta">${available ? `${available} seats left` : 'Sold out'}</span></div><h3>${escapeHtml(event.title)}</h3><p class="meta">${date} · ${escapeHtml(event.city)} · ${money(event.price)}</p><div class="price-row"><div class="price">${money(event.price)}</div><a href="event-details.html?id=${encodeURIComponent(event.id)}" class="btn btn-primary small-btn">View details</a></div></div>`;
    grid.appendChild(card);
  });

  const eventId = new URLSearchParams(location.search).get('id');
  if (!eventId) return;
  const event = approved.find((item) => item.id === eventId);
  if (!event) {
    const title = document.querySelector('.page-hero h1');
    if (title) title.textContent = 'Event unavailable';
    const description = document.querySelector('.page-hero p');
    if (description) description.textContent = 'This event is not approved or is no longer available.';
    document.querySelector('.detail-layout')?.remove();
    return;
  }

  document.title = `${event.title} | EventEase`;
  document.querySelector('.page-hero h1').textContent = event.title;
  document.querySelector('.page-hero p').textContent = event.description;
  document.querySelector('.detail-banner img').src = event.image;
  document.querySelector('.detail-banner img').alt = event.title;
  document.querySelector('.detail-info h2').textContent = event.title;
  document.querySelector('.detail-meta').innerHTML = [event.category, date, event.time, `${event.venue}, ${event.city}`].map((value) => `<span>${escapeHtml(value)}</span>`).join('');
  document.querySelector('.detail-description').textContent = event.description;
  document.querySelector('.side-card .price-block strong').textContent = money(event.price);
  const info = document.querySelectorAll('.side-card .info-box strong');
  if (info.length >= 4) {
    info[0].textContent = event.category;
    info[1].textContent = `${event.venue}, ${event.city}`;
    info[2].textContent = `${Math.max(0, Number(event.seatsLeft ?? event.capacity))} seats`;
    info[3].textContent = event.organizerName || 'EventEase organizer';
  }
  const bookLink = document.querySelector('.side-card a.btn-primary');
  if (bookLink) bookLink.href = `login.html?event=${encodeURIComponent(event.id)}`;
});
