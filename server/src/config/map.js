
export const defaultMapConfig = {
  svgAsset: "map.svg",
  homeTableId: "HOME",
  defaultSpawnTableId: "NEUTRAL",
  spawnTableIdByTeam: { A: "A_BASE", B: "B_BASE" },
  tables: [
    { id: "A_BASE", subject: "A_BASE", capacity: 8, ownerTeam: "A", rect: { x: 60, y: 120, w: 250, h: 180 } },
    { id: "B_BASE", subject: "B_BASE", capacity: 8, ownerTeam: "B", rect: { x: 970, y: 120, w: 250, h: 180 } },

    { id: "MATH", subject: "Math", capacity: 4, ownerTeam: "A", rect: { x: 160, y: 360, w: 260, h: 160 } },
    { id: "PHYS", subject: "Physics", capacity: 4, ownerTeam: "B", rect: { x: 860, y: 360, w: 260, h: 160 } },
    { id: "NEUTRAL", subject: null, capacity: 6, ownerTeam: null, rect: { x: 510, y: 260, w: 260, h: 220 } },

    { id: "HOME", subject: "HOME", capacity: 999, ownerTeam: null, rect: { x: 510, y: 520, w: 260, h: 140 } }
  ],
  specials: []
};
