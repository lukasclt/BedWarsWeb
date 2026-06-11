import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();
import { createClient } from "@supabase/supabase-js";
import { MatchState, PlayerState, VoxelBlock, ChatMessage, UserProfile, Team, GeneratorState, TeamUpgrades } from "./src/types";
import { getRandomMapTheme } from "./src/utils/mapThemes";

const app = express();
const PORT = 3000;
const server = createServer(app);

// Initialize Supabase Client - DISABLED to run 100% locally with zero errors
let supabase: any = null;
console.log("Servidor configurado para rodar 100% LOCAL (banco de dados em users.json).");

app.use(express.json());

// Persistent User Database (file-based)
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const USERS_FILE = path.join(DATA_DIR, "users.json");

interface DBUser extends UserProfile {
  passwordHash: string; // for simple authentication
}

let usersDB: Record<string, DBUser> = {};

// Load users from Supabase or local backup
async function loadUsers() {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        data.forEach((row: any) => {
          usersDB[row.username.toLowerCase()] = {
            username: row.username,
            email: row.email,
            passwordHash: row.password_hash || row.passwordHash || "123456",
            stats: row.stats || { wins: 0, losses: 0, kills: 0, bedsDestroyed: 0, gamesPlayed: 0 },
            rankPoints: row.rank_points || row.rankPoints || 1000,
            friends: row.friends || [],
            pendingReceived: row.pending_received || row.pendingReceived || [],
            pendingSent: row.pending_sent || row.pendingSent || [],
            selectedSkin: row.selected_skin || row.selectedSkin || "steve",
          };
        });
        console.log(`Successfully loaded ${data.length} profiles from Supabase!`);
        return;
      }
    } catch (e: any) {
      console.warn("Could not load profiles from Supabase profiles table. Falling back to local fallback JSON file. Error:", e.message || e);
    }
  }

  if (fs.existsSync(USERS_FILE)) {
    try {
      usersDB = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
      console.log("Loaded users database from local JSON file (fallback).");
    } catch (e) {
      console.error("Failed to read users database, resetting.", e);
      usersDB = {};
    }
  }
}

// Start loading
loadUsers();

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersDB, null, 2));
  } catch (e) {
    console.error("Failed to write users database", e);
  }
}

// Async save user to Supabase
async function saveUserToDB(username: string) {
  const user = usersDB[username.toLowerCase()];
  if (!user) return;

  if (supabase) {
    try {
      const { error } = await supabase.from('profiles').upsert({
        username: user.username,
        email: user.email,
        password_hash: user.passwordHash,
        stats: user.stats,
        rank_points: user.rankPoints,
        friends: user.friends,
        pending_received: user.pendingReceived,
        pending_sent: user.pendingSent,
        selected_skin: user.selectedSkin
      }, { onConflict: 'username' });

      if (error) {
        console.warn(`Supabase error saving user ${user.username}:`, error.message);
      } else {
        console.log(`Successfully synced user ${user.username} to Supabase.`);
      }
    } catch (e: any) {
      console.warn(`Supabase upsert failed for user ${user.username}:`, e.message || e);
    }
  }
}

function persistUser(username: string) {
  saveUsers();
  saveUserToDB(username);
}

// REST endpoints for Profile and Authentication
app.post("/api/auth/register", (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: "Missing username, email or password" });
  }

  const cleanUsername = username.trim();
  if (usersDB[cleanUsername.toLowerCase()]) {
    return res.status(400).json({ error: "Username already taken" });
  }

  const newUser: DBUser = {
    username: cleanUsername,
    email: email.trim(),
    passwordHash: password, // In a production app, use bcrypt. For this self-contained indie template, simple comparison is safe
    stats: { wins: 0, losses: 0, kills: 0, bedsDestroyed: 0, gamesPlayed: 0 },
    rankPoints: 1000,
    friends: [],
    pendingReceived: [],
    pendingSent: [],
    selectedSkin: "steve",
    coins: 1000,
    unlockedSkinIds: ["steve", "alex"],
    unlockedCosmetics: [],
    unlockedEmotes: ["wave"],
    selectedCape: "none",
    selectedWings: "none",
    selectedHalo: "none",
    selectedHat: "none"
  };

  usersDB[cleanUsername.toLowerCase()] = newUser;
  persistUser(cleanUsername);

  const { passwordHash, ...safeUser } = newUser;
  res.json({ success: true, user: safeUser });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const key = username.trim().toLowerCase();
  const user = usersDB[key];
  if (!user || user.passwordHash !== password) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  // Backfill skin, cosmetic and coin state if legacy player
  if (user.coins === undefined) user.coins = 1000;
  if (!user.unlockedSkinIds) user.unlockedSkinIds = ["steve", "alex"];
  if (!user.unlockedCosmetics) user.unlockedCosmetics = [];
  if (!user.unlockedEmotes) user.unlockedEmotes = ["wave"];
  if (!user.selectedCape) user.selectedCape = "none";
  if (!user.selectedWings) user.selectedWings = "none";
  if (!user.selectedHalo) user.selectedHalo = "none";
  if (!user.selectedHat) user.selectedHat = "none";

  const { passwordHash, ...safeUser } = user;
  res.json({ success: true, user: safeUser });
});

app.get("/api/leaderboard", (req, res) => {
  const sorted = Object.values(usersDB)
    .map(u => ({ username: u.username, rankPoints: u.rankPoints, stats: u.stats }))
    .sort((a, b) => b.rankPoints - a.rankPoints)
    .slice(0, 10);
  res.json(sorted);
});

// Shop and Unlock system endpoints for Minecraft 10k Skins + Cosmetics
app.post("/api/profile/unlock-skin", (req, res) => {
  const { username, skinId, price } = req.body;
  const key = String(username).trim().toLowerCase();
  const user = usersDB[key];
  if (!user) {
    return res.status(404).json({ error: "Jogador não encontrado" });
  }

  if (user.coins === undefined) user.coins = 1000;
  if (!user.unlockedSkinIds) user.unlockedSkinIds = ["steve", "alex"];

  if (user.unlockedSkinIds.includes(skinId)) {
    return res.json({ success: true, message: "Skin já desbloqueada!", coins: user.coins, unlockedSkinIds: user.unlockedSkinIds });
  }

  if (user.coins < price) {
    return res.status(400).json({ error: "Moedas insuficientes!" });
  }

  user.coins -= price;
  user.unlockedSkinIds.push(skinId);
  saveUsers();

  const { passwordHash, ...safeUser } = user;
  res.json({ success: true, user: safeUser });
});

app.post("/api/profile/unlock-cosmetic", (req, res) => {
  const { username, cosmeticId, price } = req.body;
  const key = String(username).trim().toLowerCase();
  const user = usersDB[key];
  if (!user) {
    return res.status(404).json({ error: "Jogador não encontrado" });
  }

  if (user.coins === undefined) user.coins = 1000;
  if (!user.unlockedCosmetics) user.unlockedCosmetics = [];

  if (user.unlockedCosmetics.includes(cosmeticId)) {
    return res.json({ success: true, message: "Cosmético já desbloqueado!", coins: user.coins, unlockedCosmetics: user.unlockedCosmetics });
  }

  if (user.coins < price) {
    return res.status(400).json({ error: "Moedas insuficientes!" });
  }

  user.coins -= price;
  user.unlockedCosmetics.push(cosmeticId);
  saveUsers();

  const { passwordHash, ...safeUser } = user;
  res.json({ success: true, user: safeUser });
});

