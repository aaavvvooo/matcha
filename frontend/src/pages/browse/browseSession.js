// Where each user left Discover, so going to a profile and back does not reshuffle the stack.
// Ids and settings only: the people themselves are always fetched again, so nobody who was
// blocked or liked meanwhile can reappear. Memory only: a reload starts over.
let session = null;

/** @returns {{sortBy: string, filters: object, passedIds: number[], currentId: number|null}|null} */
export function loadBrowseSession(userId) {
  return session?.userId === userId ? session : null;
}

export function saveBrowseSession(userId, { sortBy, filters, passedIds, currentId }) {
  session = { userId, sortBy, filters, passedIds, currentId };
}
