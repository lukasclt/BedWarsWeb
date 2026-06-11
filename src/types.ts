export type Team = 'red' | 'blue' | 'green' | 'yellow' | 'cyan' | 'white' | 'pink' | 'gray';

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface PlayerInventory {
  wool: number;
  wood: number;
  endstone: number;
  obsidian: number;
  stone_sword: boolean;
  iron_sword: boolean;
  diamond_sword: boolean;
  bow: boolean;
  arrow: number;
  pickaxe: number; // 0=none, 1=wood, 2=iron, 3=diamond
  speed_potion: number;
  strength_potion: number;
  invisible_potion: number;
  healing_potion: number;
}

export interface PlayerState {
  id: string;
  username: string;
  team: Team;
  x: number;
  y: number;
  z: number;
  rotY: number;
  isDead: boolean;
  respawnTime: number; // in seconds, 0 if alive
  health: number;
  maxHealth: number;
  coins: {
    iron: number;
    gold: number;
    diamond: number;
    emerald: number;
  };
  hasArmor: 'none' | 'chain' | 'iron' | 'diamond';
  skinId: string;
  selectedCape?: string;
  selectedWings?: string;
  selectedHalo?: string;
  selectedHat?: string;
  activeEmote?: string;
  isMuted: boolean;
  isSpeaking: boolean;
  isBot?: boolean;
  inventory?: PlayerInventory;
  activeEffects?: {
    speed: number;       // expiration timestamp
    strength: number;    // expiration timestamp
    invisibility: number; // expiration timestamp
  };
  swordEquipped?: 'wood' | 'stone' | 'iron' | 'diamond';
}

export interface VoxelBlock {
  x: number;
  y: number;
  z: number;
  type: 'wool' | 'wood' | 'endstone' | 'obsidian';
  team?: Team; // For color-coding
}

export interface GeneratorState {
  id: string;
  type: 'iron' | 'gold' | 'diamond' | 'emerald';
  x: number;
  y: number;
  z: number;
  tier: number;
}

export interface TeamUpgrades {
  sharpness: number;   // 0, 1
  protection: number;  // 0, 1, 2, 3
  haste: number;       // 0, 1, 2
  bedDefense: number;  // 0, 1
}

export interface MatchState {
  id: string;
  status: 'waiting' | 'starting' | 'playing' | 'ended';
  countdown: number; // lobby countdown
  players: PlayerState[];
  beds: Record<Team, boolean>; // true = intact, false = broken
  blocks: Record<string, VoxelBlock>; // key: `${x},${y},${z}`
  generators: GeneratorState[];
  chat: ChatMessage[];
  winnerTeam?: Team | null;
  createdBy?: string;
  isPrivate?: boolean;
  teamUpgrades?: Record<Team, TeamUpgrades>;
  mode?: 'solo' | 'dupla' | 'trio' | 'quarteto';
  mapTheme?: string;
}

export interface ChatMessage {
  id: string;
  senderName: string;
  team?: Team;
  text: string;
  timestamp: number;
  system: boolean;
}

export interface UserStats {
  wins: number;
  losses: number;
  kills: number;
  bedsDestroyed: number;
  gamesPlayed: number;
}

export interface UserProfile {
  username: string;
  email: string;
  stats: UserStats;
  rankPoints: number;
  friends: string[]; // usernames
  pendingReceived: string[]; // usernames
  pendingSent: string[]; // usernames
  selectedSkin: string;
  coins?: number;
  selectedCape?: string;
  selectedWings?: string;
  selectedHalo?: string;
  selectedHat?: string;
  unlockedSkinIds?: string[];
  unlockedCosmetics?: string[];
  unlockedEmotes?: string[];
}

export const SKINS_LIST = [
  { id: 'steve', name: 'Original Miner', price: 0, color: '#3b82f6', skinHex: '#a1a1aa' },
  { id: 'alex', name: 'Forest Runner', price: 100, color: '#10b981', skinHex: '#84cc16' },
  { id: 'creeper', name: 'Sizzling Sentry', price: 250, color: '#22c55e', skinHex: '#4ade80' },
  { id: 'cyber', name: 'Voxel Cyborg', price: 500, color: '#a855f7', skinHex: '#c084fc' },
  { id: 'dragon', name: 'Nether Drake', price: 1000, color: '#ef4444', skinHex: '#f87171' },
];