app.post("/api/profile/unlock-emote", (req, res) => {
  const { username, emoteId, price } = req.body;
  const key = String(username).trim().toLowerCase();
  const user = usersDB[key];
  if (!user) {
    return res.status(404).json({ error: "Jogador não encontrado" });
  }

  if (user.coins === undefined) user.coins = 1000;
  if (!user.unlockedEmotes) user.unlockedEmotes = ["wave"];

  if (user.unlockedEmotes.includes(emoteId)) {
    return res.json({ success: true, message: "Emote já desbloqueado!", coins: user.coins, unlockedEmotes: user.unlockedEmotes });
  }

  if (user.coins < price) {
    return res.status(400).json({ error: "Moedas insuficientes!" });
  }

  user.coins -= price;
  user.unlockedEmotes.push(emoteId);
  saveUsers();

  const { passwordHash, ...safeUser } = user;
  res.json({ success: true, user: safeUser });
});

app.post("/api/profile/equip-cosmetic", (req, res) => {
  const { username, type, cosmeticId } = req.body; // type: cape, wings, halo, hat
  const key = String(username).trim().toLowerCase();
  const user = usersDB[key];
  if (!user) {
    return res.status(404).json({ error: "Jogador não encontrado" });
  }

  if (type === 'cape') user.selectedCape = cosmeticId;
  else if (type === 'wings') user.selectedWings = cosmeticId;
  else if (type === 'halo') user.selectedHalo = cosmeticId;
  else if (type === 'hat') user.selectedHat = cosmeticId;

  saveUsers();

  const { passwordHash, ...safeUser } = user;
  res.json({ success: true, user: safeUser });
});

app.post("/api/profile/daily-coins", (req, res) => {
  const { username } = req.body;
  const key = String(username).trim().toLowerCase();
  const user = usersDB[key];
  if (!user) {
    return res.status(404).json({ error: "Jogador não encontrado" });
  }

  if (user.coins === undefined) user.coins = 1000;
  user.coins += 500; // Gift 500 coins instantly so user can enjoy shopping Hypixel styles!
  saveUsers();

  const { passwordHash, ...safeUser } = user;
  res.json({ success: true, user: safeUser, rewarded: 500 });
});

// Server status endpoint
app.get("/api/server-status", (req, res) => {
  const activeSocketsCount = Object.keys(activeSockets).length;
  const activeLobbiesCount = Object.keys(activeMatches).length;
  const queuingPlayersCount = matchmakingQueue.length;
  res.json({
    status: "online",
    activeSocketsCount,
    activeLobbiesCount,
    queuingPlayersCount,
    uptimeSec: Math.floor(process.uptime()),
    databaseSize: Object.keys(usersDB).length,
    nodeVersion: process.version
  });
});

// Update profile skin
app.post("/api/profile/skin", (req, res) => {
  const { username, skinId } = req.body;
  const key = String(username).trim().toLowerCase();
  if (usersDB[key]) {
    usersDB[key].selectedSkin = skinId;
    saveUsers();
    return res.json({ success: true, skinId });
  }
  res.status(404).json({ error: "User not found" });
});

// Active real-time matchmaking queue & lobbies
const matchmakingQueue: Array<{ socket: WebSocket; username: string; skinId: string }> = [];
const activeMatches: Record<string, MatchState> = {};
const activeSockets: Record<string, { socket: WebSocket; username: string; team?: Team; matchId?: string; skinId?: string; }> = {};

// Helper to broadcast to a specific match
function broadcastToMatch(matchId: string, event: object) {
  const match = activeMatches[matchId];
  if (!match) return;

  const payload = JSON.stringify(event);
  match.players.forEach(p => {
    const pSock = activeSockets[p.id];
    if (pSock && pSock.socket.readyState === WebSocket.OPEN) {
      pSock.socket.send(payload);
    }
  });
}

function notifyOnlineFriends(username: string) {
  // Let friends know of online states if needed
}

const TEAM_CONFIG: Record<Team, { x: number; z: number; colorHex: string }> = {
  red:    { x: 0,   z: -35, colorHex: '#ef4444' },
  blue:   { x: 0,   z: 35,  colorHex: '#2563eb' },
  green:  { x: 35,  z: 0,   colorHex: '#10b981' },
  yellow: { x: -35, z: 0,   colorHex: '#eab308' },
  cyan:   { x: -25, z: 25,  colorHex: '#06b6d4' },
  white:  { x: 25,  z: 25,  colorHex: '#ffffff' },
  pink:   { x: 25,  z: -25, colorHex: '#ec4899' },
  gray:   { x: -25, z: -25, colorHex: '#9ca3af' }
};

// Generate an island-based BedWars arena with dynamic modes
function initArena(matchId: string, mode: 'solo' | 'dupla' | 'trio' | 'quarteto' = 'solo', createdBy?: string, isPrivate = false): MatchState {
  const teamsInMode: Team[] = (mode === 'solo' || mode === 'dupla')
    ? ['red', 'blue', 'green', 'yellow', 'cyan', 'white', 'pink', 'gray']
    : ['red', 'blue', 'green', 'yellow'];

  const chosenMapTheme = getRandomMapTheme();

  const beds = {} as Record<Team, boolean>;
  teamsInMode.forEach(t => {
    beds[t] = true;
  });

  const teamUpgrades = {} as Record<Team, TeamUpgrades>;
  teamsInMode.forEach(t => {
    teamUpgrades[t] = { sharpness: 0, protection: 0, haste: 0, bedDefense: 0 };
  });

  const blocks: Record<string, VoxelBlock> = {};

  // Build small basic visual islands so players have initial blocks to stand on
  // Center island (with Emerald spawner)
  for (let x = -4; x <= 4; x++) {
    for (let z = -4; z <= 4; z++) {
      if (Math.abs(x) + Math.abs(z) <= 6) {
        blocks[`${x},-3,${z}`] = { x, y: -3, z, type: "endstone" };
      }
    }
  }

  // Diamond generator islands at (18, -3, 18), (-18, -3, 18), (18, -3, -18), (-18, -3, -18)
  const diaCoords = [[18, 18], [-18, 18], [18, -18], [-18, -18]];
  diaCoords.forEach(([dx, dz]) => {
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        blocks[`${dx+x},-3,${dz+z}`] = { x: dx+x, y: -3, z: dz+z, type: "endstone" };
      }
    }
  });

  // Dynamic starting islands for all teams in the mode
  teamsInMode.forEach(t => {
    const config = TEAM_CONFIG[t] || TEAM_CONFIG['red'];
    const tx = config.x;
    const tz = config.z;
    // Spawn island basic grid
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        blocks[`${tx+x},-3,${tz+z}`] = { x: tx+x, y: -3, z: tz+z, type: "wool", team: t };
      }
    }
    // Set a Bed block at (tx, -2, tz - 1)
    blocks[`${tx},-2,${tz-1}`] = { x: tx, y: -2, z: tz-1, type: "wool", team: t }; // Represents the bed voxel
  });

  // Setup spawner generators
  const generators: GeneratorState[] = [
    { id: "emerald_center_1", type: "emerald", x: 0, y: -2, z: 0, tier: 1 },
    { id: "diamond_1", type: "diamond", x: 18, y: -2, z: 18, tier: 1 },
    { id: "diamond_2", type: "diamond", x: -18, y: -2, z: 18, tier: 1 },
    { id: "diamond_3", type: "diamond", x: 18, y: -2, z: -18, tier: 1 },
    { id: "diamond_4", type: "diamond", x: -18, y: -2, z: -18, tier: 1 },
  ];

  // Base Iron/Gold generators
  teamsInMode.forEach(t => {
    const config = TEAM_CONFIG[t] || TEAM_CONFIG['red'];
    generators.push({
      id: `base_${t}`,
      type: "iron",
      x: config.x,
      y: -2,
      z: config.z + 2,
      tier: 1
    });
  });

  return {
    id: matchId,
    status: "waiting",
    countdown: 10,
    players: [],
    beds,
    blocks,
    generators,
    chat: [{ id: "system_init", senderName: "Narrador", text: `🎮 Partida iniciada no mapa [${chosenMapTheme.name}] (Modo: ${mode.toUpperCase()})! Aguardando guerreiros...`, timestamp: Date.now(), system: true }],
    createdBy,
    isPrivate,
    teamUpgrades,
    mode,
    mapTheme: chosenMapTheme.name
  };
}

