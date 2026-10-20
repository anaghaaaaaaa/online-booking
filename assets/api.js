(() => {
  const baseUrl = String(window.EVENTEASE_API_URL || 'http://localhost:5000/api/v1').replace(/\/+$/, '');
  let user = null;

  class ApiError extends Error {
    constructor(status, message, errors = null) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.errors = errors;
    }
  }

  const messages = {
    401: 'Your session has expired. Please log in again.',
    403: 'You do not have permission to do that.',
    409: 'This action conflicts with the latest event or booking state.',
    422: 'Please check the information and try again.',
    500: 'The service is temporarily unavailable. Please try again.'
  };

  function redirectToLogin() {
    const here = `${location.pathname}${location.search}${location.hash}`;
    if (!/login\.html$/i.test(location.pathname)) {
      location.replace(`login.html?returnTo=${encodeURIComponent(here)}`);
    }
  }

  async function request(path, options = {}) {
    const { method = 'GET', body, query, auth = true } = options;
    const url = new URL(`${baseUrl}${path}`, location.href);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
      });
    }
    let response;
    try {
      response = await fetch(url, {
        method,
        credentials: 'include',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch {
      throw new ApiError(0, 'Could not reach EventEase. Check that the API is running and try again.');
    }

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok || payload?.success === false) {
      const message = payload?.message || messages[response.status] || 'The request could not be completed.';
      if (response.status === 401) {
        user = null;
        if (auth && !/\/auth\/(login|register|me|logout)$/.test(path)) redirectToLogin();
      }
      throw new ApiError(response.status, message, payload?.errors || null);
    }
    return payload?.data;
  }

  const authApi = {
    me: async () => {
      const data = await request('/auth/me');
      user = data.user;
      return user;
    },
    login: async (credentials) => {
      const data = await request('/auth/login', { method: 'POST', body: credentials, auth: false });
      user = data.user;
      return user;
    },
    register: async (details) => {
      const data = await request('/auth/register', { method: 'POST', body: details, auth: false });
      user = data.user;
      return user;
    },
    logout: async () => {
      await request('/auth/logout', { method: 'POST', auth: false });
      user = null;
    },
    updateProfile: async (patch) => {
      const data = await request('/auth/profile', { method: 'PUT', body: patch });
      user = data.user;
      return user;
    },
    updatePassword: (details) => request('/auth/password', { method: 'PUT', body: details })
  };

  const queryString = (values = {}) => {
    const query = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    return query.toString();
  };

  const mapEvent = (event) => ({
    ...event,
    id: String(event.id),
    eventDate: event.event_date || event.eventDate,
    image: event.banner_image || event.bannerImage,
    price: Number(event.ticket_price ?? event.ticketPrice ?? 0),
    seatsLeft: Number(event.available_seats ?? event.seatsLeft ?? 0),
    category: event.category_name || event.category || '',
    organizerName: event.organizer_name || event.organizerName || '',
    rejectionReason: event.rejection_reason || event.rejectionReason || ''
  });
  const mapBooking = (booking) => ({
    ...booking,
    id: String(booking.id ?? booking.booking_id),
    ticketId: booking.ticket_id || booking.ticketId,
    tickets: Number(booking.quantity ?? booking.tickets ?? 0),
    amount: Number(booking.total_amount ?? booking.amount ?? 0),
    status: booking.derived_status || booking.booking_status || booking.status,
    cancelledAt: booking.cancelled_at || booking.cancelledAt || '',
    bookedAt: booking.created_at || booking.bookedAt,
    eventTitle: booking.title || booking.event_title || booking.eventTitle || '',
    date: booking.event_date || booking.date
  });

  async function download(path, query = {}, filename = 'eventease-export.csv') {
    const url = `${baseUrl}${path}${queryString(query) ? `?${queryString(query)}` : ''}`;
    let response;
    try { response = await fetch(url, { credentials: 'include' }); }
    catch { throw new ApiError(0, 'Could not reach EventEase. Check that the API is running and try again.'); }
    if (!response.ok) {
      let payload = null;
      try { payload = await response.json(); } catch {}
      if (response.status === 401) { user = null; redirectToLogin(); }
      throw new ApiError(response.status, payload?.message || messages[response.status] || 'The export could not be downloaded.');
    }
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  window.EventEaseApi = {
    ApiError,
    get user() { return user; },
    set user(value) { user = value; },
    request,
    download,
    queryString,
    auth: authApi,
    events: {
      list: async (query = {}) => {
        const data = await request('/events', { query, auth: false });
        return { ...data, items: data.items.map(mapEvent) };
      },
      get: async (id) => {
        const data = await request(`/events/${encodeURIComponent(id)}`, { auth: false });
        return {
          ...data,
          event: mapEvent(data.event),
          related_events: (data.event.related_events || data.related_events || []).map(mapEvent)
        };
      },
      categories: async () => (await request('/categories', { auth: false })).items
    },
    bookings: {
      list: async (query = {}) => {
        const data = await request('/bookings', { query });
        return { ...data, items: data.items.map(mapBooking) };
      },
      get: async (id) => (await request(`/bookings/${encodeURIComponent(id)}`)).booking,
      create: (eventId, quantity) => request('/bookings', { method: 'POST', body: { eventId, quantity } }),
      cancel: (id, reason) => request(`/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: reason ? { reason } : {} })
    },
    tickets: async () => (await request('/tickets')).items,
    dashboard: () => request('/dashboard/summary'),
    notifications: {
      list: (query = {}) => request('/notifications', { query }),
      read: (id) => request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }),
      readAll: () => request('/notifications/read-all', { method: 'PATCH' })
    },
    organizer: {
      dashboard: () => request('/organizer/dashboard'),
      events: async (query = {}) => {
        const data = await request('/organizer/events', { query });
        return { ...data, items: data.items.map(mapEvent) };
      },
      event: async (id) => mapEvent((await request(`/organizer/events/${encodeURIComponent(id)}`)).event),
      createEvent: async (body) => mapEvent((await request('/organizer/events', { method: 'POST', body })).event),
      updateEvent: async (id, body) => mapEvent((await request(`/organizer/events/${encodeURIComponent(id)}`, { method: 'PUT', body })).event),
      deleteEvent: (id) => request(`/organizer/events/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      cancelEvent: (id) => request(`/organizer/events/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
      bookings: async (query = {}) => {
        const data = await request('/organizer/bookings', { query });
        return { ...data, items: data.items.map(mapBooking) };
      },
      eventBookings: async (id, query = {}) => {
        const data = await request(`/organizer/events/${encodeURIComponent(id)}/bookings`, { query });
        return { ...data, items: data.items.map(mapBooking) };
      },
      reports: (query = {}) => request('/organizer/reports', { query })
    },
    admin: {
      dashboard: () => request('/admin/dashboard'),
      events: async (query = {}) => {
        const data = await request('/admin/events', { query });
        return { ...data, items: data.items.map(mapEvent) };
      },
      approveEvent: (id) => request(`/admin/events/${encodeURIComponent(id)}/approve`, { method: 'PATCH' }),
      rejectEvent: (id, reason) => request(`/admin/events/${encodeURIComponent(id)}/reject`, { method: 'PATCH', body: { reason } }),
      removeEvent: (id, reason) => request(`/admin/events/${encodeURIComponent(id)}/remove`, { method: 'PATCH', body: { reason } }),
      users: (query = {}) => request('/admin/users', { query }),
      userStatus: (id, status) => request(`/admin/users/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status } }),
      userRole: (id, role) => request(`/admin/users/${encodeURIComponent(id)}/role`, { method: 'PATCH', body: { role } }),
      deleteUser: (id) => request(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      requests: (query = {}) => request('/admin/organizer-requests', { query }),
      approveRequest: (id) => request(`/admin/organizer-requests/${encodeURIComponent(id)}/approve`, { method: 'PATCH' }),
      rejectRequest: (id, note = '') => request(`/admin/organizer-requests/${encodeURIComponent(id)}/reject`, { method: 'PATCH', body: { note } }),
      bookings: (query = {}) => request('/admin/bookings', { query }),
      categories: async () => (await request('/admin/categories')).items,
      createCategory: (categoryName) => request('/admin/categories', { method: 'POST', body: { categoryName } }),
      updateCategory: (id, categoryName) => request(`/admin/categories/${encodeURIComponent(id)}`, { method: 'PUT', body: { categoryName } }),
      deleteCategory: (id) => request(`/admin/categories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      reports: (query = {}) => request('/admin/reports', { query }),
      activity: (query = {}) => request('/admin/activity', { query })
    },
    contact: (body) => request('/contact', { method: 'POST', body, auth: false }),
    organizerRequest: (body) => request('/organizer-requests', { method: 'POST', body })
  };
})();
