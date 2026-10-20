document.addEventListener('DOMContentLoaded', () => {
  const api = window.EventEaseApi;
  if (!api) return;
  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const money = (value) => Number(value) === 0 ? 'Free' : `₹${Number(value || 0).toLocaleString('en-IN')}`;
  const formatDate = (value) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value));
  const categoryIcon = { Music: '♫', Business: '▤', Arts: '✦', Sports: '⚽', Tech: '⌘', 'Food & Drink': '♨' };
  const page = location.pathname.split('/').pop().toLowerCase();

  function card(event) {
    const seats = Number(event.seatsLeft);
    return `<article class="event-card"><img src="${escapeHtml(event.image)}" alt="${escapeHtml(event.title)}" loading="lazy"><div class="body"><div class="card-top"><span class="badge purple">${escapeHtml(event.category)}</span><span class="meta">${seats ? `${seats} seats left` : 'Sold out'}</span></div><h3>${escapeHtml(event.title)}</h3><p class="meta">${formatDate(event.eventDate)} · ${escapeHtml(event.city)} · ${money(event.price)}</p><div class="price-row"><div class="price">${money(event.price)}</div><a href="event-details.html?id=${encodeURIComponent(event.id)}" class="btn btn-primary small-btn">View details</a></div></div></article>`;
  }

  function note(container, message) {
    if (!container) return;
    container.innerHTML = `<p class="form-note" role="status">${escapeHtml(message)}</p>`;
  }

  async function loadListing() {
    const grid = document.querySelector('main .events-grid');
    if (!grid) return;
    const params = new URLSearchParams(location.search);
    const isExplore = page === 'explore.html';
    const filterBox = document.querySelector('.filter-box');
    const query = {
      q: params.get('q') || '',
      location: params.get('location') || '',
      category: params.get('category') || '',
      dateFrom: params.get('dateFrom') || '',
      dateTo: params.get('dateTo') || '',
      price: params.get('price') || '',
      sort: params.get('sort') || 'date',
      page: 1,
      limit: isExplore ? 12 : 3
    };
    let currentPage = 1;
    let totalPages = 1;
    let loading = false;

    if (filterBox) {
      filterBox.innerHTML = `<input name="q" type="search" placeholder="Search event title or keyword" value="${escapeHtml(query.q)}"><select name="category" aria-label="Category"><option value="">All categories</option></select><input name="dateFrom" type="date" aria-label="Starting date" value="${escapeHtml(query.dateFrom)}"><input name="location" type="search" placeholder="City or venue" value="${escapeHtml(query.location)}"><select name="price" aria-label="Price"><option value="">Any price</option><option value="free">Free</option><option value="lt50">Under ₹50</option><option value="mid">₹50–₹100</option><option value="gt100">Over ₹100</option></select><select name="sort" aria-label="Sort events"><option value="date">Sort by date</option><option value="low">Lowest price</option><option value="high">Highest price</option></select><button class="btn btn-primary" type="submit" style="padding:0.8rem 1rem;">Apply filters</button>`;
      const categorySelect = filterBox.elements.category;
      try {
        const categories = await api.events.categories();
        categories.forEach((category) => {
          const option = document.createElement('option');
          option.value = category.category_name;
          option.textContent = category.category_name;
          option.selected = category.category_name === query.category;
          categorySelect.append(option);
        });
      } catch (error) { note(grid, error.message); return; }
      filterBox.addEventListener('submit', (event) => {
        event.preventDefault();
        const next = new URLSearchParams(new FormData(filterBox));
        history.replaceState(null, '', `${location.pathname}${next.size ? `?${next}` : ''}`);
        Object.assign(query, Object.fromEntries(next.entries()), { page: 1 });
        currentPage = 1;
        void fetchEvents(false);
      });
      let timer;
      filterBox.elements.q.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => filterBox.requestSubmit(), 350);
      });
    }

    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'btn btn-soft';
    more.textContent = 'Load more events';
    more.hidden = true;
    grid.insertAdjacentElement('afterend', more);
    more.addEventListener('click', () => { currentPage += 1; void fetchEvents(true); });

    async function fetchEvents(append) {
      if (loading) return;
      loading = true;
      more.disabled = true;
      if (!append) {
        grid.innerHTML = '<p class="form-note">Loading upcoming events…</p>';
      }
      try {
        const data = await api.events.list({ ...query, page: currentPage });
        totalPages = data.pages;
        const markup = data.items.map(card).join('');
        if (!append) grid.innerHTML = '';
        if (markup) grid.insertAdjacentHTML('beforeend', markup);
        if (!data.items.length && !append) note(grid, 'No upcoming events match your search.');
        more.hidden = currentPage >= totalPages || !markup;
        if (isExplore && data.items.length) {
          const heading = document.querySelector('.page-hero h1');
          if (heading) heading.dataset.total = String(data.total);
        }
        if (!isExplore && data.items[0]) updateHomeFeature(data.items[0]);
      } catch (error) {
        if (!append) note(grid, error.message);
        else window.alert(error.message);
      } finally {
        loading = false;
        more.disabled = false;
      }
    }

    function updateHomeFeature(event) {
      const feature = document.querySelector('.hero .main-card');
      if (!feature) return;
      const image = feature.querySelector('img');
      if (image) { image.src = event.image; image.alt = event.title; }
      const heading = feature.querySelector('h3');
      if (heading) heading.textContent = event.title;
      const meta = feature.querySelector('.event-meta .meta');
      if (meta) meta.textContent = `${formatDate(event.eventDate)} · ${event.city}`;
      const venue = feature.querySelector('.event-meta p.meta');
      if (venue) venue.textContent = `${event.venue} · ${event.city}`;
      const badge = feature.querySelector('.badge');
      if (badge) badge.textContent = event.category;
    }

    async function loadCategories() {
      const container = document.querySelector('.categories-grid');
      if (!container) return;
      try {
        const categories = await api.events.categories();
        container.innerHTML = categories.map((category) => `<a class="category-card" href="explore.html?category=${encodeURIComponent(category.category_name)}"><div class="category-icon" aria-hidden="true">${categoryIcon[category.category_name] || '✦'}</div><h3>${escapeHtml(category.category_name)}</h3><p>Browse ${escapeHtml(category.category_name.toLowerCase())} events</p></a>`).join('');
      } catch (error) { note(container, error.message); }
    }

    void fetchEvents(false);
    void loadCategories();
  }

  async function loadEventDetail() {
    const id = new URLSearchParams(location.search).get('id');
    const layout = document.querySelector('.detail-layout');
    if (!id) { note(layout, 'Choose an event from Explore Events to view its details.'); return; }
    try {
      const { event, related_events: related } = await api.events.get(id);
      document.title = `${event.title} | EventEase`;
      const pageTitle = document.querySelector('.page-hero h1');
      const pageDescription = document.querySelector('.page-hero p');
      if (pageTitle) pageTitle.textContent = event.title;
      if (pageDescription) pageDescription.textContent = event.description;
      const image = document.querySelector('.detail-banner img');
      if (image) { image.src = event.image; image.alt = event.title; }
      const heading = document.querySelector('.detail-info h2');
      if (heading) heading.textContent = event.title;
      const meta = document.querySelector('.detail-meta');
      if (meta) meta.innerHTML = [event.category, formatDate(event.eventDate), new Intl.DateTimeFormat('en-IN', { timeStyle: 'short' }).format(new Date(event.eventDate)), `${event.venue}, ${event.city}`].map((value) => `<span>${escapeHtml(value)}</span>`).join('');
      const description = document.querySelector('.detail-description');
      if (description) description.textContent = event.description;
      const price = document.querySelector('.price-block strong');
      if (price) price.textContent = money(event.price);
      const info = document.querySelectorAll('.side-card .info-box strong');
      if (info.length >= 4) {
        info[0].textContent = event.category;
        info[1].textContent = `${event.venue}, ${event.city}`;
        info[2].textContent = `${event.seatsLeft} seats`;
        info[3].textContent = event.organizerName;
      }
      const bookLink = document.querySelector('.side-card a.btn-primary');
      if (bookLink) bookLink.href = `login.html?returnTo=${encodeURIComponent(`book-event.html?event=${event.id}`)}`;
      const relatedGrid = document.querySelector('main .section[style*="background:#fff"] .events-grid');
      if (relatedGrid) relatedGrid.innerHTML = related.length ? related.map(card).join('') : '<p class="form-note">No related upcoming events.</p>';
    } catch (error) {
      if (layout) layout.remove();
      note(document.querySelector('main'), error.message);
    }
  }

  if (page === 'event-details.html') void loadEventDetail();
  else void loadListing();
});