// Game loop timer variables
const generatorsTimestamps: Record<string, number> = {};

// Matchmaker checker - ticks speed-generator, spawn timers, and game statuses
setInterval(() => {
  const matchKeys = Object.keys(activeMatches);
  const now = Date.now();

  matchKeys.forEach(matchId => {
    const match = activeMatches[matchId];
    if (match.status === "starting") {
      match.countdown -= 1;
      if (match.countdown <= 0) {
        // MATCH IS STARTING! Fill empty slots with bots
        const activeMode = match.mode || 'solo';
        const requiredPlayers = activeMode === 'solo' ? 8 
                              : activeMode === 'dupla' ? 16 
                              : activeMode === 'trio' ? 12 
                              : 16; // quarteto

        const currentCount = match.players.length;
        if (currentCount < requiredPlayers) {
          const botsNeeded = requiredPlayers - currentCount;
          const possibleTeams: Team[] = (activeMode === 'solo' || activeMode === 'dupla')
            ? ['red', 'blue', 'green', 'yellow', 'cyan', 'white', 'pink', 'gray']
            : ['red', 'blue', 'green', 'yellow'];

          const botNames = [
            "SteveBot", "AlexBot", "CreeperBot", "DragonBot", "CyberBot", 
            "NinjaBot", "VoxelBot", "WitherBot", "EndermanBot", "ZombieBot", 
            "Herobrine", "NoobMaster", "ProVoxel", "BedBreaker", "IronGiant", 
            "EmeraldKing", "DiamondMiner", "GoldenGlow", "ShadowFiend", "SharpBlade"
          ];

          for (let i = 0; i < botsNeeded; i++) {
            // Find team with lowest player count for balanced teams
            const teamsCount = {} as Record<Team, number>;
            possibleTeams.forEach(t => { teamsCount[t] = 0; });
            match.players.forEach(p => {
              if (teamsCount[p.team] !== undefined) {
                teamsCount[p.team]++;
              }
            });

            let chosenTeam: Team = possibleTeams[0];
            let minCount = 999;
            possibleTeams.forEach(t => {
              if (teamsCount[t] < minCount) {
                minCount = teamsCount[t];
                chosenTeam = t;
              }
            });

            const botName = `🤖_${botNames[i % botNames.length]}_${Math.floor(Math.random() * 900 + 100)}`;
            const randomSkin = ["steve", "alex", "creeper", "cyber", "dragon"][Math.floor(Math.random() * 5)];
            const botPlayer = createPlayerState(botName, chosenTeam, randomSkin);
            botPlayer.isBot = true; // Set bot flag
            match.players.push(botPlayer);
          }
        }

        match.status = "playing";
        match.chat.push({
          id: `match_start_${now}`,
          senderName: "System",
          text: `🚨 O combate de BedWars (${activeMode.toUpperCase()}) foi iniciado com ${match.players.length} jogadores no total! Que vença o melhor!`,
          timestamp: now,
          system: true
        });
      }
      broadcastToMatch(matchId, { type: "match:update", match });
    } else if (match.status === "playing") {
      let updated = false;

      // Manage and simulate Bots & respawns
      match.players.forEach(p => {
        if (p.isDead && p.respawnTime > 0) {
          p.respawnTime -= 1;
          updated = true;
          if (p.respawnTime <= 0) {
            p.isDead = false;
            p.health = p.maxHealth;
            // Respawn back at team island coordinates
            const config = TEAM_CONFIG[p.team] || TEAM_CONFIG['red'];
            p.x = config.x;
            p.y = -1;
            p.z = config.z;
            match.chat.push({
              id: `respawn_${p.id}_${now}`,
              senderName: "System",
              text: `${p.username} ressurgiu na arena!`,
              timestamp: now,
              system: true
            });
          }
        } else if (!p.isDead && p.isBot) {
          // BOT REAL-TIME AI SIMULATION
          updated = true;
          // Walk slowly towards coordinates or random targets
          const targetX = 0;
          const targetZ = 0;
          const dx = targetX - p.x;
          const dz = targetZ - p.z;
          const dist = Math.sqrt(dx * dx + dz * dz);

          if (dist > 5) {
            // Move slightly closer to the center island to find action
            p.x += (dx / dist) * 0.45;
            p.z += (dz / dist) * 0.45;
            p.rotY = Math.atan2(dx, dz);
          } else {
            // Jitter around center island
            p.x += (Math.random() - 0.5) * 0.3;
            p.z += (Math.random() - 0.5) * 0.3;
          }

          // Gather resource simulation
          if (Math.random() < 0.08) {
            p.coins.iron += 3;
            if (Math.random() < 0.2) p.coins.gold += 1;
          }

          // Purchase upgrades at virtual spawn shop
          if (p.coins.iron >= 35 && Math.random() < 0.05) {
            p.coins.iron -= 30;
            p.swordEquipped = p.swordEquipped === 'wood' ? 'stone' : p.swordEquipped === 'stone' ? 'iron' : 'diamond';
          }

          // Check for nearby enemies on other teams & strike them
          match.players.forEach(other => {
            if (other.team !== p.team && !other.isDead && !p.isDead) {
              const bx = other.x - p.x;
              const bz = other.z - p.z;
              const d = Math.sqrt(bx * bx + bz * bz);
              if (d < 4) {
                // Battle clash! deal damage
                const dmg = p.swordEquipped === 'wood' ? 8 : p.swordEquipped === 'stone' ? 12 : p.swordEquipped === 'iron' ? 18 : 24;
                other.health = Math.max(0, other.health - dmg);
                p.rotY = Math.atan2(bx, bz);

                if (other.health <= 0) {
                  other.isDead = true;
                  other.respawnTime = 10;
                  match.chat.push({
                    id: `kill_${p.id}_${now}`,
                    senderName: "Arena",
                    text: `⚔️ Bot ${p.username} derrotou ${other.username} no combate corpo a corpo!`,
                    timestamp: now,
                    system: true
                  });
                }
              }
            }
          });
        }
      });

      // Item Generator Spawning Engine (tick every 1.5s)
      if (!generatorsTimestamps[matchId] || now - generatorsTimestamps[matchId] >= 1500) {
        generatorsTimestamps[matchId] = now;
        broadcastToMatch(matchId, {
          type: "game:generator_tick",
          generators: match.generators
        });
      }

      if (updated) {
        broadcastToMatch(matchId, { type: "match:update", match });
      }

      // Check win condition (how many teams with beds or living players are remaining)
      const aliveTeams = new Set<Team>();
      match.players.forEach(p => {
        if (!p.isDead || match.beds[p.team]) {
          aliveTeams.add(p.team);
        }
      });

      if (aliveTeams.size === 1 && match.players.length > 1) {
        const winningTeam = Array.from(aliveTeams)[0];
        match.status = "ended";
        match.winnerTeam = winningTeam;
        match.chat.push({
          id: `match_end_${now}`,
          senderName: "System",
          text: `👑 Partida encerrada! Os guerreiros do Time ${winningTeam.toUpperCase()} conquistaram a vitória!`,
          timestamp: now,
          system: true
        });

        // Award and persist Rank Points in local DB and Supabase
        match.players.forEach(p => {
          if (p.isBot) return;
          const ukey = p.username.toLowerCase();
          const user = usersDB[ukey];
          if (user) {
            user.stats.gamesPlayed += 1;
            if (p.team === winningTeam) {
              user.stats.wins += 1;
              user.rankPoints += 25;
            } else {
              user.stats.losses += 1;
              user.rankPoints = Math.max(800, user.rankPoints - 15);
            }
            // Synced save
            persistUser(user.username);
          }
        });

        broadcastToMatch(matchId, { type: "match:update", match });
      }
    }
  });
}, 1000);

