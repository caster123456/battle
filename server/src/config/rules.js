
export const defaultRulesConfig = {
  maxRounds: 6,
  maxTracksPerRound: 5,
  stressLimit: 9,

  solveSuccessScore: 2,
  assistLogicBonusPerToken: 1,
  assistMemoryBonusPerToken: 1,

  stressOnQuestionReveal: 1,
  stressOnSolveSuccessSolver: 1,
  stressOnSolveSuccessAsker: 1,
  stressOnSolveFailSolver: 2,

  enableAutoOccupy: true,

  resourceToScoreRate: 10,
  tableIncome: {
    "A_BASE": { score: 0, resource: 1 },
    "B_BASE": { score: 0, resource: 1 },
    "MATH": { score: 1, resource: 2 },
    "PHYS": { score: 1, resource: 2 },
    "NEUTRAL": { score: 1, resource: 1 }
  }
};
