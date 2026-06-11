export interface CustomSkin {
  id: string;
  name: string;
  price: number;
  color: string;
  skinHex: string;
  hairColor: string;
  eyeColor: string;
  rarity: 'COMUM' | 'RARO' | 'ÉPICO' | 'LENDÁRIO';
  views: number;
  likes: number;
  unlockedByDefault: boolean;
}

const PREFIXES = [
  'Gamer', 'Cyber', 'Sombrio', 'Celestial', 'PvP', 'Mega', 'Hyper', 'Infernal',
  'Galáctico', 'Neon', 'Cosmic', 'Retro', 'Ninja', 'Dourado', 'Congelado', 'Dragon',
  'Fênix', 'Steampunk', 'Cubic', 'Místico', 'Sábio', 'Ácido', 'Sombreado', 'Fantasma',
  'Alfa', 'Lendário', 'Vortex', 'Quântico', 'Pixel', 'Sônico', 'Glitch', 'Radiante'
];

const SUBJECTS = [
  'Guerreiro', 'Cavaleiro', 'Arqueiro', 'Hacker', 'Zumbi', 'Creeper', 'Enderman', 'Herobrine',
  'Steve', 'Alex', 'Agente', 'Cyborg', 'Mago', 'Explorador', 'Rei', 'Lorde', 'Assassino',
  'Pirata', 'Astronauta', 'Caçador', 'Ninja', 'Monstro', 'Slayer', 'Cientista', 'Demônio',
  'Anjo', 'Samurai', 'Viking', 'Gladiador', 'Projetado', 'General', 'Espectro'
];

const SUFFIXES = [
  'v1', 'v2', 'Pro', 'Ultra', 'YT', 'PvP', 'Mode', 'God', 'Elite', 'Soberano', 'X',
  'Infinite', 'Zero', 'Primal', 'Reborn', 'Dark', 'Light', 'Omega', 'Nova', 'VIP',
  'Hypixel', 'Lunar', 'BedWars', 'Toxic', 'Infernal', 'Frozen', 'Crystal', 'Supreme'
];

const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#14b8a6',
  '#94a3b8', '#a1a1aa', '#cbd5e1', '#e2e8f0', '#fb7185', '#38bdf8', '#c084fc', '#f472b6'
];

const HAIR_COLORS = ['#451a03', '#1e293b', '#f59e0b', '#78350f', '#eab308', '#ec4899', '#06b6d4', '#ffffff', '#10b981', '#3b82f6'];
const EYE_COLORS = ['#3b82f6', '#10b981', '#ca8a04', '#ef4444', '#ec4899', '#8b5cf6', '#ffffff', '#000000'];