// WebSocket Setup
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws: WebSocket) => {
  let userSessionSessionId = Math.random().toString(36).substring(2, 9);

  ws.on("message", (messageStr: string) => {
    try {
      const event = JSON.parse(messageStr);

      switch (event.type) {
        case "auth": {
          const { username, skinId } = event.payload;
          activeSockets[userSessionSessionId] = { socket: ws, username, skinId };
          notifyOnlineFriends(username);

          // Return initial success
          ws.send(JSON.stringify({ type: "auth:success", sessionId: userSessionSessionId }));
          break;
        }

        case "friends:get_list": {
          const { username } = event.payload;
          const uKey = String(username).toLowerCase();
          const user = usersDB[uKey];
          if (user) {
            // Find which in userDB are online
            const activeUsernames = Object.values(activeSockets).map(s => s.username);
            const friendsStatuses = user.friends.map(fname => ({
              username: fname,
              online: activeUsernames.includes(fname),
              selectedSkin: usersDB[fname.toLowerCase()]?.selectedSkin || "steve"
            }));

            ws.send(JSON.stringify({
              type: "friends:list",
              friends: friendsStatuses,
              pendingReceived: user.pendingReceived,
              pendingSent: user.pendingSent
            }));
          }
          break;
        }

        case "friends:send_invite": {
          const { from, to } = event.payload;
          const fromKey = String(from).toLowerCase();
          const toKey = String(to).toLowerCase();
          const fromUser = usersDB[fromKey];
          const toUser = usersDB[toKey];

          if (fromUser && toUser && fromKey !== toKey) {
            if (!fromUser.friends.includes(toUser.username) && !fromUser.pendingSent.includes(toUser.username)) {
              fromUser.pendingSent.push(toUser.username);
              toUser.pendingReceived.push(fromUser.username);
              saveUsers();

              // Send response back
              ws.send(JSON.stringify({ type: "friends:invite_sent", success: true }));

              // If recipient is online, notify them immediately
              const recipientSocket = Object.values(activeSockets).find(s => s.username.toLowerCase() === toKey);
              if (recipientSocket) {
                recipientSocket.socket.send(JSON.stringify({
                  type: "friends:new_invite",
                  from: fromUser.username
                }));
              }
            }
          } else {
            ws.send(JSON.stringify({ type: "friends:invite_sent", success: false, error: "User not found or invalid" }));
          }
          break;
        }

        case "friends:accept_invite": {
          const { username, fromFriend } = event.payload;
          const userKey = String(username).toLowerCase();
          const friendKey = String(fromFriend).toLowerCase();
          const user = usersDB[userKey];
          const friend = usersDB[friendKey];

          if (user && friend) {
            user.pendingReceived = user.pendingReceived.filter(f => f.toLowerCase() !== friendKey);
            friend.pendingSent = friend.pendingSent.filter(f => f.toLowerCase() !== userKey);

            if (!user.friends.includes(friend.username)) user.friends.push(friend.username);
            if (!friend.friends.includes(user.username)) friend.friends.push(user.username);
            saveUsers();

            ws.send(JSON.stringify({ type: "friends:action_complete", success: true }));

            // Notify friend if online
            const friendSocket = Object.values(activeSockets).find(s => s.username.toLowerCase() === friendKey);
            if (friendSocket) {
              friendSocket.socket.send(JSON.stringify({
                type: "friends:invite_accepted",
                friendname: user.username
              }));
            }
          }
          break;
        }

        case "lobby:create_private": {
          const { username, mode } = event.payload;
          const matchId = `private_${Math.random().toString(36).slice(2, 8)}`;
          const selectedMode = mode || 'solo';
          const newMatch = initArena(matchId, selectedMode, username, true);
          activeMatches[matchId] = newMatch;

          // Join creator to match
          ws.send(JSON.stringify({ type: "lobby:created", matchId }));
          break;
        }

        case "lobby:get_available": {
          // Send all joinable lobbies
          const list = Object.values(activeMatches)
            .filter(m => !m.isPrivate && (m.status === "waiting" || m.status === "starting"))
            .map(m => ({ id: m.id, playersCount: m.players.length, status: m.status, mode: m.mode }));
          ws.send(JSON.stringify({ type: "lobby:list", lobbies: list }));
          break;
        }

        case "matchmaking:join": {
          const session = activeSockets[userSessionSessionId];
          if (!session) return;
          const { mode } = event.payload || { mode: 'solo' };

          // Find or create an active matchmaking lobby for this mode
          const maxPlayers = mode === 'solo' ? 8 
                           : mode === 'dupla' ? 16 
                           : mode === 'trio' ? 12 
                           : 16; // quarteto

          let availableMatch = Object.values(activeMatches).find(m => 
            !m.isPrivate && 
            m.status === "waiting" && 
            m.mode === mode &&
            m.players.length < maxPlayers
          );

          let matchId = "";
          if (availableMatch) {
            matchId = availableMatch.id;
          } else {
            matchId = `match_${Math.random().toString(36).slice(2, 8)}`;
            availableMatch = initArena(matchId, mode, undefined, false);
            activeMatches[matchId] = availableMatch;
          }

          // Pick an unused or least populated team in the selected mode
          const possibleTeams: Team[] = (mode === 'solo' || mode === 'dupla')
            ? ['red', 'blue', 'green', 'yellow', 'cyan', 'white', 'pink', 'gray']
            : ['red', 'blue', 'green', 'yellow'];

          const teamsCount = {} as Record<Team, number>;
          possibleTeams.forEach(t => { teamsCount[t] = 0; });
          availableMatch.players.forEach(p => {
            if (teamsCount[p.team] !== undefined) {
              teamsCount[p.team]++;
            }
          });

          let chosenTeam: Team = possibleTeams[0];
          let minCount = 999;
          possibleTeams.forEach(t => {
            if (teamsCount[t] < minCount) {
              minCount = teamsCount[t];
              chosenTeam = t;
            }
          });

          // Join matchmaking pool
          if (!availableMatch.players.find(p => p.username === session.username)) {
            const pState = createPlayerState(session.username, chosenTeam, session.skinId);
            availableMatch.players.push(pState);
            session.matchId = matchId;
            session.team = chosenTeam;

            availableMatch.chat.push({
              id: `join_${session.username}_${Date.now()}`,
              senderName: "System",
              text: `👋 ${session.username} entrou na fila do modo ${mode.toUpperCase()} (Equipe ${chosenTeam.toUpperCase()})!`,
              timestamp: Date.now(),
              system: true
            });

            // Start countdown immediately for snappy experience
            if (availableMatch.status === "waiting") {
              availableMatch.status = "starting";
              availableMatch.countdown = 6;
            }
          }

          ws.send(JSON.stringify({ type: "match:assigned", matchId, team: chosenTeam, match: availableMatch }));
          broadcastToMatch(matchId, { type: "match:update", match: availableMatch });
          break;
        }

        case "matchmaking:leave": {
          const session = activeSockets[userSessionSessionId];
          if (session && session.matchId) {
            const match = activeMatches[session.matchId];
            if (match) {
              match.players = match.players.filter(p => p.username !== session.username);
              broadcastToMatch(session.matchId, { type: "match:update", match });
            }
            session.matchId = undefined;
          }
          ws.send(JSON.stringify({ type: "matchmaking:queued", success: false }));
          break;
        }

        case "lobby:join": {
          const { matchId, username, skinId } = event.payload;
          let match = activeMatches[matchId];
          const session = activeSockets[userSessionSessionId];
          if (!session) return;

          if (!match) {
            ws.send(JSON.stringify({ type: "lobby:error", error: "Room not found" }));
            return;
          }

          const mode = match.mode || 'solo';
          const maxPlayers = mode === 'solo' ? 8 
                           : mode === 'dupla' ? 16 
                           : mode === 'trio' ? 12 
                           : 16;

          if (match.players.length >= maxPlayers) {
            ws.send(JSON.stringify({ type: "lobby:error", error: `A sala está cheia (limite de ${maxPlayers} jogadores no modo ${mode.toUpperCase()})` }));
            return;
          }

          // Pick an unused or minimally used team for this mode
          const possibleTeams: Team[] = (mode === 'solo' || mode === 'dupla')
            ? ['red', 'blue', 'green', 'yellow', 'cyan', 'white', 'pink', 'gray']
            : ['red', 'blue', 'green', 'yellow'];

          const teamsCount = {} as Record<Team, number>;
          possibleTeams.forEach(t => { teamsCount[t] = 0; });
          match.players.forEach(p => {
            if (teamsCount[p.team] !== undefined) {
              teamsCount[p.team]++;
            }
          });

          let chosenTeam: Team = possibleTeams[0];
          let minCount = 999;
          possibleTeams.forEach(t => {
            if (teamsCount[t] < minCount) {
              minCount = teamsCount[t];
              chosenTeam = t;
            }
          });

          // Join
          if (!match.players.find(p => p.username === username)) {
            const pState = createPlayerState(username, chosenTeam, skinId);
            match.players.push(pState);
            session.matchId = matchId;
            session.team = chosenTeam;

            match.chat.push({
              id: `join_${username}_${Date.now()}`,
              senderName: "System",
              text: `👋 ${username} entrou na sala na Equipe ${chosenTeam.toUpperCase()}!`,
              timestamp: Date.now(),
              system: true
            });

            // Start countdown if multiple players join custom rooms
            if (match.status === "waiting" && match.players.length >= 2) {
              match.status = "starting";
              match.countdown = 10;
            }
          }

          ws.send(JSON.stringify({ type: "match:assigned", matchId, team: chosenTeam, match }));
          broadcastToMatch(matchId, { type: "match:update", match });
          break;
        }

        case "lobby:invite_friend": {
          const { from, friendUsername, matchId } = event.payload;
          const friendSocket = Object.values(activeSockets).find(s => s.username === friendUsername);
          if (friendSocket) {
            friendSocket.socket.send(JSON.stringify({
              type: "lobby:game_invite",
              from,
              matchId
            }));
          }
          break;
        }

        case "admin:command": {
          const session = activeSockets[userSessionSessionId];
          const userObj = session?.username ? usersDB[session.username.toLowerCase()] : null;
          if (!userObj || userObj.email !== 'lucasaraujocapistrano@gmail.com') {
            ws.send(JSON.stringify({ type: "lobby:error", error: "Acesso administrativo negado!" }));
            return;
          }

          const { commandType } = event.payload;
          let match = session.matchId ? activeMatches[session.matchId] : null;
          if (!match && Object.keys(activeMatches).length > 0) {
            match = Object.values(activeMatches)[0];
          }

          if (!match) {
            ws.send(JSON.stringify({ type: "lobby:error", error: "Nenhuma partida ativa encontrada no servidor!" }));
            return;
          }

          const matchId = match.id;
          const msgId = `admin_${Date.now()}`;

          if (commandType === "kick_player") {
            const { targetUser } = event.payload;
            match.players = match.players.filter(p => p.username !== targetUser);
            match.chat.push({
              id: msgId,
              senderName: "👑 ADMIN",
              text: `🚨 O Administrador BANIOU/EXPULSOU ${targetUser} da partida!`,
              timestamp: Date.now(),
              system: true
            });
            broadcastToMatch(matchId, { type: "match:update", match });
          } 
          else if (commandType === "mute_player") {
            const { targetUser } = event.payload;
            const targetPlayer = match.players.find(p => p.username === targetUser);
            if (targetPlayer) {
              targetPlayer.isMuted = !targetPlayer.isMuted;
              match.chat.push({
                id: msgId,
                senderName: "👑 ADMIN",
                text: `🔒 ${targetUser} foi ${targetPlayer.isMuted ? 'mutado' : 'desmutado'} pelo Administrador!`,
                timestamp: Date.now(),
                system: true
              });
              broadcastToMatch(matchId, { type: "match:update", match });
            }
          } 
          else if (commandType === "give_minerals") {
            const { targetUser } = event.payload;
            const targetPlayer = match.players.find(p => p.username === targetUser);
            if (targetPlayer) {
              targetPlayer.coins.iron += 100;
              targetPlayer.coins.gold += 50;
              targetPlayer.coins.diamond += 15;
              targetPlayer.coins.emerald += 5;
              match.chat.push({
                id: msgId,
                senderName: "👑 ADMIN",
                text: `🎁 Presente enviado! ${targetUser} recebeu 100 Ferro, 50 Ouro, 15 Diamantes, 5 Esmeraldas.`,
                timestamp: Date.now(),
                system: true
              });
              broadcastToMatch(matchId, { type: "match:update", match });
            }
          } 
          else if (commandType === "respawn_player") {
            const { targetUser } = event.payload;
            const targetPlayer = match.players.find(p => p.username === targetUser);
            if (targetPlayer && targetPlayer.isDead) {
              targetPlayer.isDead = false;
              targetPlayer.health = targetPlayer.maxHealth;
              targetPlayer.respawnTime = 0;
              const config = TEAM_CONFIG[targetPlayer.team] || TEAM_CONFIG['red'];
              targetPlayer.x = config.x;
              targetPlayer.y = -1;
              targetPlayer.z = config.z;
              match.chat.push({
                id: msgId,
                senderName: "👑 ADMIN",
                text: `✨ O Administrador RESSUSCITOU ${targetUser} instantaneamente!`,
                timestamp: Date.now(),
                system: true
              });
              broadcastToMatch(matchId, { type: "match:update", match });
            }
          }
          else if (commandType === "create_event") {
            const { eventName } = event.payload;
            let announceText = "";
            if (eventName === "sudden_death") {
              Object.keys(match.beds).forEach((teamName) => {
                match.beds[teamName as Team] = false;
              });
              announceText = "⚠️ MORTE SÚBITA INICIADA! Todas as camas foram destruídas e não há mais ressurgimento!";
            } else if (eventName === "emerald_rush") {
              match.players.forEach(p => {
                p.coins.emerald += 4;
              });
              announceText = "💚 CORRIDA DA ESMERALDA! Todos os jogadores ganharam +4 Esmeraldas!";
            } else if (eventName === "diamond_rush") {
              match.players.forEach(p => {
                p.coins.diamond += 8;
              });
              announceText = "💎 CHUVA DE DIAMANTES! Todos os jogadores ganharam +8 Diamantes!";
            } else if (eventName === "meteor_shower") {
              match.players.forEach(p => {
                if (!p.isDead) p.health = Math.max(10, p.health - 40);
              });
              announceText = "🔥 CHUVA DE METEOROS! Danos colaterais atingiram todos os jogadores!";
            } else {
              announceText = `📢 EVENTO GLOBAL: ${eventName.toUpperCase()}!`;
            }

            match.chat.push({
              id: msgId,
              senderName: "👑 EVENTO",
              text: announceText,
              timestamp: Date.now(),
              system: true
            });
            broadcastToMatch(matchId, { type: "match:update", match });
          }
          break;
        }

        // In-game mechanics
        case "game:move": {
          const session = activeSockets[userSessionSessionId];
          if (!session || !session.matchId) return;

          const match = activeMatches[session.matchId];
          if (!match) return;

          const player = match.players.find(p => p.username === session.username);
          if (player) {
            player.x = event.payload.x;
            player.y = event.payload.y;
            player.z = event.payload.z;
            player.rotY = event.payload.rotY;

            // Broadcast only delta pos to other players for responsive lag-free gameplay
            broadcastToMatch(session.matchId, {
              type: "game:player_moved",
              playerId: player.id,
              x: player.x,
              y: player.y,
              z: player.z,
              rotY: player.rotY
            });
          }
          break;
        }

        case "game:place_block": {
          const session = activeSockets[userSessionSessionId];
          if (!session || !session.matchId) return;

          const match = activeMatches[session.matchId];
          if (!match) return;

          const { x, y, z, type } = event.payload;
          const blockKey = `${x},${y},${z}`;

          const player = match.players.find(p => p.username === session.username);
          if (player) {
            if (!player.inventory) {
              player.inventory = {
                wool: 16, wood: 0, endstone: 0, obsidian: 0,
                stone_sword: false, iron_sword: false, diamond_sword: false,
                bow: false, arrow: 0, pickaxe: 0,
                speed_potion: 0, strength_potion: 0, invisible_potion: 0, healing_potion: 0
              };
            }

            const currentCount = player.inventory[type as 'wool' | 'wood' | 'endstone' | 'obsidian'] || 0;
            if (currentCount > 0) {
              player.inventory[type as 'wool' | 'wood' | 'endstone' | 'obsidian'] -= 1;

              if (Math.abs(x) < 200 && Math.abs(y) < 200 && Math.abs(z) < 200) {
                const block: VoxelBlock = { x, y, z, type, team: session.team };
                match.blocks[blockKey] = block;

                ws.send(JSON.stringify({
                  type: "game:inventory_updated",
                  inventory: player.inventory
                }));

                broadcastToMatch(session.matchId, {
                  type: "game:block_placed",
                  block,
                  blockKey
                });
              }
            }
          }
          break;
        }

        case "game:break_block": {
          const session = activeSockets[userSessionSessionId];
          if (!session || !session.matchId) return;

          const match = activeMatches[session.matchId];
          if (!match) return;

          const { x, y, z } = event.payload;
          const blockKey = `${x},${y},${z}`;

          const player = match.players.find(p => p.username === session.username);
          const block = match.blocks[blockKey];
          if (block && player) {
            // Check mining tool multiplier / haste
            let mineSpeedMultiplier = 1;
            if (match.teamUpgrades && session.team) {
              const teamUpgrades = match.teamUpgrades[session.team];
              if (teamUpgrades && teamUpgrades.haste > 0) {
                mineSpeedMultiplier += teamUpgrades.haste * 0.25; // 25% or 50% faster
              }
            }
            if (player.inventory && player.inventory.pickaxe > 0) {
              mineSpeedMultiplier += player.inventory.pickaxe * 0.5; // Up to +150% with diamond pickaxe
            }

            delete match.blocks[blockKey];

            // Drop source materials randomly back as coins or put wool/wood into inventory occasionally
            if (Math.random() < 0.25) {
              if (block.type === 'wood') player.coins.gold += 1;
              else if (block.type === 'endstone') player.coins.gold += 2;
              else if (block.type === 'obsidian') player.coins.diamond += 1;
            }

            broadcastToMatch(session.matchId, {
              type: "game:block_broken",
              x, y, z,
              blockKey
            });
          }
          break;
        }

        case "game:break_bed": {
          const session = activeSockets[userSessionSessionId];
          if (!session || !session.matchId) return;

          const match = activeMatches[session.matchId];
          if (!match) return;

          const { targetTeam } = event.payload;
          if (targetTeam === session.team) {
            return; // Can't destroy own bed
          }

          if (match.beds[targetTeam as Team]) {
            // Check if bed is defended by Alarm Trap
            if (match.teamUpgrades && match.teamUpgrades[targetTeam as Team]?.bedDefense > 0) {
              match.chat.push({
                id: `trap_alarm_${Date.now()}`,
                senderName: "ALERTA",
                text: `🚨 ARMADILHA DE CAMA DETECTADA! O INVASOR ${session.username.toUpperCase()} ESTÁ ATACANDO A CAMA DO TIME ${String(targetTeam).toUpperCase()}!`,
                timestamp: Date.now(),
                system: true
              });
            }

            match.beds[targetTeam as Team] = false;

            // Log beds destroyed in user stats for the breaker
            const breakerKey = session.username.toLowerCase();
            if (usersDB[breakerKey]) {
              usersDB[breakerKey].stats.bedsDestroyed += 1;
              saveUsers();
            }

            match.chat.push({
              id: `bed_break_${Date.now()}`,
              senderName: "System",
              text: `🛏️ Cama do Time ${String(targetTeam).toUpperCase()} foi destruída por ${session.username}! Eles não renascem mais!`,
              timestamp: Date.now(),
              system: true
            });

            // Remove bed voxels belonging to that team
            const teamPositions: Record<Team, [number, number]> = {
              red: [0, -35],
              blue: [0, 35],
              green: [35, 0],
              yellow: [-35, 0],
              cyan: [-25, 25],
              white: [25, 25],
              pink: [25, -25],
              gray: [-25, -25]
            };
            const [tx, tz] = teamPositions[targetTeam as Team];
            delete match.blocks[`${tx},-2,${tz-1}`];

            broadcastToMatch(session.matchId, {
              type: "game:bed_destroyed",
              team: targetTeam,
              match
            });
          }
          break;
        }

        case "game:attack": {
          const session = activeSockets[userSessionSessionId];
          if (!session || !session.matchId) return;

          const match = activeMatches[session.matchId];
          if (!match) return;

          const { targetName } = event.payload;
          const targetPlayer = match.players.find(p => p.username === targetName);
          const attacker = match.players.find(p => p.username === session.username);

          if (targetPlayer && attacker && !targetPlayer.isDead) {
            // Determine weapon base damage
            let baseDamage = 16;
            if (attacker.swordEquipped === 'stone') baseDamage = 22;
            else if (attacker.swordEquipped === 'iron') baseDamage = 30;
            else if (attacker.swordEquipped === 'diamond') baseDamage = 40;

            // Apply Team Sharpness
            if (match.teamUpgrades && session.team) {
              const upgrades = match.teamUpgrades[session.team];
              if (upgrades && upgrades.sharpness > 0) {
                baseDamage += 5; // Flat +5 damage
              }
            }

            // Apply Strength potion boost
            const now = Date.now();
            if (attacker.activeEffects && attacker.activeEffects.strength > now) {
              baseDamage = Math.floor(baseDamage * 1.5);
            }

            // Determine target protection level
            let protectionReduction = 0;
            if (match.teamUpgrades && targetPlayer.team) {
              const upgrades = match.teamUpgrades[targetPlayer.team];
              if (upgrades && upgrades.protection > 0) {
                protectionReduction = upgrades.protection * 0.10; // 10%, 20%, 30% reduction
              }
            }

            // Determine target armor reduction
            let armorReduction = 0;
            if (targetPlayer.hasArmor === 'chain') armorReduction = 0.15;
            else if (targetPlayer.hasArmor === 'iron') armorReduction = 0.30;
            else if (targetPlayer.hasArmor === 'diamond') armorReduction = 0.50;

            const finalReduction = Math.min(0.85, protectionReduction + armorReduction);
            const calculatedDamage = Math.max(1, Math.floor(baseDamage * (1 - finalReduction)));

            targetPlayer.health = Math.max(0, targetPlayer.health - calculatedDamage);

            if (targetPlayer.health <= 0) {
              targetPlayer.isDead = true;

              // Register Kill to Attacker Stats
              const attackerKey = session.username.toLowerCase();
              if (usersDB[attackerKey]) {
                usersDB[attackerKey].stats.kills += 1;
                saveUsers();
              }

              // Drop items on death inside BedWars - lose gold, emerald, wools, potions, arrows
              targetPlayer.coins = { iron: 0, gold: 0, diamond: 0, emerald: 0 };
              if (targetPlayer.inventory) {
                targetPlayer.inventory.wool = 0;
                targetPlayer.inventory.wood = 0;
                targetPlayer.inventory.endstone = 0;
                targetPlayer.inventory.obsidian = 0;
                targetPlayer.inventory.speed_potion = 0;
                targetPlayer.inventory.strength_potion = 0;
                targetPlayer.inventory.invisible_potion = 0;
                targetPlayer.inventory.healing_potion = 0;
                targetPlayer.inventory.arrow = 0;
                // Downgrade pickaxe
                targetPlayer.inventory.pickaxe = Math.max(0, targetPlayer.inventory.pickaxe - 1);
              }
              targetPlayer.swordEquipped = 'wood';
              targetPlayer.activeEffects = { speed: 0, strength: 0, invisibility: 0 };

              const hasBed = match.beds[targetPlayer.team];
              if (hasBed) {
                targetPlayer.respawnTime = 5; // Respawns in 5s
                match.chat.push({
                  id: `kill_${Date.now()}`,
                  senderName: "System",
                  text: `⚔️ ${targetPlayer.username} foi neutralizado por ${attacker.username}. Renasce em 5s!`,
                  timestamp: now,
                  system: true
                });
              } else {
                targetPlayer.respawnTime = -1; // Permanent death
                match.chat.push({
                  id: `kill_perm_${Date.now()}`,
                  senderName: "System",
                  text: `💀 ${targetPlayer.username} foi CRITICAMENTE ELIMINADO por ${attacker.username}! Sem cama viva!`,
                  timestamp: now,
                  system: true
                });
              }
            }

            broadcastToMatch(session.matchId, {
              type: "match:update",
              match
            });
          }
          break;
        }

        case "game:buy_item": {
          const session = activeSockets[userSessionSessionId];
          if (!session || !session.matchId) return;

          const match = activeMatches[session.matchId];
          if (!match) return;

          const { itemId, costType, costAmount } = event.payload;
          const player = match.players.find(p => p.username === session.username);

          if (player) {
            const currentCoins = player.coins[costType as keyof typeof player.coins];
            if (currentCoins >= costAmount) {
              // Deduct
              player.coins[costType as keyof typeof player.coins] -= costAmount;

              // Ensure inventory is initialized
              if (!player.inventory) {
                player.inventory = {
                  wool: 0, wood: 0, endstone: 0, obsidian: 0,
                  stone_sword: false, iron_sword: false, diamond_sword: false,
                  bow: false, arrow: 0, pickaxe: 0,
                  speed_potion: 0, strength_potion: 0, invisible_potion: 0, healing_potion: 0
                };
              }

              // Apply item upgrades
              if (itemId === "iron_armor") {
                player.hasArmor = "iron";
              } else if (itemId === "diamond_armor") {
                player.hasArmor = "diamond";
              } else if (itemId === "chain_armor") {
                player.hasArmor = "chain";
              } else if (itemId === "wool") {
                player.inventory.wool += 8;
              } else if (itemId === "wood") {
                player.inventory.wood += 4;
              } else if (itemId === "endstone") {
                player.inventory.endstone += 8;
              } else if (itemId === "obsidian") {
                player.inventory.obsidian += 2;
              } else if (itemId === "stone_sword") {
                player.inventory.stone_sword = true;
                player.swordEquipped = "stone";
              } else if (itemId === "iron_sword") {
                player.inventory.iron_sword = true;
                player.swordEquipped = "iron";
              } else if (itemId === "diamond_sword") {
                player.inventory.diamond_sword = true;
                player.swordEquipped = "diamond";
              } else if (itemId === "bow") {
                player.inventory.bow = true;
              } else if (itemId === "arrow") {
                player.inventory.arrow += 8;
              } else if (itemId === "pickaxe") {
                player.inventory.pickaxe = Math.min(3, player.inventory.pickaxe + 1);
              } else if (itemId === "speed_potion") {
                player.inventory.speed_potion += 1;
              } else if (itemId === "strength_potion") {
                player.inventory.strength_potion += 1;
              } else if (itemId === "invisible_potion") {
                player.inventory.invisible_potion += 1;
              } else if (itemId === "healing_potion") {
                player.inventory.healing_potion += 1;
              }

              ws.send(JSON.stringify({
                type: "game:buy_success",
                itemId,
                playerCoins: player.coins,
                inventory: player.inventory,
                swordEquipped: player.swordEquipped
              }));

              broadcastToMatch(session.matchId, {
                type: "match:update",
                match
              });
            }
          }
          break;
        }

        case "game:buy_upgrade": {
          const session = activeSockets[userSessionSessionId];
          if (!session || !session.matchId) return;

          const match = activeMatches[session.matchId];
          if (!match) return;

          const { upgradeType, costAmount } = event.payload;
          const player = match.players.find(p => p.username === session.username);

          if (player && session.team) {
            const currentDiamonds = player.coins.diamond;
            if (currentDiamonds >= costAmount) {
              player.coins.diamond -= costAmount;

              if (!match.teamUpgrades) {
                match.teamUpgrades = {
                  red: { sharpness: 0, protection: 0, haste: 0, bedDefense: 0 },
                  blue: { sharpness: 0, protection: 0, haste: 0, bedDefense: 0 },
                  green: { sharpness: 0, protection: 0, haste: 0, bedDefense: 0 },
                  yellow: { sharpness: 0, protection: 0, haste: 0, bedDefense: 0 },
                  cyan: { sharpness: 0, protection: 0, haste: 0, bedDefense: 0 },
                  white: { sharpness: 0, protection: 0, haste: 0, bedDefense: 0 },
                  pink: { sharpness: 0, protection: 0, haste: 0, bedDefense: 0 },
                  gray: { sharpness: 0, protection: 0, haste: 0, bedDefense: 0 }
                };
              }

              const teamUpgrades = match.teamUpgrades[session.team];
              let level = 0;
              if (upgradeType === 'sharpness' && teamUpgrades.sharpness < 1) {
                teamUpgrades.sharpness = 1;
                level = 1;
              } else if (upgradeType === 'protection' && teamUpgrades.protection < 3) {
                teamUpgrades.protection += 1;
                level = teamUpgrades.protection;
              } else if (upgradeType === 'haste' && teamUpgrades.haste < 2) {
                teamUpgrades.haste += 1;
                level = teamUpgrades.haste;
              } else if (upgradeType === 'bedDefense' && teamUpgrades.bedDefense < 1) {
                teamUpgrades.bedDefense = 1;
                level = 1;
              }

              match.chat.push({
                id: `upgrade_${Date.now()}`,
                senderName: "System",
                text: `✨ ${session.username} comprou upgrade: ${upgradeType.toUpperCase()} Nvl ${level} para o Time ${session.team.toUpperCase()}!`,
                timestamp: Date.now(),
                system: true
              });

              ws.send(JSON.stringify({
                type: "game:buy_upgrade_success",
                upgradeType,
                playerCoins: player.coins,
                teamUpgrades: match.teamUpgrades
              }));

              broadcastToMatch(session.matchId, {
                type: "match:update",
                match
              });
            }
          }
          break;
        }

        case "game:use_potion": {
          const session = activeSockets[userSessionSessionId];
          if (!session || !session.matchId) return;

          const match = activeMatches[session.matchId];
          if (!match) return;

          const { potionType } = event.payload;
          const player = match.players.find(p => p.username === session.username);

          if (player && player.inventory) {
            const hasPotion = player.inventory[`${potionType}_potion` as keyof typeof player.inventory];
            if (hasPotion && (hasPotion as number) > 0) {
              (player.inventory[`${potionType}_potion` as keyof typeof player.inventory] as number) -= 1;

              if (!player.activeEffects) {
                player.activeEffects = { speed: 0, strength: 0, invisibility: 0 };
              }

              const duration = 30000; // 30s
              const expiration = Date.now() + duration;

              if (potionType === "healing") {
                player.health = player.maxHealth;
                match.chat.push({
                  id: `heal_${Date.now()}`,
                  senderName: "System",
                  text: `🧪 ${session.username} usou Poção de Cura!`,
                  timestamp: Date.now(),
                  system: true
                });
              } else {
                player.activeEffects[potionType as 'speed' | 'strength' | 'invisibility'] = expiration;
                match.chat.push({
                  id: `pot_${Date.now()}`,
                  senderName: "System",
                  text: `🧪 ${session.username} bebeu Poção de ${potionType.toUpperCase()} (Efeito ativo por 30s)!`,
                  timestamp: Date.now(),
                  system: true
                });
              }

              ws.send(JSON.stringify({
                type: "game:potion_used",
                potionType,
                inventory: player.inventory,
                activeEffects: player.activeEffects
              }));

              broadcastToMatch(session.matchId, {
                type: "match:update",
                match
              });
            }
          }
          break;
        }

        case "game:claim_spawner_coins": {
          const session = activeSockets[userSessionSessionId];
          if (!session || !session.matchId) return;

          const match = activeMatches[session.matchId];
          if (!match) return;

          const { coinType, amount } = event.payload;
          const player = match.players.find(p => p.username === session.username);
          if (player && !player.isDead) {
            player.coins[coinType as keyof typeof player.coins] += amount;
            ws.send(JSON.stringify({
              type: "game:coins_updated",
              coins: player.coins
            }));
          }
          break;
        }

        case "chat:send": {
          const session = activeSockets[userSessionSessionId];
          if (!session || !session.matchId) return;

          const match = activeMatches[session.matchId];
          if (!match) return;

          const { text } = event.payload;
          const msg: ChatMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
            senderName: session.username,
            team: session.team,
            text,
            timestamp: Date.now(),
            system: false
          };

          match.chat.push(msg);
          if (match.chat.length > 50) match.chat.shift(); // Bound memory arrays

          broadcastToMatch(session.matchId, {
            type: "chat:message",
            message: msg
          });
          break;
        }

        case "game:emote": {
          const session = activeSockets[userSessionSessionId];
          if (!session || !session.matchId) return;

          const match = activeMatches[session.matchId];
          if (!match) return;

          const { emoteId, triggerText } = event.payload;

          const msg: ChatMessage = {
            id: `msg_${Date.now()}_em`,
            senderName: "EMOTE",
            team: session.team,
            text: `⭐ [EMOTE] ${session.username} ${triggerText}`,
            timestamp: Date.now(),
            system: true
          };

          match.chat.push(msg);
          if (match.chat.length > 50) match.chat.shift();

          broadcastToMatch(session.matchId, {
            type: "game:emote_broadcast",
            payload: {
              username: session.username,
              emoteId,
              text: `⭐ [EMOTE] ${session.username} ${triggerText}`
            }
          });
          break;
        }

        // Active micro-buffered Voice Chat Stream API over WebSocket
        case "game:voice_chunk": {
          const session = activeSockets[userSessionSessionId];
          if (!session || !session.matchId) return;

          const match = activeMatches[session.matchId];
          if (!match) return;

          // Re-broadcast raw audio base64 or PCM packets to other team members or match players
          match.players.forEach(p => {
            if (p.username !== session.username) {
              const pSock = activeSockets[p.id];
              if (pSock && pSock.socket.readyState === WebSocket.OPEN) {
                pSock.socket.send(JSON.stringify({
                  type: "game:voice_chunk_received",
                  fromUser: session.username,
                  audioData: event.payload.audioData // base64 encoded media stream
                }));
              }
            }
          });
          break;
        }

        case "game:voice_status": {
          const session = activeSockets[userSessionSessionId];
          if (!session || !session.matchId) return;

          const match = activeMatches[session.matchId];
          if (!match) return;

          const player = match.players.find(p => p.username === session.username);
          if (player) {
            player.isSpeaking = event.payload.isSpeaking;
            broadcastToMatch(session.matchId, {
              type: "game:voice_status_update",
              username: session.username,
              isSpeaking: player.isSpeaking
            });
          }
          break;
        }
      }
    } catch (e) {
      console.error("Failed to parse websocket message", e);
    }
  });

  // Client disconnecting from Websocket server
  ws.on("close", () => {
    const session = activeSockets[userSessionSessionId];
    if (session) {
      const { username, matchId } = session;
      console.log(`User ${username} session disconnected.`);

      // Remove from matchmaking queue
      const qIdx = matchmakingQueue.findIndex(q => q.socket === ws);
      if (qIdx !== -1) matchmakingQueue.splice(qIdx, 1);

      if (matchId) {
        const match = activeMatches[matchId];
        if (match) {
          // Remove player from lobby
          match.players = match.players.filter(p => p.username !== username);
          match.chat.push({
            id: `leave_${username}_${Date.now()}`,
            senderName: "System",
            text: `🏃 ${username} disconnected from match.`,
            timestamp: Date.now(),
            system: true
          });

          // Delete match if empty
          if (match.players.length === 0) {
            delete activeMatches[matchId];
          } else {
            broadcastToMatch(matchId, { type: "match:update", match });
          }
        }
      }
      delete activeSockets[userSessionSessionId];
    }
  });
});

