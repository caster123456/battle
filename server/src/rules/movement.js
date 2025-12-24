
export function applyMove(state, tokenId, toTableId, opts = {}) {
  const token = state.tokens[tokenId];
  if (!token) return { ok: false, reason: "TOKEN_NOT_FOUND" };
  if (token.home && !opts.force) return { ok: false, reason: "TOKEN_AT_HOME" };

  const fromTable = state.tables[token.tableId];
  const toTable = state.tables[toTableId];
  if (!toTable) return { ok: false, reason: "TABLE_NOT_FOUND" };
  if (!opts.force && toTable.tokens.length >= toTable.capacity) return { ok: false, reason: "TABLE_FULL" };

  for (const fn of state.hooks.onBeforeMove) fn(state, { tokenId, from: token.tableId, to: toTableId, opts });

  if (fromTable) fromTable.tokens = fromTable.tokens.filter(id => id !== tokenId);
  token.tableId = toTableId;
  toTable.tokens.push(tokenId);

  for (const fn of state.hooks.onAfterMove) fn(state, { tokenId, from: fromTable?.id, to: toTableId, opts });

  return { ok: true };
}
