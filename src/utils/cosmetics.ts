export interface Cosmetic {
  id: string;
  name: string;
  type: 'cape' | 'wings' | 'halo' | 'hat';
  price: number;
  description: string;
  color: string;
  icon: string;
}

export interface Emote {
  id: string;
  name: string;
  price: number;
  description: string;
  icon: string;
  triggerText: string;
}

export const COSMETICS_LIST: Cosmetic[] = [
  { id: 'cape_red', name: '👑 Capa Imperial de Fogo', type: 'cape', price: 500, description: 'Capa brilhante vermelha digna dos reis de BedWars.', color: '#ef4444', icon: '🧣' },
  { id: 'cape_lunar', name: '🌙 Capa Lunar PvP Classic', type: 'cape', price: 900, description: 'Design clássico escuro do Lunar Client com detalhes celestes.', color: '#3b82f6', icon: '🧣' },
  { id: 'wings_neon', name: '⚡ Asas de Dragão Neon', type: 'wings', price: 1500, description: 'Asas holográficas que piscam enquanto você se move pela ponte.', color: '#a855f7', icon: '🦅' },
  { id: 'wings_angel', name: '🌸 Asas de Anjo Sagrado', type: 'wings', price: 2000, description: 'Asas brancas imaculadas para os anfitriões celestiais.', color: '#ffffff', icon: '👼' },
  { id: 'halo_gold', name: '✨ Halo de Campeão Dourado', type: 'halo', price: 1200, description: 'Um anel luminoso que flutua elegantemente sobre sua cabeça.', color: '#eab308', icon: '😇' },
  { id: 'hat_crown', name: '💎 Coroa Real de Diamante', type: 'hat', price: 2500, description: 'Destaque-se como o maior destruidor de camas com a coroa lendária.', color: '#06b6d4', icon: '👑' }
];

export const EMOTES_LIST: Emote[] = [
  { id: 'wave', name: 'Aceno Amigável', price: 0, description: 'Mande um tchauzinho para os seus oponentes.', icon: '👋', triggerText: 'acenou para todos!' },
  { id: 'dab', name: 'Dab Lendário', price: 250, description: 'Comemore sua kill ou destruição de cama com um dab insano!', icon: '🕺', triggerText: 'lançou um DAB supremo!' },
  { id: 'dance', name: 'Dança da Vitória', price: 600, description: 'Festa e dancinha para zombar ou celebrar no lobby.', icon: '🎶', triggerText: 'está mandando uma dancinha de vitória!' },
  { id: 'spin', name: 'Giro do Pião', price: 300, description: 'Gira sem parar para mostrar sua agilidade!', icon: '🌀', triggerText: 'começou a rodopiar feito um pião louco!' },
  { id: 'salute', name: 'Continência', price: 150, description: 'Preste respeito aos adversários caídos de forma militar.', icon: '🫡', triggerText: 'prestou continência de respeito.' },
  { id: 'facepalm', name: 'Mão na Testa', price: 200, description: 'Lamente a jogada inacreditável que acabou de acontecer.', icon: '🤦', triggerText: 'colocou a mão na testa com pena!' },
  { id: 't_pose', name: 'T-Pose Dominator', price: 400, description: 'Imponha dominância rígida e assuste os atacantes!', icon: '🧍', triggerText: 'ergueu os braços em T-POSE para dominar!' }
];
