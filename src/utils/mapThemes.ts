export interface MapTheme {
  id: number;
  name: string;
  biome: 'forest' | 'city' | 'desert' | 'space' | 'ice' | 'nether' | 'castle' | 'candy' | 'ocean' | 'temple';
  skyColor: string;
  groundColor: string;
  accentColor: string;
  particleColor: string;
}

const BIOMES: { name: string; key: MapTheme['biome']; sky: string; ground: string; accent: string; particle: string }[] = [
  { name: 'Floresta', key: 'forest', sky: '#14532d', ground: '#15803d', accent: '#4ade80', particle: '#22c55e' },
  { name: 'Cidade', key: 'city', sky: '#0f172a', ground: '#1e293b', accent: '#a855f7', particle: '#ec4899' },
  { name: 'Castelo', key: 'castle', sky: '#18181b', ground: '#3f3f46', accent: '#e4e4e7', particle: '#71717a' },
  { name: 'Deserto', key: 'desert', sky: '#fef08a', ground: '#ca8a04', accent: '#eab308', particle: '#facc15' },
  { name: 'Espaço', key: 'space', sky: '#050515', ground: '#0f172a', accent: '#3b82f6', particle: '#ffffff' },
  { name: 'Geleira', key: 'ice', sky: '#e0f2fe', ground: '#38bdf8', accent: '#06b6d4', particle: '#e0f2fe' },
  { name: 'Inferno', key: 'nether', sky: '#450a0a', ground: '#991b1b', accent: '#f97316', particle: '#ef4444' },
  { name: 'Oceano', key: 'ocean', sky: '#082f49', ground: '#0284c7', accent: '#0ea5e9', particle: '#38bdf8' },
  { name: 'Mundo Doce', key: 'candy', sky: '#fdf2f8', ground: '#ec4899', accent: '#f472b6', particle: '#f472b6' },
  { name: 'Templo', key: 'temple', sky: '#1c1917', ground: '#78716c', accent: '#d97706', particle: '#f59e0b' }
];

const QUALIFIERS = [
  'Imperial',
  'Futurista',
  'Sombrio',
  'Sagrado',
  'Esquecido',
  'Celestial',
  'Tóxico',
  'Ancestral',
  'Luminoso',
  'Místico'
];

// Generates exactly 100 unique, beautiful map themes
export function getMapThemes(): MapTheme[] {
  const list: MapTheme[] = [];
  let id = 1;
  BIOMES.forEach(b => {
    QUALIFIERS.forEach(q => {
      list.push({
        id,
        name: `${b.name} ${q}`,
        biome: b.key,
        skyColor: b.sky,
        groundColor: b.ground,
        accentColor: b.accent,
        particleColor: b.particle
      });
      id++;
    });
  });
  return list;
}

export function getRandomMapTheme(): MapTheme {
  const themes = getMapThemes();
  const randomIndex = Math.floor(Math.random() * themes.length);
  return themes[randomIndex];
}
