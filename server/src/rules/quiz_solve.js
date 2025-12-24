
import { applyMove } from "./movement.js";

export function listContestedTables(state) {
  const ids = [];
  for (const [tid, table] of Object.entries(state.tables)) {
    const teams = new Set();
    for (const tokenId of table.tokens) {
      const t = state.tokens[tokenId];
      if (t && !t.home) teams.add(t.team);
    }
    if (teams.size >= 2) ids.push(tid);
  }
  return ids;
}

export function canAskOnTable(state, playerId, tableId, fromTokenId) {
  const table = state.tables[tableId];
  if (!table) return false;
  const token = state.tokens[fromTokenId];
  if (!token) return false;
  if (token.owner !== playerId) return false;
  if (token.tableId !== tableId) return false;
  if (token.home) return false;

  const teams = new Set();
  for (const id of table.tokens) {
    const t = state.tokens[id];
    if (t && !t.home) teams.add(t.team);
  }
  if (teams.size < 2) return false;

  for (const qid of table.questionIds) {
    const q = state.questions[qid];
    if (q?.pending && q.fromTokenId === fromTokenId) return false;
  }
  return true;
}

export function canSolveOnTable(state, tableId) {
  const table = state.tables[tableId];
  if (!table) return false;
  if (!table.questionIds.some(qid => state.questions[qid]?.pending)) return false;

  const teams = new Set();
  for (const id of table.tokens) {
    const t = state.tokens[id];
    if (t && !t.home) teams.add(t.team);
  }
  return teams.size >= 2;
}

export function resolveAttempt(state, { questionId, solverPlayerId, solverTokenIds, spendLogic, spendMemory, modifiers }) {
  const q = state.questions[questionId];
  if (!q || !q.pending) return { ok: false, reason: "QUESTION_NOT_PENDING" };

  // Reveal sum => asker stress +1
  const asker = state.tokens[q.fromTokenId];
  if (asker) {
    asker.stress += state.rules.stressOnQuestionReveal;
    enforceStress(state, asker);
  }

  // Each participant gives +1/+1
  const n = solverTokenIds.length;
  const powerL = spendLogic + n * state.rules.assistLogicBonusPerToken;
  const powerM = spendMemory + n * state.rules.assistMemoryBonusPerToken;

  const success = (powerL > q.X) && (powerM > q.Y);

  if (success) {
    state.players[solverPlayerId].score += state.rules.solveSuccessScore;

    for (const tid of solverTokenIds) {
      const t = state.tokens[tid];
      if (t) {
        t.stress += state.rules.stressOnSolveSuccessSolver;
        enforceStress(state, t);
      }
    }
    if (asker) {
      asker.stress += state.rules.stressOnSolveSuccessAsker;
      enforceStress(state, asker);
    }

    q.pending = false;
  } else {
    for (const tid of solverTokenIds) {
      const t = state.tokens[tid];
      if (t) {
        t.stress += state.rules.stressOnSolveFailSolver;
        enforceStress(state, t);
      }
    }
  }

  return { ok: true, success, revealedSum: q.X + q.Y, power: { logic: powerL, memory: powerM }, need: { logic: q.X, memory: q.Y } };
}

function enforceStress(state, token) {
  if (token.stress >= state.rules.stressLimit) {
    token.home = true;
    applyMove(state, token.id, state.map.homeTableId, { force: true });
  }
}

export function autoOccupyTables(state) {
  if (!state.rules.enableAutoOccupy) return;
  for (const [tid, table] of Object.entries(state.tables)) {
    if (tid === state.map.homeTableId) continue;
    if (table.questionIds.some(qid => state.questions[qid]?.pending)) continue;

    const teams = new Set();
    for (const tokenId of table.tokens) {
      const t = state.tokens[tokenId];
      if (t && !t.home) teams.add(t.team);
    }
    if (teams.size === 1) {
      table.ownerTeam = [...teams][0];
    }
  }
}

export function applyResourceIncome(state) {
  for (const [tid, table] of Object.entries(state.tables)) {
    const owner = table.ownerTeam;
    if (!owner) continue;
    const income = state.rules.tableIncome[tid];
    if (!income) continue;

    const pids = Object.keys(state.players).filter(pid => state.players[pid].team === owner);
    if (pids.length === 0) continue;
    for (const pid of pids) {
      state.players[pid].score += income.score;
      state.players[pid].resource += income.resource;
    }
  }
}
