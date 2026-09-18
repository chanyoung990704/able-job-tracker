/**
 * Transient UI state: filters, search, sort, current view. Not persisted.
 * Kept as a single mutable object, matching index.html:1777, so the render
 * modules read it the same way they always did.
 *
 * `page`/`pageSize` from the original are gone — they belonged to an
 * infinite-scroll list that was replaced by the shelf rails and were never
 * read again (index.html:2372-2374).
 */
export const state = {
  cat: '전체',
  fit: 'all',
  appFilter: 'all',
  q: '',
  closed: false,
  openedId: null,
  viewMode: 'kanban',
  sort: 'due'
};

export function setState(patch) {
  Object.assign(state, patch);
}
