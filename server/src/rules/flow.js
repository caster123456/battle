
export function nextPhase(state) {
  const order = ["PLANNING", "ACTION", "QUIZ", "SOLVE", "SETTLE", "GROWTH", "RESOURCE"];
  const i = order.indexOf(state.phase);
  if (i === -1) return;
  state.phase = order[Math.min(i + 1, order.length - 1)];
}