// Generates deterministically any of the 10,000 skins
export function getCustomSkinById(id: string): CustomSkin {
  // Check default legacy skins first for compatibility
  if (id === 'steve') {
    return { id: 'steve', name: 'Original Miner', price: 0, color: '#3b82f6', skinHex: '#a1a1aa', hairColor: '#451a03', eyeColor: '#3b82f6', rarity: 'COMUM', views: 8430, likes: 2310, unlockedByDefault: true };
  }
  if (id === 'alex') {
    return { id: 'alex', name: 'Forest Runner', price: 100, color: '#10b981', skinHex: '#84cc16', hairColor: '#f59e0b', eyeColor: '#10b981', rarity: 'COMUM', views: 4230, likes: 1104, unlockedByDefault: true };
  }
  if (id === 'creeper') {
    return { id: 'creeper', name: 'Sizzling Sentry', price: 250, color: '#22c55e', skinHex: '#4ade80', hairColor: '#1e293b', eyeColor: '#ef4444', rarity: 'RARO', views: 9382, likes: 4529, unlockedByDefault: false };
  }
  if (id === 'cyber') {
    return { id: 'cyber', name: 'Voxel Cyborg', price: 500, color: '#a855f7', skinHex: '#c084fc', hairColor: '#06b6d4', eyeColor: '#ffffff', rarity: 'ÉPICO', views: 12903, likes: 8320, unlockedByDefault: false };
  }
  if (id === 'dragon') {
    return { id: 'dragon', name: 'Nether Drake', price: 1000, color: '#ef4444', skinHex: '#f87171', hairColor: '#1e293b', eyeColor: '#f59e0b', rarity: 'LENDÁRIO', views: 24059, likes: 18402, unlockedByDefault: false };
  }

  // Parse custom index
  const match = id.match(/^skin_(\d+)$/);
  const index = match ? parseInt(match[1], 10) : 1;

  // Predictable combinations using deterministic index math
  const prefIndex = (index * 17) % PREFIXES.length;
  const subIndex = (index * 31) % SUBJECTS.length;
  const suffIndex = (index * 79) % SUFFIXES.length;

  const prefix = PREFIXES[prefIndex];
  const subject = SUBJECTS[subIndex];
  const suffix = SUFFIXES[suffIndex];

  const name = `${prefix} ${subject} ${suffix}`;
  
  const colIndex1 = (index * 43) % COLORS.length;
  const colIndex2 = (index * 89) % COLORS.length;
  const color = COLORS[colIndex1];
  const skinHex = COLORS[colIndex2];

  const hairColor = HAIR_COLORS[(index * 97) % HAIR_COLORS.length];
  const eyeColor = EYE_COLORS[(index * 109) % EYE_COLORS.length];

  // Distribute rarities
  let rarity: CustomSkin['rarity'] = 'COMUM';
  let price = 200;
  if (index % 25 === 0) {
    rarity = 'LENDÁRIO';
    price = 3000;
  } else if (index % 10 === 0) {
    rarity = 'ÉPICO';
    price = 1500;
  } else if (index % 4 === 0) {
    rarity = 'RARO';
    price = 600;
  }

  // Beautiful stats
  const views = 150 + (index * 13) % 9500;
  const likes = Math.floor(views * (0.3 + (index % 50) / 100));

  return {
    id,
    name,
    price,
    color,
    skinHex,
    hairColor,
    eyeColor,
    rarity,
    views,
    likes,
    unlockedByDefault: index <= 5 || price === 0 // Give first few as unlocked by default too
  };
}

// Full search implementation for 10,000 skins
export function searchCustomSkins(
  query: string,
  page: number,
  pageSize: number,
  rarityFilter?: string
): { skins: CustomSkin[]; total: number } {
  const normalizedQuery = query.toLowerCase().trim();
  
  // We can filter without creating 10k items in memory! We just search over of indices and build matchings
  const matches: CustomSkin[] = [];
  
  // Let's add the legacy ones first
  const legacySkins = ['steve', 'alex', 'creeper', 'cyber', 'dragon'].map(id => getCustomSkinById(id));
  legacySkins.forEach(skin => {
    const matchesQuery = skin.name.toLowerCase().includes(normalizedQuery);
    const matchesRarity = !rarityFilter || skin.rarity === rarityFilter;
    if (matchesQuery && matchesRarity) {
      matches.push(skin);
    }
  });

  // Loop through 1 to 10000 to construct only elements we match, saving performance
  for (let i = 1; i <= 10000; i++) {
    const id = `skin_${i}`;
    const prefIndex = (i * 17) % PREFIXES.length;
    const subIndex = (i * 31) % SUBJECTS.length;
    const suffIndex = (i * 79) % SUFFIXES.length;
    
    const skinName = `${PREFIXES[prefIndex]} ${SUBJECTS[subIndex]} ${SUFFIXES[suffIndex]}`;
    
    const matchesQuery = !normalizedQuery || skinName.toLowerCase().includes(normalizedQuery);
    
    let rarity: CustomSkin['rarity'] = 'COMUM';
    if (i % 25 === 0) rarity = 'LENDÁRIO';
    else if (i % 10 === 0) rarity = 'ÉPICO';
    else if (i % 4 === 0) rarity = 'RARO';

    const matchesRarity = !rarityFilter || rarity === rarityFilter;

    if (matchesQuery && matchesRarity) {
      matches.push(getCustomSkinById(id));
      if (matches.length >= 250) { // Limit max search scan for safety & performance
        break;
      }
    }
  }

  const total = matches.length === 250 ? 500 : matches.length; // Approximate larger count if capped
  const start = (page - 1) * pageSize;
  const paginated = matches.slice(start, start + pageSize);

  return {
    skins: paginated,
    total: matches.length
  };
}
