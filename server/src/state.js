
import { defaultMapConfig } from "./config/map.js";
import { defaultRulesConfig } from "./config/rules.js";
import { defaultRolesConfig } from "./config/roles.js";

export function makeInitialRoomState(roomId) {
  const tables = {};
  for (const t of defaultMapConfig.tables) {
    tables[t.id] = {
      id: t.id,
      subject: t.subject ?? null,
      capacity: t.capacity ?? 4,
      ownerTeam: t.ownerTeam ?? null,
      tokens: [],
      questionIds: []
    };
  }

  return {
    roomId,
    round: 0,
    phase: "LOBBY",
    previousTurnOrder: [],
    turnOrder: [],
    players: {},
    tokens: {},
    plans: {},
    actionQueue: [],
    activeAction: null,
    lastActionResult: null,
    questions: {},
    contestedTableIds: [],
    solve: { pickerTeam: "A", pickedTableId: null, pickedQuestionId: null },
    lastSolveResult: null,

    map: defaultMapConfig,
    rules: defaultRulesConfig,
    roles: defaultRolesConfig,

    hooks: {
      onBeforeMove: [],
      onAfterMove: [],
      onBeforeAsk: [],
      onAfterAsk: [],
      onBeforeSolve: [],
      onAfterSolve: []
    },

    tables
  };
}

export function sanitizeForClient(state) {
  return state;
}
