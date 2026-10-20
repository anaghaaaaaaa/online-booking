export function pageParams(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 10));
  return { page, limit, offset: (page - 1) * limit };
}

export function pageResult(items, total, page, limit) {
  return { items, total, page, pages: Math.ceil(total / limit) };
}