function createPlayerState(username: string, team: Team, skinId = "steve"): PlayerState {
  const config = TEAM_CONFIG[team] || TEAM_CONFIG['red'];
  const spawnPos = { x: config.x, y: -1, z: config.z };

  const dbUser = usersDB[username.toLowerCase()];
  const finalSkin = dbUser ? dbUser.selectedSkin : skinId;
  const selectedCape = dbUser ? dbUser.selectedCape : "none";
  const selectedWings = dbUser ? dbUser.selectedWings : "none";
  const selectedHalo = dbUser ? dbUser.selectedHalo : "none";
  const selectedHat = dbUser ? dbUser.selectedHat : "none";

  return {
    id: username, // For simple mapping
    username,
    team,
    x: spawnPos.x,
    y: spawnPos.y,
    z: spawnPos.z,
    rotY: 0,
    isDead: false,
    respawnTime: 0,
    health: 100,
    maxHealth: 100,
    coins: { iron: 0, gold: 0, diamond: 0, emerald: 0 },
    hasArmor: "none",
    skinId: finalSkin,
    selectedCape,
    selectedWings,
    selectedHalo,
    selectedHat,
    isMuted: false,
    isSpeaking: false,
    swordEquipped: "wood",
    inventory: {
      wool: 16,
      wood: 0,
      endstone: 0,
      obsidian: 0,
      stone_sword: false,
      iron_sword: false,
      diamond_sword: false,
      bow: false,
      arrow: 0,
      pickaxe: 0,
      speed_potion: 0,
      strength_potion: 0,
      invisible_potion: 0,
      healing_potion: 0
    },
    activeEffects: {
      speed: 0,
      strength: 0,
      invisibility: 0
    }
  };
}

// Attach WebSocket server to Express HTTP upgrades
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
  if (pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Serve frontend assets in production or development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
