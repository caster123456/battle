
export function computeTurnOrderFromPlans(state) {
  const prev = state.previousTurnOrder.length ? state.previousTurnOrder : state.turnOrder;
  const score = (pid) => state.players[pid]?.score ?? 0;
  const tracks = (pid) => (state.plans[pid]?.length ?? 0);

  const arr = [...state.turnOrder];
  arr.sort((a, b) => {
    const ta = tracks(a), tb = tracks(b);
    if (ta !== tb) return ta - tb;
    const sa = score(a), sb = score(b);
    if (sa !== sb) return sa - sb;
    return prev.indexOf(a) - prev.indexOf(b);
  });

  state.previousTurnOrder = [...arr];
  return arr;
}
