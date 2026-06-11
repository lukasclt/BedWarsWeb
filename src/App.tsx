import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MatchState,
  Team,
  UserProfile,
  SKINS_LIST,
  ChatMessage,
  GeneratorState
} from './types';
import GameCanvas from './components/GameCanvas';
import { VoiceChatManager } from './utils/voice';
import { playAudio } from './utils/audio';
import { getCustomSkinById, searchCustomSkins, CustomSkin } from './utils/skinDatabase';
import { COSMETICS_LIST, EMOTES_LIST, Cosmetic, Emote } from './utils/cosmetics';
import {
  Sword,
  Shield,
  Users,
  UserPlus,
  Tv,
  Crown,
  Volume2,
  VolumeX,
  Plus,
  Send,
  ShoppingBag,
  Trash2,
  LogOut,
  Sparkles,
  Gamepad2,
  Lock,
  MessageSquare,
  X,
  Play,
  ShieldCheck,
  Search,
  Coins,
  Gift,
  RefreshCw,
  Smile,
  Shirt,
  Trophy
} from 'lucide-react';

const TEAM_NAMES_PT: Record<Team, string> = {
  red: 'Vermelho',
  blue: 'Azul',
  green: 'Verde',
  yellow: 'Amarelo',
  cyan: 'Aqua/Ciano',
  white: 'Branco',
  pink: 'Rosa',
  gray: 'Cinza'
};

const TEAM_BADGES_X: Record<Team, string> = {
  red: 'bg-red-500/10 text-red-400 border border-red-500/35 font-black',
  blue: 'bg-blue-500/10 text-blue-400 border border-blue-500/35 font-black',
  green: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/35 font-black',
  yellow: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/35 font-black',
  cyan: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/35 font-black',
  white: 'bg-white/10 text-white border border-white/35 font-black',
  pink: 'bg-pink-500/10 text-pink-400 border border-pink-500/35 font-black',
  gray: 'bg-gray-500/10 text-gray-400 border border-gray-500/35 font-black'
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'play' | 'skins' | 'friends' | 'leaderboard' | 'admin'>('play');
  const [selectedSubTab, setSelectedSubTab] = useState<'skins' | 'cosmetics' | 'emotes'>('skins');
  const [skinSearchQuery, setSkinSearchQuery] = useState('');
  const [skinRarityFilter, setSkinRarityFilter] = useState('');
  const [skinPage, setSkinPage] = useState(1);
  const [dailyClaimLoading, setDailyClaimLoading] = useState(false);
  const [customizerFeedback, setCustomizerFeedback] = useState<string | null>(null);
  const [spinningModel, setSpinningModel] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'solo' | 'dupla' | 'trio' | 'quarteto'>('solo');
  
  // User/Auth state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  // Matchmaking & Game room state
  const [matchId, setMatchId] = useState<string | null>(null);
  const [myTeam, setMyTeam] = useState<Team>('red');
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [isQueued, setIsQueued] = useState(false);
  const [availableLobbies, setAvailableLobbies] = useState<Array<{ id: string; playersCount: number; status: string }>>([]);
  const [friendInput, setFriendInput] = useState('');
  const [invitations, setInvitations] = useState<Array<{ from: string; matchId: string }>>([]);

  // In-game merchant shop state
  const [shopOpen, setShopOpen] = useState(false);
  const [shopTab, setShopTab] = useState<'items' | 'upgrades'>('items');

  // In-game client coins budget state
  const [coins, setCoins] = useState({ iron: 0, gold: 0, diamond: 0, emerald: 0 });

  // Player Inventory and Active temporary potion effects
  const [playerInventory, setPlayerInventory] = useState<any>({
    wool: 16, wood: 0, endstone: 0, obsidian: 0,
    stone_sword: false, iron_sword: false, diamond_sword: false,
    bow: false, arrow: 0, pickaxe: 0,
    speed_potion: 0, strength_potion: 0, invisible_potion: 0, healing_potion: 0
  });
  const [activeEffects, setActiveEffects] = useState({ speed: 0, strength: 0, invisibility: 0 });
  const [serverStatus, setServerStatus] = useState<any>(null);

  useEffect(() => {
    const fetchServerStatus = async () => {
      try {
        const resp = await fetch('/api/server-status');
        const data = await resp.json();
        if (data && data.status) {
          setServerStatus(data);
        }
      } catch (e) {
        console.error("Failed to fetch server status", e);
      }
    };
    fetchServerStatus();
    const statusInterval = setInterval(fetchServerStatus, 5000);
    return () => clearInterval(statusInterval);
  }, []);

  // Voice Chat state
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isSpeakingLocally, setIsSpeakingLocally] = useState(false);

  // Friends status list state
  const [friendsList, setFriendsList] = useState<Array<{ username: string; online: boolean; selectedSkin: string }>>([]);
  const [pendingReceived, setPendingReceived] = useState<string[]>([]);
  const [leaderboard, setLeaderboard] = useState<Array<{ username: string; rankPoints: number; stats: any }>>([]);

  // Socket & Voice Managers
  const socketRef = useRef<WebSocket | null>(null);
  const voiceChatRef = useRef<VoiceChatManager | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [chatInput, setChatInput] = useState('');

  // Handle WebSocket Connection
  const connectWebSocket = (username: string, skinId: string) => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // Authenticate socket
      ws.send(JSON.stringify({
        type: 'auth',
        payload: { username, skinId }
      }));

      // Set up voice manager
      voiceChatRef.current = new VoiceChatManager(ws);
    };

    ws.onmessage = (eventStr) => {
      try {
        const event = JSON.parse(eventStr.data);

        switch (event.type) {
          case 'auth:success':
            // Fetch initial friends
            ws.send(JSON.stringify({
              type: 'friends:get_list',
              payload: { username }
            }));
            // Query custom rooms
            ws.send(JSON.stringify({ type: 'lobby:get_available' }));
            break;

          case 'friends:list':
            setFriendsList(event.friends);
            setPendingReceived(event.pendingReceived || []);
            break;

          case 'friends:invite_sent':
            if (event.success) {
              setInfoText('Friend request sent!');
              // Refresh
              ws.send(JSON.stringify({ type: 'friends:get_list', payload: { username } }));
            } else {
              setErrorText(event.error || 'Request failed.');
            }
            break;

          case 'friends:new_invite':
            setInfoText(`New friend request received from ${event.from}!`);
            ws.send(JSON.stringify({ type: 'friends:get_list', payload: { username } }));
            break;

          case 'friends:action_complete':
            ws.send(JSON.stringify({ type: 'friends:get_list', payload: { username } }));
            break;

          case 'lobby:created':
            // Automatically redirect to our custom private lobby
            setMatchId(event.matchId);
            ws.send(JSON.stringify({
              type: 'lobby:join',
              payload: { matchId: event.matchId, username, skinId }
            }));
            break;

          case 'lobby:list':
            setAvailableLobbies(event.lobbies);
            break;

          case 'lobby:game_invite':
            setInvitations(prev => [...prev.filter(inv => inv.matchId !== event.matchId), { from: event.from, matchId: event.matchId }]);
            break;

          case 'matchmaking:queued':
            setIsQueued(event.success);
            break;

          case 'match:assigned':
            setMatchId(event.matchId);
            setMyTeam(event.team);
            setMatchState(event.match);
            const localPlayer = event.match.players.find((p: any) => p.username === username);
            if (localPlayer) {
              setCoins(localPlayer.coins);
              if (localPlayer.inventory) {
                setPlayerInventory(localPlayer.inventory);
              }
              if (localPlayer.activeEffects) {
                setActiveEffects(localPlayer.activeEffects);
              }
            }
            break;

          case 'match:update':
            setMatchState(event.match);
            const ply = event.match.players.find((p: any) => p.username === username);
            if (ply) {
              setCoins(ply.coins);
              if (ply.inventory) {
                setPlayerInventory(ply.inventory);
              }
              if (ply.activeEffects) {
                setActiveEffects(ply.activeEffects);
              }
            }
            if (event.match.status === 'ended') {
              playAudio.playVictory();
              // Auto release UI overlays
              setShopOpen(false);
            }
            break;

          case 'lobby:error':
            setErrorText(event.error);
            break;

          case 'chat:message':
            setMatchState(prev => {
              if (!prev) return null;
              return {
                ...prev,
                chat: [...prev.chat, event.message]
              };
            });
            break;

          case 'game:block_placed':
            setMatchState(prev => {
              if (!prev) return null;
              return {
                ...prev,
                blocks: {
                  ...prev.blocks,
                  [event.blockKey]: event.block
                }
              };
            });
            break;

          case 'game:block_broken':
            setMatchState(prev => {
              if (!prev) return null;
              const nextBlocks = { ...prev.blocks };
              delete nextBlocks[event.blockKey];
              return {
                ...prev,
                blocks: nextBlocks
              };
            });
            break;

          case 'game:bed_destroyed':
            setMatchState(event.match);
            break;

          case 'game:coins_updated':
            setCoins(event.coins);
            break;

          case 'game:buy_success':
            setCoins(event.playerCoins);
            if (event.inventory) {
              setPlayerInventory(event.inventory);
            }
            break;

          case 'game:buy_upgrade_success':
            setCoins(event.playerCoins);
            if (event.teamUpgrades) {
              setMatchState(prev => {
                if (!prev) return null;
                return { ...prev, teamUpgrades: event.teamUpgrades };
              });
            }
            break;

          case 'game:potion_used':
            if (event.inventory) {
              setPlayerInventory(event.inventory);
            }
            if (event.activeEffects) {
              setActiveEffects(event.activeEffects);
            }
            break;

          case 'game:inventory_updated':
            if (event.inventory) {
              setPlayerInventory(event.inventory);
            }
            break;

          case 'game:voice_chunk_received':
            if (voiceChatRef.current && voiceEnabled) {
              voiceChatRef.current.playIncomingChunk(event.fromUser, event.audioData);
            }
            break;

          case 'game:voice_status_update':
            // update player voice nodes visualizer statuses
            setMatchState(prev => {
              if (!prev) return null;
              return {
                ...prev,
                players: prev.players.map(p =>
                  p.username === event.username ? { ...p, isSpeaking: event.isSpeaking } : p
                )
              };
            });
            break;
        }
      } catch (e) {
        console.error('Error dealing with incoming socket event', e);
      }
    };

    socketRef.current = ws;
  };

  // On Login success
  const onLoginSuccess = (profile: UserProfile) => {
    setCurrentUser(profile);
    setErrorText(null);
    connectWebSocket(profile.username, profile.selectedSkin);
    fetchLeaderboard();
  };

  const attemptRegister = async () => {
    setErrorText(null);
    try {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: regUsername, email: regEmail, password: regPassword })
      });
      const data = await resp.json();
      if (data.success) {
        onLoginSuccess(data.user);
      } else {
        setErrorText(data.error || 'Registration failed.');
      }
    } catch (e) {
      setErrorText('Connection error');
    }
  };

  const attemptLogin = async () => {
    setErrorText(null);
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await resp.json();
      if (data.success) {
        onLoginSuccess(data.user);
      } else {
        setErrorText(data.error || 'Invalid credentials.');
      }
    } catch (e) {
      setErrorText('Connection error');
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const resp = await fetch('/api/leaderboard');
      const data = await resp.json();
      setLeaderboard(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectSkin = async (skinId: string) => {
    if (!currentUser) return;
    const isUnlocked = currentUser.unlockedSkinIds?.includes(skinId) || skinId === 'steve' || skinId === 'alex';
    if (!isUnlocked) {
      setCustomizerFeedback("Você precisa desbloquear esta skin primeiro!");
      setTimeout(() => setCustomizerFeedback(null), 3500);
      return;
    }

    try {
      const resp = await fetch('/api/profile/skin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username, skinId })
      });
      const data = await resp.json();
      if (data.success) {
        setCurrentUser(prev => prev ? { ...prev, selectedSkin: skinId } : null);
        playAudio.playBuy();
        setCustomizerFeedback("Sua skin selecionada foi equipada!");
        setTimeout(() => setCustomizerFeedback(null), 3000);
        
        // Inform active socket of skin update
        socketRef.current?.send(JSON.stringify({
          type: 'auth',
          payload: { username: currentUser.username, skinId }
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDailyClaim = async () => {
    if (!currentUser) return;
    setDailyClaimLoading(true);
    try {
      const resp = await fetch('/api/profile/daily-coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username })
      });
      const data = await resp.json();
      if (data.success) {
        setCurrentUser(data.user);
        playAudio.playPickup(); // coin play sound
        setCustomizerFeedback("BÔNUS! Você coletou +500 Moedas!");
        setTimeout(() => setCustomizerFeedback(null), 4000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDailyClaimLoading(false);
    }
  };

  const handleUnlockSkin = async (skinId: string, price: number) => {
    if (!currentUser) return;
    if ((currentUser.coins || 0) < price) {
      setCustomizerFeedback("Moedas insuficientes para desbloquear!");
      setTimeout(() => setCustomizerFeedback(null), 3000);
      return;
    }

    try {
      const resp = await fetch('/api/profile/unlock-skin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username, skinId, price })
      });
      const data = await resp.json();
      if (data.success) {
        setCurrentUser(data.user);
        playAudio.playBuy();
        setCustomizerFeedback("Skin desbloqueada com sucesso! Clique em Equipar.");
        setTimeout(() => setCustomizerFeedback(null), 3000);
      } else {
        setCustomizerFeedback(data.error || "Erro ao desbloquear skin");
        setTimeout(() => setCustomizerFeedback(null), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnlockCosmetic = async (cosmeticId: string, price: number) => {
    if (!currentUser) return;
    if ((currentUser.coins || 0) < price) {
      setCustomizerFeedback("Moedas insuficientes!");
      setTimeout(() => setCustomizerFeedback(null), 3000);
      return;
    }

    try {
      const resp = await fetch('/api/profile/unlock-cosmetic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username, cosmeticId, price })
      });
      const data = await resp.json();
      if (data.success) {
        setCurrentUser(data.user);
        playAudio.playBuy();
        setCustomizerFeedback("Cosmético de Luxo desbloqueado!");
        setTimeout(() => setCustomizerFeedback(null), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnlockEmote = async (emoteId: string, price: number) => {
    if (!currentUser) return;
    if ((currentUser.coins || 0) < price) {
      setCustomizerFeedback("Moedas insuficientes!");
      setTimeout(() => setCustomizerFeedback(null), 3000);
      return;
    }

    try {
      const resp = await fetch('/api/profile/unlock-emote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username, emoteId, price })
      });
      const data = await resp.json();
      if (data.success) {
        setCurrentUser(data.user);
        playAudio.playBuy();
        setCustomizerFeedback("Emote Lunar desbloqueado com sucesso!");
        setTimeout(() => setCustomizerFeedback(null), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleEquipCosmetic = async (type: 'cape' | 'wings' | 'halo' | 'hat', cosmeticId: string) => {
    if (!currentUser) return;
    try {
      const resp = await fetch('/api/profile/equip-cosmetic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username, type, cosmeticId })
      });
      const data = await resp.json();
      if (data.success) {
        setCurrentUser(data.user);
        playAudio.playBuy();
        setCustomizerFeedback(`Cosmético (${type.toUpperCase()}) equipado com sucesso!`);
        setTimeout(() => setCustomizerFeedback(null), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleTriggerEmote = (emoteId: string, triggerText: string) => {
    if (!currentUser) return;
    socketRef.current?.send(JSON.stringify({
      type: 'game:emote',
      payload: { emoteId, triggerText }
    }));
    playAudio.playBedBreak(); // play funny sound
    setCustomizerFeedback(`Você ativou o emote: ${triggerText}`);
    setTimeout(() => setCustomizerFeedback(null), 3000);
  };

  const sendFriendInvite = () => {
    if (!currentUser || !friendInput.trim()) return;
    socketRef.current?.send(JSON.stringify({
      type: 'friends:send_invite',
      payload: { from: currentUser.username, to: friendInput.trim() }
    }));
    setFriendInput('');
  };

  const acceptFriendReward = (friendName: string) => {
    if (!currentUser) return;
    socketRef.current?.send(JSON.stringify({
      type: 'friends:accept_invite',
      payload: { username: currentUser.username, fromFriend: friendName }
    }));
  };

  // Toggle dynamic voice recording loops
  const toggleVoice = () => {
    if (!voiceChatRef.current) return;
    const nextVal = !voiceEnabled;
    setVoiceEnabled(nextVal);

    if (nextVal) {
      voiceChatRef.current.startRecording(
        () => {
          setIsSpeakingLocally(true);
          // Sync speaking state
          socketRef.current?.send(JSON.stringify({
            type: 'game:voice_status',
            payload: { isSpeaking: true }
          }));
          setTimeout(() => {
            setIsSpeakingLocally(false);
            socketRef.current?.send(JSON.stringify({
              type: 'game:voice_status',
              payload: { isSpeaking: false }
            }));
          }, 600);
        },
        () => {
          setVoiceEnabled(false);
          setErrorText('Falha ao capturar o microfone. Verifique as permissões!');
        }
      );
    } else {
      voiceChatRef.current.stopRecording();
      setIsSpeakingLocally(false);
    }
  };

  // Send textual chat message
  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.send(JSON.stringify({
      type: 'chat:send',
      payload: { text: chatInput.trim() }
    }));
    setChatInput('');
  };

  // Join public Matchmaker
  const startMatchmaking = () => {
    socketRef.current?.send(JSON.stringify({
      type: 'matchmaking:join',
      payload: { mode: selectedMode }
    }));
  };

  const leaveMatchmaking = () => {
    socketRef.current?.send(JSON.stringify({
      type: 'matchmaking:leave'
    }));
  };

  const startPrivateLobby = () => {
    if (!currentUser) return;
    socketRef.current?.send(JSON.stringify({
      type: 'lobby:create_private',
      payload: { username: currentUser.username, mode: selectedMode }
    }));
  };

  const acceptGameInvite = (mId: string) => {
    if (!currentUser) return;
    setMatchId(mId);
    socketRef.current?.send(JSON.stringify({
      type: 'lobby:join',
      payload: { matchId: mId, username: currentUser.username, skinId: currentUser.selectedSkin }
    }));
    setInvitations(prev => prev.filter(inv => inv.matchId !== mId));
  };

  // Purchase items from the active in-game Shopkeeper
  const buyShopItem = (itemId: string, costType: 'iron' | 'gold' | 'diamond' | 'emerald', costAmount: number) => {
    if (!socketRef.current) return;
    const currentBalance = coins[costType];
    if (currentBalance >= costAmount) {
      playAudio.playBuy();
      socketRef.current.send(JSON.stringify({
        type: 'game:buy_item',
        payload: { itemId, costType, costAmount }
      }));
    } else {
      setErrorText(`Minerais insuficientes! Requer ${costAmount} ${costType}.`);
      setTimeout(() => setErrorText(null), 2500);
    }
  };

  // Purchase Base/Team Upgrades
  const buyShopUpgrade = (upgradeType: string, costAmount: number) => {
    if (!socketRef.current) return;
    const currentBalance = coins.diamond;
    if (currentBalance >= costAmount) {
      playAudio.playBuy();
      socketRef.current.send(JSON.stringify({
        type: 'game:buy_upgrade',
        payload: { upgradeType, costAmount }
      }));
    } else {
      setErrorText(`Diamantes insuficientes! Requer ${costAmount} diamantes.`);
      setTimeout(() => setErrorText(null), 2500);
    }
  };

  // Use consumable Potion
  const usePotion = (potionType: string) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({
      type: 'game:use_potion',
      payload: { potionType }
    }));
  };

  // Scroll chat bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [matchState?.chat]);
  return (
    <div className="min-h-screen bg-indigo-950 text-white font-sans flex flex-col relative overflow-hidden antialiased selection:bg-yellow-400 selection:text-indigo-950">
      {/* Radial DOT backdrop pattern */}
      <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
      
      {/* Upper Navigation Bar */}
      <header className="h-16 bg-black/40 backdrop-blur-md border-b border-white/10 px-6 flex items-center justify-between shadow-xl z-20 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-yellow-400 rounded-sm shadow-[4px_4px_0px_0px_rgba(180,130,0,1)] flex items-center justify-center shrink-0">
            <div className="w-6 h-4 bg-red-600 rounded-sm flex items-center justify-center">
              <Sword className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <span className="text-2xl font-black tracking-tighter italic text-white">BEDWARS<span className="text-yellow-400">WEB</span></span>
          <span className="text-xs text-white/50 font-mono hidden md:inline ml-2">Voxel Indie Arena</span>
        </div>

        {/* Dynamic Live Server Status Badge */}
        {serverStatus && (
          <div className="hidden lg:flex items-center gap-2 px-3.5 py-1 bg-green-500/10 border border-emerald-500/25 rounded-full text-[10px] font-bold text-emerald-400 font-mono tracking-wide z-10 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>ONLINE</span>
            <span className="text-white/40">|</span>
            <span className="text-white/70">Uptime: {serverStatus.uptime}</span>
            <span className="text-white/40">|</span>
            <span className="text-white/70">Salas: {serverStatus.totalMatches}</span>
            <span className="text-white/40">|</span>
            <span className="text-white/70">Sockets: {serverStatus.connectedClients}</span>
          </div>
        )}

        {currentUser && (
          <div className="flex items-center gap-3 md:gap-4">
            <div className="flex items-center bg-black/25 rounded-full px-3 py-1 space-x-3 text-xs md:text-sm">
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full" />
                <span className="font-bold font-mono">{currentUser.stats.wins} Wins</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 bg-blue-400 rounded-full" />
                <span className="font-bold font-mono">{currentUser.stats.kills} Kills</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 border-l border-white/10 pl-3 md:pl-4">
              <div className="text-right leading-tight hidden sm:block">
                <p className="text-[10px] text-white/60">Rank Points</p>
                <p className="text-sm font-bold text-white font-mono">{currentUser.rankPoints} RP</p>
              </div>
              
              <div className="w-10 h-10 bg-gradient-to-tr from-purple-500 to-pink-500 rounded-lg border-2 border-white/20 flex items-center justify-center font-black text-white text-sm select-none">
                {currentUser.username.substring(0, 2).toUpperCase()}
              </div>
            </div>

            <button
              onClick={() => {
                socketRef.current?.close();
                setCurrentUser(null);
                setMatchState(null);
                setMatchId(null);
              }}
              className="bg-white/10 hover:bg-white/20 text-red-300 hover:text-red-100 p-2 rounded-lg border border-white/15 transition shrink-0"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </header>

      {/* Main Container Screen */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6 relative z-10">
        
        {/* Banner Alert Prompts */}
        <AnimatePresence>
          {errorText && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-red-950/80 border-2 border-red-500/50 text-red-100 p-4 rounded-xl flex items-center justify-between shadow-lg"
            >
              <span className="text-xs font-semibold">{errorText}</span>
              <button onClick={() => setErrorText(null)} className="text-red-300 hover:text-white"><X className="w-5 h-5" /></button>
            </motion.div>
          )}

          {infoText && (
            <motion.div
              initial={{ opacity: 0, y: -25 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-emerald-950/80 border-2 border-emerald-500/50 text-emerald-100 p-4 rounded-xl flex items-center justify-between shadow-lg"
            >
              <span className="text-xs font-semibold">{infoText}</span>
              <button onClick={() => setInfoText(null)} className="text-emerald-300 hover:text-white"><X className="w-5 h-5" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 1. Unauthenticated Login/Register Layout */}
        {!currentUser ? (
          <div className="flex-1 flex items-center justify-center py-6 md:py-10">
            <div className="w-full max-w-md bg-black/45 backdrop-blur-md border border-white/15 p-8 rounded-3xl shadow-2xl flex flex-col gap-6">
              
              {/* Logo display */}
              <div className="text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg border-2 border-yellow-300 transform rotate-12 mb-4">
                  <Gamepad2 className="w-8 h-8 text-black" />
                </div>
                <h1 className="text-3xl font-black text-white tracking-tight italic">BEDWARS<span className="text-yellow-400">WEB</span></h1>
                <p className="text-white/60 text-xs mt-1">Conecte-se para lutar e proteger sua cama</p>
              </div>

              {/* Toggle tabs */}
              <div className="grid grid-cols-2 bg-black/30 p-1.5 rounded-xl border border-white/10">
                <button
                  onClick={() => setIsRegistering(false)}
                  className={`py-2 text-sm font-bold rounded-lg transition-all ${!isRegistering ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'}`}
                >
                  Entrar
                </button>
                <button
                  onClick={() => setIsRegistering(true)}
                  className={`py-2 text-sm font-bold rounded-lg transition-all ${isRegistering ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'}`}
                >
                  Registrar
                </button>
              </div>

              {/* Forms */}
              {!isRegistering ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-white/70 font-bold uppercase tracking-wider">Nome de Usuário</label>
                    <input
                      type="text"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="Ex: Steve007"
                      className="bg-black/35 border border-white/10 p-3 rounded-xl text-white font-semibold focus:outline-none focus:border-yellow-400 transition"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-white/70 font-bold uppercase tracking-wider">Senha</label>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Sua senha secreta"
                      className="bg-black/35 border border-white/10 p-3 rounded-xl text-white font-semibold focus:outline-none focus:border-yellow-400 transition"
                    />
                  </div>
                  <button
                    onClick={attemptLogin}
                    className="w-full mt-2 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black py-3 px-4 rounded-xl shadow-[0px_4px_0px_0px_rgba(180,130,0,1)] hover:translate-y-[2px] hover:shadow-[0px_2px_0px_0px_rgba(180,130,0,1)] active:translate-y-[4px] active:shadow-none transition-all uppercase tracking-wider text-sm"
                  >
                    Batalhar Agora ➔
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-white/70 font-bold uppercase tracking-wider">Nome de Usuário</label>
                    <input
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="Ex: AlexGamer"
                      className="bg-black/35 border border-white/10 p-3 rounded-xl text-white font-semibold focus:outline-none focus:border-yellow-400 transition"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-white/70 font-bold uppercase tracking-wider">E-mail</label>
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="nome@provedor.com"
                      className="bg-black/35 border border-white/10 p-3 rounded-xl text-white font-semibold focus:outline-none focus:border-yellow-400 transition"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-white/70 font-bold uppercase tracking-wider">Senha</label>
                    <input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="bg-black/35 border border-white/10 p-3 rounded-xl text-white font-semibold focus:outline-none focus:border-yellow-400 transition"
                    />
                  </div>
                  <button
                    onClick={attemptRegister}
                    className="w-full mt-2 bg-green-500 hover:bg-green-450 text-indigo-950 font-black py-3 px-4 rounded-xl shadow-[0px_4px_0px_0px_rgba(21,128,61,1)] hover:translate-y-[2px] hover:shadow-[0px_2px_0px_0px_rgba(21,128,61,1)] active:translate-y-[4px] active:shadow-none transition-all uppercase tracking-wider text-sm"
                  >
                    Criar Conta & Jogar
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* 2. Authenticated General Layout */
          <div className="flex-1 flex flex-col gap-6">

            {/* Private Match Invitations Alerts */}
            {invitations.length > 0 && (
              <div className="flex flex-col gap-2.5">
                {invitations.map(inv => (
                  <div key={inv.matchId} className="bg-yellow-400 text-indigo-950 px-4 py-3.5 rounded-xl border border-yellow-300 flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-2">
                      <Gamepad2 className="w-5 h-5" />
                      <span className="font-bold text-xs md:text-sm">➔ {inv.from} convidou você para uma partida privada de BedWars!</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => acceptGameInvite(inv.matchId)}
                        className="bg-indigo-950 text-yellow-400 font-extrabold text-xs py-1.5 px-3 rounded-lg border border-indigo-900 shadow hover:bg-indigo-900 transition"
                      >
                        ACEITAR
                      </button>
                      <button
                        onClick={() => setInvitations(prev => prev.filter(i => i.matchId !== inv.matchId))}
                        className="text-indigo-950 hover:text-black"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* A. If not in active match view, render Dashboard Selection */}
            {!matchId ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left Side Tab controllers (3 cols) */}
                <div className="lg:col-span-3 flex flex-col gap-3">
                  <div className="bg-black/30 p-4 rounded-2xl border border-white/10 flex flex-col gap-1.5">
                    <h3 className="text-[10px] uppercase tracking-widest text-white/50 mb-2 px-1">Navegação</h3>
                    <button
                      onClick={() => setActiveTab('play')}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                        activeTab === 'play'
                          ? 'bg-white/15 text-white border border-white/10 shadow-lg'
                          : 'bg-transparent text-white/70 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Tv className="w-5 h-5 text-yellow-400" /> Arena de Batalha
                    </button>
                    <button
                      onClick={() => setActiveTab('skins')}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                        activeTab === 'skins'
                          ? 'bg-white/15 text-white border border-white/10 shadow-lg'
                          : 'bg-transparent text-white/70 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Sparkles className="w-5 h-5 text-pink-400" /> Guarda-Roupa / Skins
                    </button>
                    <button
                      onClick={() => setActiveTab('friends')}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                        activeTab === 'friends'
                          ? 'bg-white/15 text-white border border-white/10 shadow-lg'
                          : 'bg-transparent text-white/70 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Users className="w-5 h-5 text-blue-400" /> Amigos & Convites
                    </button>
                    <button
                      onClick={() => setActiveTab('leaderboard')}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                        activeTab === 'leaderboard'
                          ? 'bg-white/15 text-white border border-white/10 shadow-lg'
                          : 'bg-transparent text-white/70 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Crown className="w-5 h-5 text-yellow-400" /> Ranking (Top 10)
                    </button>
                    {currentUser?.email === 'lucasaraujocapistrano@gmail.com' && (
                      <button
                        onClick={() => setActiveTab('admin')}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                          activeTab === 'admin'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-lg'
                            : 'bg-transparent text-rose-400 hover:text-rose-300 hover:bg-rose-500/5'
                        }`}
                      >
                        <ShieldCheck className="w-5 h-5 text-rose-500 animate-pulse" /> Painel Admin 👑
                      </button>
                    )}
                  </div>

                  {/* Profile overall Stats Card & Daily Quest */}
                  <div className="bg-gradient-to-b from-yellow-500/20 to-transparent p-4 rounded-2xl border border-yellow-500/20 flex flex-col gap-3">
                    <h3 className="text-xs uppercase tracking-widest text-yellow-400 mb-1">Estatísticas de Combate</h3>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-black/35 p-2 rounded-xl border border-white/5">
                        <span className="block text-[10px] text-white/50 uppercase tracking-wider">Wins</span>
                        <span className="text-base font-black text-emerald-400 font-mono">{currentUser.stats.wins}</span>
                      </div>
                      <div className="bg-black/35 p-2 rounded-xl border border-white/5">
                        <span className="block text-[10px] text-white/50 uppercase tracking-wider">Kills</span>
                        <span className="text-base font-black text-amber-500 font-mono">{currentUser.stats.kills}</span>
                      </div>
                      <div className="bg-black/35 p-2 rounded-xl border border-white/5">
                        <span className="block text-[10px] text-white/50 uppercase tracking-wider">Camas</span>
                        <span className="text-base font-black text-blue-400 font-mono">{currentUser.stats.bedsDestroyed}</span>
                      </div>
                      <div className="bg-black/35 p-2 rounded-xl border border-white/5">
                        <span className="block text-[10px] text-white/50 uppercase tracking-wider">Partidas</span>
                        <span className="text-base font-black text-slate-300 font-mono">{currentUser.stats.gamesPlayed}</span>
                      </div>
                    </div>

                    <div className="border-t border-white/10 pt-3 mt-1">
                      <p className="text-xs font-bold text-yellow-400">Missão Diária</p>
                      <p className="text-[11px] text-white/80 mt-0.5 font-semibold">Quebrador de Camas</p>
                      <p className="text-[10px] text-white/50 mb-2">Destrua 5 camas em partidas públicas.</p>
                      <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
                        <div className="bg-yellow-400 h-full rounded-full" style={{ width: `${Math.min(100, (currentUser.stats.bedsDestroyed / 5) * 100)}%` }}></div>
                      </div>
                      <p className="text-[10px] text-right mt-1 text-yellow-400 font-mono">
                        {currentUser.stats.bedsDestroyed}/5
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Side Content Canvas (9 cols) */}
                <div className="lg:col-span-9 bg-black/30 border border-white/10 p-6 rounded-3xl flex flex-col gap-5 shadow-2xl relative z-10 animate-fade-in">
                  
                  {activeTab === 'play' && (
                    <div className="flex flex-col gap-6">
                      <div className="border-b border-white/10 pb-3 flex items-center justify-between">
                        <h2 className="text-xl font-bold flex items-center gap-2"><Gamepad2 className="w-5 h-5 text-yellow-400" /> Entrar no Combate</h2>
                        <span className="text-xs text-white/60">Modos de Jogo BedWarsWeb</span>
                      </div>

                      <div className="bg-white/5 border border-white/10 p-2.5 rounded-2xl flex flex-col gap-2">
                        <span className="text-[10px] tracking-widest text-white/50 font-black uppercase px-1">Selecione o Modo de Jogo:</span>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {(['solo', 'dupla', 'trio', 'quarteto'] as const).map((m) => {
                            const label = m === 'solo' ? 'Solo (8P)' : m === 'dupla' ? 'Dupla (16P)' : m === 'trio' ? 'Trio (12P)' : 'Quarteto (16P)';
                            const active = selectedMode === m;
                            return (
                              <button
                                key={m}
                                onClick={() => setSelectedMode(m)}
                                className={`py-2 px-3 text-xs font-black rounded-xl uppercase transition ${
                                  active 
                                    ? 'bg-yellow-400 text-indigo-950 shadow-[0_2px_10px_rgba(234,179,8,0.3)]' 
                                    : 'bg-black/30 text-white/70 hover:bg-white/5 hover:text-white'
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="relative bg-gradient-to-br from-sky-500 via-indigo-600 to-indigo-800 rounded-3xl overflow-hidden shadow-2xl border-4 border-white/15 p-6 flex flex-col md:flex-row items-center justify-around gap-6 py-10">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.15)_0,transparent_100%)] pointer-events-none" />
                        
                        {/* Solo/Quick Match Box (Matchmaking) */}
                        <div className="w-full max-w-[260px] h-64 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20 p-5 flex flex-col justify-between items-center text-center transform hover:scale-[1.03] transition-all relative">
                          <div className="absolute -top-3 bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider shadow">Duelo Rápido</div>
                          <div className="flex flex-col items-center mt-3">
                            <span className="text-4xl mb-2">🏃</span>
                            <span className="font-black text-xl tracking-tight text-white">ARENA RÁPIDA</span>
                            <span className="text-[10px] text-white/70 uppercase tracking-wider font-bold">1v1, 2v2 ou 4v4 público</span>
                            <p className="text-white/85 text-[11px] mt-2 font-medium">Batalha rápida com oponentes dinâmicos online.</p>
                          </div>
                          <div className="w-full">
                            {isQueued ? (
                              <button
                                onClick={leaveMatchmaking}
                                className="w-full bg-red-500 hover:bg-red-400 text-white font-black py-2 rounded-xl text-xs uppercase tracking-wider border border-red-300 animate-bounce transition"
                              >
                                Cancelar Busca...
                              </button>
                            ) : (
                              <button
                                onClick={startMatchmaking}
                                className="w-full bg-green-500 hover:bg-green-400 text-slate-950 font-black py-2.5 rounded-xl text-xs uppercase tracking-widest shadow-[0px_4px_0px_0px_rgba(21,128,61,1)] hover:translate-y-[2px] hover:shadow-[0px_2px_0px_0px_rgba(21,128,61,1)] active:translate-y-[4px] active:shadow-none transition-all"
                              >
                                JOGAR AGORA
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Private squad Box (Private lounge) */}
                        <div className="w-full max-w-[260px] h-64 bg-yellow-400 text-indigo-950 shadow-2xl rounded-2xl p-5 flex flex-col justify-between items-center text-center transform scale-105 hover:scale-[1.08] transition-all relative">
                          <div className="absolute -top-3 bg-indigo-950 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">Private Room</div>
                          <div className="flex flex-col items-center mt-3">
                            <span className="text-4xl mb-2">👨‍👩‍👦‍👦</span>
                            <span className="font-extrabold text-xl tracking-tight">SALA PRIVADA</span>
                            <span className="text-[10px] opacity-75 uppercase tracking-wider font-black">Convide Amigos</span>
                            <p className="text-indigo-950/80 text-[11px] mt-2 font-semibold font-sans">Crie um lobby seguro para lutar contra seus parceiros.</p>
                          </div>
                          <div className="w-full">
                            <button
                              onClick={startPrivateLobby}
                              className="w-full bg-indigo-950 hover:bg-indigo-900 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-widest shadow-[0px_4px_0px_0px_rgba(40,30,80,1)] hover:translate-y-[2px] hover:shadow-[0px_2px_0px_0px_rgba(40,30,80,1)] transition-all"
                            >
                              CRIAR SALA
                            </button>
                          </div>
                        </div>

                      </div>

                      {/* List of Custom online sessions */}
                      <div className="bg-black/30 border border-white/10 p-5 rounded-2xl">
                        <h4 className="text-xs font-bold text-yellow-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-ping" />
                          Salas customizadas disponíveis:
                        </h4>
                        {availableLobbies.length === 0 ? (
                          <span className="text-xs text-white/50 block py-3">Nenhuma sala pública aberta no momento. Crie ou procure matchmaking!</span>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {availableLobbies.map(lob => (
                              <div key={lob.id} className="bg-white/5 border border-white/5 p-3.5 rounded-xl flex items-center justify-between hover:bg-white/10 transition">
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold font-mono text-white/95">{lob.id}</span>
                                  <span className="text-[11px] text-white/60">{lob.playersCount}/8 Jogadores</span>
                                </div>
                                <button
                                  onClick={() => {
                                    setMatchId(lob.id);
                                    socketRef.current?.send(JSON.stringify({
                                      type: 'lobby:join',
                                      payload: { matchId: lob.id, username: currentUser.username, skinId: currentUser.selectedSkin }
                                    }));
                                  }}
                                  className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 font-black py-1 px-3.5 rounded-lg text-xs transition"
                                >
                                  ENTRAR
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Decorative Info Cards matching Design HTML */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white/5 rounded-2xl border border-white/10 p-4 flex items-center gap-4">
                          <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center text-2xl">🎙️</div>
                          <div>
                            <p className="text-sm font-bold">Chat de Voz Integrado</p>
                            <p className="text-xs text-white/50">Conecte seu áudio ao entrar na partida.</p>
                          </div>
                          <span className="ml-auto text-[10px] text-green-400 font-bold font-mono uppercase bg-green-500/10 border border-green-500/20 px-2.5 py-0.5 rounded-full">Suportado</span>
                        </div>
                        <div className="bg-white/5 rounded-2xl border border-white/10 p-4 flex items-center gap-4">
                          <div className="w-12 h-12 bg-pink-500 rounded-xl flex items-center justify-center text-2xl">🌍</div>
                          <div>
                            <p className="text-sm font-bold">Servidor: Arena Local</p>
                            <p className="text-xs text-white/50">Multiplayer com latência ultrabaixa.</p>
                          </div>
                          <span className="ml-auto text-[10px] text-yellow-400 font-bold font-mono uppercase bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-0.5 rounded-full">Online</span>
                        </div>
                      </div>

                    </div>
                  )}

                  {activeTab === 'skins' && currentUser && (
                    <div className="flex flex-col gap-6" id="wardrobe-customizer-root">
                      {/* Sub tab navigation */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
                        <div>
                          <h2 className="text-xl font-bold flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-yellow-500 animate-pulse" /> Customizador Lunar & Hypixel
                          </h2>
                          <p className="text-xs text-white/60 mt-1">
                            Acesse 10.000 skins de Minecraft criadas sob medida e equipe cosméticos Lunar Client exclusivos!
                          </p>
                        </div>

                        {/* Coins budget view & Claim Daily Button */}
                        <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-2xl border border-white/5">
                          <div className="flex items-center gap-1.5 text-yellow-400 font-bold">
                            <Coins className="w-4 h-4 text-yellow-500" />
                            <span className="text-sm tracking-wide">{currentUser.coins ?? 1000}</span>
                            <span className="text-[10px] text-white/50 font-normal">moedas</span>
                          </div>
                          
                          <button
                            onClick={handleDailyClaim}
                            disabled={dailyClaimLoading}
                            className="bg-green-500 hover:bg-green-400 text-white text-[11px] font-black px-3 py-1 rounded-lg transition disabled:opacity-50 flex items-center gap-1"
                          >
                            <Gift className="w-3.5 h-3.5" />
                            {dailyClaimLoading ? 'Coletando...' : 'Coletar Diário (+500)'}
                          </button>
                        </div>
                      </div>

                      {/* Toast notification inside shop */}
                      <AnimatePresence>
                        {customizerFeedback && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="bg-indigo-600/90 text-white border border-indigo-400/30 font-bold text-xs p-3 rounded-xl shadow-lg flex items-center gap-2"
                          >
                            <Sparkles className="w-4 h-4 text-yellow-400 animate-spin" />
                            {customizerFeedback}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Tab selection menu: Skins (10k), Cosméticos, Emotes */}
                      <div className="flex bg-black/45 p-1 rounded-xl border border-white/10 self-start">
                        <button
                          onClick={() => setSelectedSubTab('skins')}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase transition ${
                            selectedSubTab === 'skins' ? 'bg-yellow-400 text-indigo-950 font-black' : 'text-white/70 hover:text-white'
                          }`}
                        >
                          <Shirt className="w-3.5 h-3.5" /> Skins (10.000)
                        </button>
                        <button
                          onClick={() => setSelectedSubTab('cosmetics')}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase transition ${
                            selectedSubTab === 'cosmetics' ? 'bg-yellow-400 text-indigo-950 font-black' : 'text-white/70 hover:text-white'
                          }`}
                        >
                          <Trophy className="w-3.5 h-3.5" /> Cosméticos
                        </button>
                        <button
                          onClick={() => setSelectedSubTab('emotes')}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase transition ${
                            selectedSubTab === 'emotes' ? 'bg-yellow-400 text-indigo-950 font-black' : 'text-white/70 hover:text-white'
                          }`}
                        >
                          <Smile className="w-3.5 h-3.5" /> Emotes Lunar
                        </button>
                      </div>

                      {/* SUBTAB CONTENT 1: SKINS (10k) IN MINECRAFT STYLE */}
                      {selectedSubTab === 'skins' && (
                        <div className="flex flex-col gap-5">
                          {/* Search and Filters row */}
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                            <div className="md:col-span-4 relative">
                              <Search className="w-4 h-4 text-white/40 absolute left-3 top-3.5" />
                              <input
                                type="text"
                                placeholder="Pesquisar 10.000 skins por Nome/ID..."
                                value={skinSearchQuery}
                                onChange={(e) => {
                                  setSkinSearchQuery(e.target.value);
                                  setSkinPage(1);
                                }}
                                className="bg-black/40 border border-white/10 w-full p-3 pl-10 rounded-xl text-xs text-white focus:outline-none focus:border-yellow-400 transition"
                              />
                            </div>

                            <div className="md:col-span-3">
                              <select
                                value={skinRarityFilter}
                                onChange={(e) => {
                                  setSkinRarityFilter(e.target.value);
                                  setSkinPage(1);
                                }}
                                className="bg-black/45 border border-white/10 w-full p-3 rounded-xl text-xs text-white focus:outline-none focus:border-yellow-400 transition h-[42px]"
                              >
                                <option value="">Todas as Raridades</option>
                                <option value="COMUM">COMUM (Preço: Grátis - 150)</option>
                                <option value="RARO">RARO (Preço: 250 - 350)</option>
                                <option value="ÉPICO">ÉPICO (Preço: 400 - 650)</option>
                                <option value="LENDÁRIO">LENDÁRIO (Preço: 800+)</option>
                              </select>
                            </div>

                            {/* Jackpot / Random skin button */}
                            <div className="md:col-span-5 flex gap-2">
                              <button
                                onClick={() => {
                                  setSpinningModel(true);
                                  playAudio.playBuy();
                                  setTimeout(() => {
                                    setSpinningModel(false);
                                    const randomSkinId = `skin_${Math.floor(Math.random() * 10000) + 1}`;
                                    handleUnlockSkin(randomSkinId, 0); // Gift them the randomized skin!
                                    setSkinSearchQuery(randomSkinId);
                                    setCustomizerFeedback(`ROLETA: Você tirou a ${randomSkinId}!`);
                                  }, 1200);
                                }}
                                disabled={spinningModel}
                                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 flex-1 select-none"
                              >
                                <RefreshCw className={`w-4 h-4 ${spinningModel ? 'animate-spin' : ''}`} />
                                {spinningModel ? 'SORTEANDO SKIN...' : 'Rolete de Skins do Hypixel (Grátis!)'}
                              </button>
                            </div>
                          </div>

                          {/* Procedural Skin Cards Catalog */}
                          {(() => {
                            const searchResult = searchCustomSkins(skinSearchQuery, skinPage, 6, skinRarityFilter || undefined);
                            const paginated = searchResult.skins;
                            const totalSkinsCount = searchResult.total;
                            const totalPages = Math.ceil(totalSkinsCount / 6);

                            return (
                              <div className="flex flex-col gap-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  {paginated.map((skin) => {
                                    const isSelected = currentUser.selectedSkin === skin.id;
                                    const isUnlocked = currentUser.unlockedSkinIds?.includes(skin.id) || skin.id === 'steve' || skin.id === 'alex';

                                    let rarityBorder = "border-white/10";
                                    let rarityBg = "bg-white/5";
                                    let rarityLabelColor = "text-white/60";

                                    if (skin.rarity === 'COMUM') {
                                      rarityLabelColor = "text-green-400 font-extrabold";
                                    } else if (skin.rarity === 'RARO') {
                                      rarityBorder = "border-blue-500/20";
                                      rarityBg = "bg-blue-500/5";
                                      rarityLabelColor = "text-blue-400 font-extrabold";
                                    } else if (skin.rarity === 'ÉPICO') {
                                      rarityBorder = "border-purple-500/25";
                                      rarityBg = "bg-purple-500/5";
                                      rarityLabelColor = "text-purple-400 font-extrabold";
                                    } else if (skin.rarity === 'LENDÁRIO') {
                                      rarityBorder = "border-yellow-500/40";
                                      rarityBg = "bg-yellow-500/5 hover:bg-yellow-500/10";
                                      rarityLabelColor = "text-yellow-400 font-black animate-pulse";
                                    }

                                    return (
                                      <div
                                        key={skin.id}
                                        className={`rounded-2xl border p-4 flex flex-col justify-between min-h-[178px] transition duration-200 ${
                                          isSelected ? 'ring-4 ring-yellow-400/50 border-yellow-400 bg-yellow-400/5' : `${rarityBorder} ${rarityBg}`
                                        }`}
                                      >
                                        <div className="flex items-start justify-between">
                                          <div>
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-[10px] font-black tracking-widest px-1.5 py-0.5 rounded bg-black/40 text-white/50">
                                                #{skin.id.replace('skin_', '')}
                                              </span>
                                              <span className={`text-[10px] tracking-wide uppercase ${rarityLabelColor}`}>
                                                {skin.rarity}
                                              </span>
                                            </div>
                                            <h3 className="font-black text-white text-base mt-1.5 tracking-tight">{skin.name}</h3>
                                          </div>

                                          {/* Custom Skin Render Preview */}
                                          <div className="w-10 h-10 rounded-xl flex items-center justify-center relative shadow border border-white/15 overflow-hidden" style={{ backgroundColor: skin.skinHex }}>
                                            {/* Blocky internal face avatar simulation */}
                                            <div className="w-6 h-6 rounded bg-black/25 flex flex-col gap-1 items-center justify-center p-0.5" style={{ backgroundColor: skin.hairColor }}>
                                              <div className="flex gap-2.5 mt-2">
                                                <div className="w-1 h-1 rounded-sm" style={{ backgroundColor: skin.eyeColor }} />
                                                <div className="w-1 h-1 rounded-sm" style={{ backgroundColor: skin.eyeColor }} />
                                              </div>
                                            </div>
                                          </div>
                                        </div>

                                        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                                          <div>
                                            <span className="text-[10.5px] text-white/40 block">Preço</span>
                                            <span className="text-sm font-black text-white flex items-center gap-1">
                                              {skin.price === 0 ? (
                                                <span className="text-green-400 text-xs font-bold">Grátis</span>
                                              ) : (
                                                <span className="text-yellow-400 flex items-center gap-0.5">
                                                  <Coins className="w-3.5 h-3.5" />
                                                  {skin.price}
                                                </span>
                                              )}
                                            </span>
                                          </div>

                                          {/* Select, Equip or Buy Button */}
                                          {isSelected ? (
                                            <span className="bg-yellow-400 text-indigo-950 text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider shadow">EQUIPADA</span>
                                          ) : isUnlocked ? (
                                            <button
                                              onClick={() => handleSelectSkin(skin.id)}
                                              className="bg-white/10 hover:bg-white/15 text-white text-[11px] font-black px-3.5 py-1.5 rounded-lg transition uppercase tracking-wider"
                                            >
                                              Equipar
                                            </button>
                                          ) : (
                                            <button
                                              onClick={() => handleUnlockSkin(skin.id, skin.price)}
                                              className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 text-[11px] font-black px-3.5 py-1.5 rounded-lg transition uppercase tracking-wider flex items-center gap-1 shadow"
                                            >
                                              Comprar ({skin.price})
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Pagination tool block */}
                                {totalPages > 1 && (
                                  <div className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/5 text-xs text-white/50">
                                    <span>Mostrando página <b>{skinPage}</b> de {totalPages} ({totalSkinsCount} skins encontradas)</span>
                                    <div className="flex gap-2">
                                      <button
                                        disabled={skinPage === 1}
                                        onClick={() => setSkinPage(p => Math.max(1, p - 1))}
                                        className="bg-white/5 hover:bg-white/10 text-white disabled:opacity-40 px-3 py-1 rounded transition font-bold"
                                      >
                                        Anterior
                                      </button>
                                      <button
                                        disabled={skinPage >= totalPages}
                                        onClick={() => setSkinPage(p => Math.min(totalPages, p + 1))}
                                        className="bg-white/5 hover:bg-white/10 text-white disabled:opacity-40 px-3 py-1 rounded transition font-bold"
                                      >
                                        Próxima
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* SUBTAB CONTENT 2: LUNAR CLIENT COSMETICS */}
                      {selectedSubTab === 'cosmetics' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {COSMETICS_LIST.map((item) => {
                            const isOwned = currentUser.unlockedCosmetics?.includes(item.id);
                            
                            // Check what slot is currently equipped
                            let isEquipped = false;
                            if (item.type === 'cape') isEquipped = currentUser.selectedCape === item.id;
                            else if (item.type === 'wings') isEquipped = currentUser.selectedWings === item.id;
                            else if (item.type === 'halo') isEquipped = currentUser.selectedHalo === item.id;
                            else if (item.type === 'hat') isEquipped = currentUser.selectedHat === item.id;

                            return (
                              <div key={item.id} className="bg-black/45 hover:bg-black/50 border border-white/10 rounded-2xl p-5 flex items-center justify-between transition-all duration-150">
                                <div className="flex items-center gap-4">
                                  {/* Cosmetics icon representation */}
                                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow relative" style={{ backgroundColor: `${item.color}35`, border: `2px solid ${item.color}` }}>
                                    {item.type === 'cape' && '🧥'}
                                    {item.type === 'wings' && '🦇'}
                                    {item.type === 'halo' && '😇'}
                                    {item.type === 'hat' && '👑'}
                                  </div>

                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded">
                                        Slot: {item.type.toUpperCase()}
                                      </span>
                                      {isOwned && (
                                        <span className="bg-green-500/10 border border-green-500/30 text-green-400 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                                          Adquirido
                                        </span>
                                      )}
                                    </div>
                                    <h3 className="text-base font-extrabold text-white mt-1.5">{item.name}</h3>
                                    <p className="text-xs text-white/50 mt-0.5">{item.description}</p>
                                  </div>
                                </div>

                                <div className="flex flex-col items-end gap-2">
                                  <span className="text-xs font-extrabold text-yellow-400 flex items-center gap-1">
                                    <Coins className="w-3.5 h-3.5" />
                                    {item.price}
                                  </span>

                                  {isEquipped ? (
                                    <span className="bg-yellow-400 text-indigo-950 text-[10px] font-black px-2.5 py-1.5 rounded-lg uppercase tracking-wider shadow">EQUIPADO</span>
                                  ) : isOwned ? (
                                    <button
                                      onClick={() => handleEquipCosmetic(item.type, item.id)}
                                      className="bg-indigo-500 hover:bg-indigo-400 text-white text-[10px] font-black px-3 py-1.5 rounded-lg transition uppercase tracking-wider"
                                    >
                                      Equipar
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleUnlockCosmetic(item.id, item.price)}
                                      className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 text-[10px] font-black px-3 py-1.5 rounded-lg transition uppercase tracking-wider"
                                    >
                                      Desbloquear
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* SUBTAB CONTENT 3: LUNAR EMOTES */}
                      {selectedSubTab === 'emotes' && (
                        <div className="flex flex-col gap-4">
                          <div className="bg-white/5 rounded-2xl border border-white/5 p-4 text-xs text-white/60">
                            <b>Emote Real-time:</b> Ao possuir um emote, você pode clicar nele para animar o chat da partida globalmente em tempo real!
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {EMOTES_LIST.map((emote) => {
                              const isOwned = currentUser.unlockedEmotes?.includes(emote.id) || emote.id === 'wave';

                              return (
                                <div key={emote.id} className="bg-black/45 border border-white/10 rounded-2xl p-5 flex items-center justify-between transition hover:border-white/20">
                                  <div className="flex items-center gap-3">
                                    <div className="text-3xl bg-white/5 w-12 h-12 rounded-xl flex items-center justify-center">
                                      {emote.id === 'wave' && '👋'}
                                      {emote.id === 'dab' && '🙅'}
                                      {emote.id === 'dance' && '🕺'}
                                      {emote.id === 'spin' && '🌀'}
                                      {emote.id === 'facepalm' && '🤦'}
                                      {emote.id === 'flex' && '💪'}
                                      {emote.id === 'shrug' && '🤷'}
                                    </div>

                                    <div>
                                      <h4 className="text-sm font-black text-white">{emote.name}</h4>
                                      <p className="text-xs text-white/50">{emote.description}</p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3">
                                    {!isOwned && (
                                      <span className="text-xs font-black text-yellow-400 flex items-center gap-0.5">
                                        <Coins className="w-3.5 h-3.5" />
                                        {emote.price}
                                      </span>
                                    )}

                                    {isOwned ? (
                                      <button
                                        onClick={() => handleTriggerEmote(emote.id, emote.triggerText)}
                                        className="bg-green-500 hover:bg-green-400 text-white text-[10px] font-black px-4 py-2 rounded-lg transition uppercase tracking-wider"
                                      >
                                        Ativar no Jogo 👋
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleUnlockEmote(emote.id, emote.price)}
                                        className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 text-[10px] font-black px-4 py-2 rounded-lg transition uppercase tracking-wider"
                                      >
                                        Adquirir ({emote.price})
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'friends' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Left: Add system friend */}
                      <div className="flex flex-col gap-4">
                        <h3 className="text-xs uppercase tracking-widest text-white/50 font-bold">Adicionar Amigos</h3>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={friendInput}
                            onChange={(e) => setFriendInput(e.target.value)}
                            placeholder="Ex: Steve99"
                            className="bg-black/35 border border-white/10 p-3 rounded-xl text-xs font-semibold flex-1 text-white focus:outline-none focus:border-yellow-400 transition"
                          />
                          <button
                            onClick={sendFriendInvite}
                            className="bg-yellow-400 hover:bg-yellow-300 text-indigo-950 px-5 rounded-xl font-black text-xs uppercase"
                          >
                            Convidar
                          </button>
                        </div>

                        {/* Received friend invitations list */}
                        <div className="bg-black/40 border border-white/10 p-4 rounded-2xl mt-4">
                          <h4 className="text-xs font-extrabold text-yellow-400 uppercase tracking-widest mb-3">Solicitações de Amizade:</h4>
                          {pendingReceived.length === 0 ? (
                            <span className="text-xs text-white/40">Nenhuma solicitação pendente.</span>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {pendingReceived.map(fname => (
                                <div key={fname} className="flex items-center justify-between bg-white/5 border border-white/5 p-2.5 rounded-lg">
                                  <span className="text-xs font-bold text-white">{fname}</span>
                                  <button
                                    onClick={() => acceptFriendReward(fname)}
                                    className="bg-emerald-500 hover:bg-emerald-450 text-indigo-950 text-[10px] font-black px-3 py-1 rounded-lg uppercase"
                                  >
                                    ACEITAR
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: friends tracking list */}
                      <div className="flex flex-col gap-4">
                        <h3 className="text-xs uppercase tracking-widest text-white/50 font-bold">Meus Amigos:</h3>
                        <div className="bg-black/40 border border-white/10 p-4 rounded-2xl min-h-[12rem] flex flex-col gap-3">
                          {friendsList.length === 0 ? (
                            <span className="text-xs text-white/30 m-auto text-center font-semibold">Sua lista de amigos está vazia. Adicione jogadores para jogar BedWarsWeb!</span>
                          ) : (
                            friendsList.map(f => (
                              <div key={f.username} className="flex items-center justify-between border-b border-white/5 pb-2.5">
                                <div className="flex items-center gap-2.5">
                                  <span className={`w-2.5 h-2.5 rounded-full ${f.online ? 'bg-emerald-400' : 'bg-white/15'}`} />
                                  <span className="text-xs font-bold text-white">{f.username}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-white/50 capitalize font-mono">{f.selectedSkin}</span>
                                  {f.online && matchState?.isPrivate && (
                                    <button
                                      onClick={() => {
                                        socketRef.current?.send(JSON.stringify({
                                          type: 'lobby:invite_friend',
                                          payload: { from: currentUser.username, friendUsername: f.username, matchId }
                                        }));
                                        setInfoText(`Convite enviado para ${f.username}!`);
                                        setTimeout(() => setInfoText(null), 2500);
                                      }}
                                      className="bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-black text-[9px] py-1 px-2.5 rounded-lg"
                                    >
                                      CONVIDAR
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'leaderboard' && (
                    <div className="flex flex-col gap-4">
                      <div className="border-b border-white/10 pb-3">
                        <h2 className="text-lg font-extrabold text-white flex items-center gap-1.5"><Crown className="w-5 h-5 text-yellow-400" /> Melhores Jogadores (Ranking Global)</h2>
                        <span className="text-[10px] text-white/50">Classificação atualizada com base em vitórias (RP)</span>
                      </div>

                      <div className="bg-black/30 border border-white/15 rounded-2xl overflow-hidden shadow-xl">
                        <div className="grid grid-cols-12 bg-white/5 border-b border-white/10 text-[10px] font-bold text-white/60 uppercase py-3 px-4 tracking-wider">
                          <span className="col-span-2 text-center">Posição</span>
                          <span className="col-span-4">Jogador</span>
                          <span className="col-span-3 text-center">Wins / Total</span>
                          <span className="col-span-3 text-center text-yellow-400">Rank Points (RP)</span>
                        </div>

                        <div className="flex flex-col">
                          {leaderboard.length === 0 ? (
                            <span className="text-xs text-white/55 p-6 text-center">Carregando classificação do BedWarsWeb...</span>
                          ) : (
                            leaderboard.map((item, idx) => (
                              <div key={item.username} className="grid grid-cols-12 items-center text-xs text-white/90 py-3.5 px-4 border-b border-white/5 hover:bg-white/5">
                                <span className="col-span-2 text-center font-bold font-mono">
                                  {idx + 1 === 1 ? '🥇' : idx + 1 === 2 ? '🥈' : idx + 1 === 3 ? '🥉' : idx + 1}
                                </span>
                                <span className="col-span-4 font-bold text-white">{item.username}</span>
                                <span className="col-span-3 text-center font-mono text-white/60">{item.stats.wins} / {item.stats.gamesPlayed}</span>
                                <span className="col-span-3 text-center font-bold font-mono text-yellow-400">{item.rankPoints} RP</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'admin' && currentUser?.email === 'lucasaraujocapistrano@gmail.com' && (
                    <div className="flex flex-col gap-6">
                      <div className="border-b border-white/10 pb-3">
                        <h2 className="text-xl font-black text-rose-400 flex items-center gap-2">
                          <ShieldCheck className="w-6 h-6 text-rose-500" /> Painel de Administração de Eventos
                        </h2>
                        <p className="text-xs text-white/60">Bem-vindo, {currentUser.username}. Você possui privilégios de controle absoluto sobre as partidas.</p>
                      </div>

                      {/* Section 1: Event Dispatchers */}
                      <div className="bg-rose-950/20 border border-rose-500/20 p-5 rounded-3xl flex flex-col gap-4">
                        <span className="text-[10px] tracking-widest text-rose-400 font-extrabold uppercase">Disparar Eventos Globais Simultâneos:</span>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <button
                            onClick={() => {
                              socketRef.current?.send(JSON.stringify({
                                type: 'admin:command',
                                payload: { commandType: 'create_event', eventName: 'sudden_death' }
                              }));
                              setInfoText("Morte Súbita iniciada!");
                              setTimeout(() => setInfoText(null), 3000);
                            }}
                            className="bg-black/40 hover:bg-rose-900 border border-rose-500/30 text-rose-300 font-bold p-3 rounded-2xl text-xs uppercase flex flex-col items-center gap-1.5 transition"
                          >
                            <span className="text-xl">⚠️</span>
                            <span>Morte Súbita</span>
                            <span className="text-[9px] opacity-75 font-normal tracking-tight">Destruir Camas</span>
                          </button>

                          <button
                            onClick={() => {
                              socketRef.current?.send(JSON.stringify({
                                type: 'admin:command',
                                payload: { commandType: 'create_event', eventName: 'emerald_rush' }
                              }));
                              setInfoText("Corrida da Esmeralda iniciada!");
                              setTimeout(() => setInfoText(null), 3000);
                            }}
                            className="bg-black/40 hover:bg-emerald-900 border border-emerald-500/30 text-emerald-300 font-bold p-3 rounded-2xl text-xs uppercase flex flex-col items-center gap-1.5 transition"
                          >
                            <span className="text-xl">💚</span>
                            <span>Corrida Esmeralda</span>
                            <span className="text-[9px] opacity-75 font-normal tracking-tight">Dar Esmeraldas</span>
                          </button>

                          <button
                            onClick={() => {
                              socketRef.current?.send(JSON.stringify({
                                type: 'admin:command',
                                payload: { commandType: 'create_event', eventName: 'diamond_rush' }
                              }));
                              setInfoText("Chuva de Diamantes enviada!");
                              setTimeout(() => setInfoText(null), 3000);
                            }}
                            className="bg-black/40 hover:bg-blue-900 border border-blue-500/30 text-blue-300 font-bold p-3 rounded-2xl text-xs uppercase flex flex-col items-center gap-1.5 transition"
                          >
                            <span className="text-xl">💎</span>
                            <span>Chuva Diamantes</span>
                            <span className="text-[9px] opacity-75 font-normal tracking-tight">Dar Diamantes</span>
                          </button>

                          <button
                            onClick={() => {
                              socketRef.current?.send(JSON.stringify({
                                type: 'admin:command',
                                payload: { commandType: 'create_event', eventName: 'meteor_shower' }
                              }));
                              setInfoText("Chuva de Meteoros iniciada!");
                              setTimeout(() => setInfoText(null), 3000);
                            }}
                            className="bg-black/40 hover:bg-amber-900 border border-amber-500/30 text-amber-300 font-bold p-3 rounded-2xl text-xs uppercase flex flex-col items-center gap-1.5 transition"
                          >
                            <span className="text-xl">🔥</span>
                            <span>Meteoros</span>
                            <span className="text-[9px] opacity-75 font-normal tracking-tight">Dar dano de explosão</span>
                          </button>
                        </div>
                      </div>

                      {/* Section 2: Player Moderation controls */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex flex-col gap-4">
                          <span className="text-xs font-black text-rose-300 uppercase tracking-widest">Punir / Controlar Jogador:</span>
                          <div className="flex flex-col gap-3">
                            <div>
                              <label className="text-[10px] text-white/50 block font-bold mb-1">Apelido do Jogador:</label>
                              <input
                                id="admin_target_input"
                                type="text"
                                placeholder="Nick do jogador"
                                className="w-full bg-black/40 border border-white/10 p-2.5 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-rose-400"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              <button
                                onClick={() => {
                                  const target = (document.getElementById("admin_target_input") as HTMLInputElement)?.value;
                                  if (!target) {
                                    alert("Digite o nick do jogador!");
                                    return;
                                  }
                                  socketRef.current?.send(JSON.stringify({
                                    type: 'admin:command',
                                    payload: { commandType: 'kick_player', targetUser: target }
                                  }));
                                  setInfoText(`Jogador ${target} kickado!`);
                                  setTimeout(() => setInfoText(null), 3000);
                                }}
                                className="bg-red-600 hover:bg-red-500 text-white text-[11px] font-black py-2.5 rounded-xl uppercase transition"
                              >
                                Expulsar / Kick
                              </button>
                              <button
                                onClick={() => {
                                  const target = (document.getElementById("admin_target_input") as HTMLInputElement)?.value;
                                  if (!target) {
                                    alert("Digite o nick do jogador!");
                                    return;
                                  }
                                  socketRef.current?.send(JSON.stringify({
                                    type: 'admin:command',
                                    payload: { commandType: 'mute_player', targetUser: target }
                                  }));
                                  setInfoText(`Status de Mute alterado para ${target}!`);
                                  setTimeout(() => setInfoText(null), 3000);
                                }}
                                className="bg-amber-600/60 hover:bg-amber-600 text-white text-[11px] font-black py-2.5 rounded-xl uppercase transition"
                              >
                                Mudar Silenciar
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl flex flex-col gap-4">
                          <span className="text-xs font-black text-emerald-300 uppercase tracking-widest">Apoiador / Boost Jogador:</span>
                          <div className="flex flex-col gap-3">
                            <div>
                              <label className="text-[10px] text-white/50 block font-bold mb-1">Apelido do Jogador:</label>
                              <input
                                id="admin_boost_input"
                                type="text"
                                placeholder="Nick do beneficiado"
                                className="w-full bg-black/40 border border-white/10 p-2.5 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-emerald-400"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              <button
                                onClick={() => {
                                  const target = (document.getElementById("admin_boost_input") as HTMLInputElement)?.value;
                                  if (!target) {
                                    alert("Digite o nick do jogador!");
                                    return;
                                  }
                                  socketRef.current?.send(JSON.stringify({
                                    type: 'admin:command',
                                    payload: { commandType: 'give_minerals', targetUser: target }
                                  }));
                                  setInfoText(`Minerais enviados para ${target}!`);
                                  setTimeout(() => setInfoText(null), 3000);
                                }}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black py-2.5 rounded-xl uppercase transition opacity-90"
                              >
                                Dar Recursos
                              </button>
                              <button
                                onClick={() => {
                                  const target = (document.getElementById("admin_boost_input") as HTMLInputElement)?.value;
                                  if (!target) {
                                    alert("Digite o nick do jogador!");
                                    return;
                                  }
                                  socketRef.current?.send(JSON.stringify({
                                    type: 'admin:command',
                                    payload: { commandType: 'respawn_player', targetUser: target }
                                  }));
                                  setInfoText(`Ressuscitado ${target}!`);
                                  setTimeout(() => setInfoText(null), 3000);
                                }}
                                className="bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-black py-2.5 rounded-xl uppercase transition opacity-90"
                              >
                                Reviver Instantâneo
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* B. Active Game Match View */
              <div className="flex-1 flex flex-col gap-5">
                
                {/* Lobby/Queue setup or In-Game Screen */}
                {matchState?.status !== 'playing' && matchState?.status !== 'ended' ? (
                  <div className="max-w-xl w-full mx-auto bg-black/45 backdrop-blur-md border border-white/10 p-8 rounded-3xl flex flex-col gap-6 text-center shadow-2xl relative z-10 animate-fade-in">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-yellow-400/10 text-yellow-400 rounded-full flex items-center justify-center border border-yellow-500/25 mb-3 animate-pulse">
                        <Users className="w-6 h-6" />
                      </div>
                      <h2 className="text-2xl font-black tracking-tight text-white italic">LOBBY DE ESPERA</h2>
                      <p className="text-white/60 text-xs mt-1">Sala ID: <b className="font-mono text-yellow-400">{matchId}</b></p>
                      {matchState?.mode && (
                        <span className="mt-2 inline-block bg-yellow-400/15 border border-yellow-400/40 text-yellow-400 px-3 py-1 rounded-full text-[10px] font-black uppercase font-mono tracking-wider">
                          Modo: {matchState.mode === 'solo' ? 'Solo (8P)' : matchState.mode === 'dupla' ? 'Dupla (16P)' : matchState.mode === 'trio' ? 'Trio (12P)' : 'Quarteto (16P)'}
                        </span>
                      )}
                    </div>

                    {/* Highly-styled Map Theme Details (1 of 100 Themes) */}
                    {matchState?.mapTheme && (
                      <div className="bg-gradient-to-br from-indigo-950/40 via-purple-950/20 to-stone-900/40 border border-white/10 p-4 rounded-2xl text-left flex items-center gap-4 transition shadow-inner">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center text-xl shadow-lg border border-white/15 select-none shrink-0">
                          🗺️
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-bold text-yellow-400 tracking-widest block font-mono">Tema de Mapa Sorteado (1 de 100)</span>
                          <span className="text-base font-black text-white">{matchState.mapTheme}</span>
                          <span className="text-[11px] text-white/50 block leading-tight mt-0.5">Bioma e estilo estético selecionado aleatoriamente para o combate de voxel.</span>
                        </div>
                      </div>
                    )}

                    {/* Player grid ready status */}
                    <div className="bg-black/30 p-4.5 rounded-2xl border border-white/10 flex flex-col gap-3">
                      <h3 className="text-[11px] font-bold text-white/50 uppercase tracking-widest text-left">
                        Jogadores Conectados ({matchState?.players.length}/{(matchState?.mode === 'solo' ? 8 : matchState?.mode === 'dupla' ? 16 : matchState?.mode === 'trio' ? 12 : 16)}):
                      </h3>
                      <div className="grid grid-cols-2 gap-2 text-left">
                        {matchState?.players.map(p => (
                          <div key={p.username} className="bg-white/5 border border-white/5 p-2.5 rounded-xl flex items-center justify-between text-xs hover:bg-white/10 transition">
                            <span className="font-bold text-white truncate max-w-[100px]">{p.username}</span>
                            <span className={`text-[10px] px-2.5 py-0.5 rounded-lg font-black uppercase font-mono ${TEAM_BADGES_X[p.team as Team] || 'bg-yellow-400 text-indigo-950 font-black'}`}>
                              {TEAM_NAMES_PT[p.team as Team] || p.team}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Countdown state banner */}
                    <div className="bg-gradient-to-r from-sky-450/20 to-indigo-600/20 p-5 rounded-2xl border-2 border-dashed border-yellow-400/40">
                      {matchState?.countdown ? (
                        <>
                          <h4 className="text-lg font-black text-yellow-400 animate-pulse">Iniciando Partida em {matchState.countdown}s</h4>
                          <p className="text-white/70 text-xs mt-1">Colabore via chat de voz ou envie mensagens ao seu time.</p>
                        </>
                      ) : (
                        <p className="text-white/60 text-xs">Aguardando mais lutadores no lobby...</p>
                      )}
                    </div>

                    {/* Allow invite code shares */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`Sala ID: ${matchId}`}
                        className="bg-black/40 text-xs border border-white/10 p-2.5 rounded-xl text-center font-mono flex-1 text-white/75 focus:outline-none"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(matchId || '');
                          setInfoText('Lobby ID copiado!');
                          setTimeout(() => setInfoText(null), 2000);
                        }}
                        className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 px-4 py-2 font-black rounded-xl text-xs uppercase"
                      >
                        COPIAR ID
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        socketRef.current?.close();
                        setMatchId(null);
                        setMatchState(null);
                      }}
                      className="w-full bg-red-900/30 text-red-200 border border-red-500/30 hover:bg-red-900/50 font-bold py-2.5 rounded-xl text-xs tracking-wider transition uppercase"
                    >
                      ABANDONAR LOBBY
                    </button>
                  </div>
                ) : (
                  
                  /* Dynamic Gameplay Screen + Ingame Overlays */
                  <div className="flex-1 flex flex-col gap-4 relative z-10">
                    
                    {/* Top HUD bar */}
                    <div className="bg-black/45 backdrop-blur-md border border-white/10 px-4 py-3 rounded-2xl flex flex-col sm:flex-row gap-3 items-center justify-between shadow-xl animate-fade-in">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="bg-white/5 border border-white/5 py-1.5 px-3.5 rounded-full text-xs font-mono font-bold flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4 text-yellow-400" /> Sala: <b className="text-yellow-400">{matchId}</b>
                        </span>

                        {/* Real-time Voice chat mic controller */}
                        <button
                          onClick={toggleVoice}
                          className={`py-1.5 px-3.5 rounded-full text-xs font-black font-mono tracking-wider flex items-center gap-1.5 transition ${
                            voiceEnabled
                              ? 'bg-green-500 text-slate-950 animate-pulse font-black'
                              : 'bg-white/5 border border-white/5 hover:bg-white/10 text-white/80'
                          }`}
                        >
                          {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-red-400" />}
                          <span>{voiceEnabled ? 'VOZ ATIVADA (MUTE)' : 'ATIVAR VOZ'}</span>
                          {isSpeakingLocally && <span className="w-2 h-2 rounded-full bg-green-300 animate-ping" />}
                        </button>
                      </div>

                      {/* Display live resources wallet */}
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <div className="flex items-center gap-1.5 bg-black/35 border border-white/5 py-1 px-2.5 rounded-xl text-xs select-none">
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-300 shadow-sm" />
                          <span className="font-mono text-slate-100 font-black">{coins.iron} Ferro</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-black/35 border border-white/5 py-1 px-2.5 rounded-xl text-xs select-none">
                          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shadow-sm" />
                          <span className="font-mono text-yellow-400 font-black">{coins.gold} Ouro</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-black/35 border border-white/5 py-1 px-2.5 rounded-xl text-xs select-none">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-300 shadow-sm" />
                          <span className="font-mono text-cyan-400 font-black">{coins.diamond} Diamante</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-black/35 border border-white/5 py-1 px-2.5 rounded-xl text-xs select-none">
                          <span className="w-2.5 h-2.5 rounded-full bg-green-400 shadow-sm" />
                          <span className="font-mono text-emerald-400 font-black">{coins.emerald} Esmeralda</span>
                        </div>
                      </div>
                    </div>

                    {/* Arena render view (Left 3D canvas, Right Chat Overlay) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[550px] animate-fade-in">
                      
                      <div className="lg:col-span-9 h-full relative border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                        <GameCanvas
                          match={matchState}
                          username={currentUser.username}
                          myTeam={myTeam}
                          ws={socketRef.current}
                          onOpenShop={() => setShopOpen(true)}
                          coins={coins}
                        />

                        {/* Dynamic Hotbar HUD & Inventory Overlay */}
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md border border-white/10 p-2 rounded-2xl flex items-center gap-3 z-30 select-none shadow-2xl scale-[0.9] sm:scale-100">
                          {/* Weapons Slot */}
                          <div className="flex items-center gap-2 border-r border-white/10 pr-2.5">
                            <div className="w-11 h-11 bg-white/5 border border-white/10 rounded-xl flex flex-col items-center justify-center relative group">
                              <span className="text-[10px] text-white/50 font-mono scale-[0.85]">Arma</span>
                              <span className="text-xs font-black text-yellow-400 font-mono mt-0.5">
                                {playerInventory?.diamond_sword ? '💎 ESP' :
                                 playerInventory?.iron_sword ? '⛓️ ESP' :
                                 playerInventory?.stone_sword ? '🪨 ESP' : '🪵 ESP'}
                              </span>
                              {matchState?.teamUpgrades?.[myTeam]?.sharpness && (
                                <span className="absolute -top-1.5 -right-1.5 bg-cyan-500 text-slate-950 font-black px-1 rounded text-[8px] animate-pulse">+⚔️</span>
                              )}
                            </div>
                            
                            {/* Mining tool */}
                            <div className="w-11 h-11 bg-white/5 border border-white/10 rounded-xl flex flex-col items-center justify-center relative">
                              <span className="text-[10px] text-white/50 font-mono scale-[0.85]">Ferra</span>
                              <span className="text-xs font-black text-cyan-300 font-mono mt-0.5">
                                {playerInventory?.pickaxe ? '⛏️ PIC' : '🪵 MÃO'}
                              </span>
                              {matchState?.teamUpgrades?.[myTeam]?.haste > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-slate-950 font-black px-1 rounded text-[8px]">
                                  H{matchState.teamUpgrades[myTeam].haste}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Building Blocks Inventories slots */}
                          <div className="flex items-center gap-2 border-r border-white/10 pr-2.5">
                            <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex flex-col items-center justify-center relative">
                              <span className="text-[8px] text-white/40 uppercase font-bold">Lã</span>
                              <span className="text-xs font-bold text-white font-mono">{playerInventory?.wool ?? 0}</span>
                            </div>
                            <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex flex-col items-center justify-center relative">
                              <span className="text-[8px] text-white/40 uppercase font-bold">Mad</span>
                              <span className="text-xs font-bold text-amber-500 font-mono">{playerInventory?.wood ?? 0}</span>
                            </div>
                            <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex flex-col items-center justify-center relative">
                              <span className="text-[8px] text-white/40 uppercase font-bold">Fim</span>
                              <span className="text-xs font-bold text-yellow-250 font-mono">{playerInventory?.endstone ?? 0}</span>
                            </div>
                            <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex flex-col items-center justify-center relative">
                              <span className="text-[8px] text-emerald-400/90 uppercase font-bold">Obs</span>
                              <span className="text-xs font-bold text-purple-400 font-mono">{playerInventory?.obsidian ?? 0}</span>
                            </div>
                          </div>

                          {/* Potion Consumables Slots - Click to drink */}
                          <div className="flex items-center gap-1.5">
                            {/* Speed potion */}
                            <button
                              onClick={() => {
                                if ((playerInventory?.speed_potion || 0) > 0) {
                                  usePotion('speed_potion');
                                }
                              }}
                              disabled={!(playerInventory?.speed_potion > 0)}
                              className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center relative transition ${
                                playerInventory?.speed_potion > 0
                                  ? 'bg-emerald-500/15 border-emerald-500/50 hover:bg-emerald-500/25 border cursor-pointer'
                                  : 'bg-white/5 border border-white/10 opacity-40 cursor-not-allowed'
                              }`}
                              title={playerInventory?.speed_potion > 0 ? 'Clique para beber Poção de Velocidade II!' : 'Sem Poção de Velocidade'}
                            >
                              <span className="text-[7px] text-emerald-300 uppercase font-bold">Veloc.</span>
                              <span className="text-xs font-black text-white font-mono">{playerInventory?.speed_potion || 0}</span>
                            </button>

                            {/* Strength potion */}
                            <button
                              onClick={() => {
                                if ((playerInventory?.strength_potion || 0) > 0) {
                                  usePotion('strength_potion');
                                }
                              }}
                              disabled={!(playerInventory?.strength_potion > 0)}
                              className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center relative transition ${
                                playerInventory?.strength_potion > 0
                                  ? 'bg-red-500/15 border-red-500/50 hover:bg-red-500/25 border cursor-pointer'
                                  : 'bg-white/5 border border-white/10 opacity-40 cursor-not-allowed'
                              }`}
                              title={playerInventory?.strength_potion > 0 ? 'Clique para beber Poção de Força I!' : 'Sem Poção de Força'}
                            >
                              <span className="text-[7px] text-red-300 uppercase font-bold">Força</span>
                              <span className="text-xs font-black text-white font-mono">{playerInventory?.strength_potion || 0}</span>
                            </button>

                            {/* Healing potion */}
                            <button
                              onClick={() => {
                                if ((playerInventory?.healing_potion || 0) > 0) {
                                  usePotion('healing_potion');
                                }
                              }}
                              disabled={!(playerInventory?.healing_potion > 0)}
                              className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center relative transition ${
                                playerInventory?.healing_potion > 0
                                  ? 'bg-pink-500/15 border-pink-500/50 hover:bg-pink-500/25 border cursor-pointer'
                                  : 'bg-white/5 border border-white/10 opacity-40 cursor-not-allowed'
                              }`}
                              title={playerInventory?.healing_potion > 0 ? 'Clique para Beber Poção de Cura Instantânea!' : 'Sem Poção de Cura'}
                            >
                              <span className="text-[7px] text-pink-300 uppercase font-bold">Cura</span>
                              <span className="text-xs font-black text-white font-mono">{playerInventory?.healing_potion || 0}</span>
                            </button>
                          </div>
                        </div>

                        {/* Active Timed Effects Indicator Display Overlay */}
                        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-30 select-none">
                          {activeEffects?.speed > 0 && (
                            <div className="bg-emerald-900/80 backdrop-blur border border-emerald-500/30 px-2.5 py-1 rounded-lg text-[10px] text-white flex items-center gap-2 font-mono shadow">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                              <span>VELOCIDADE II:</span>
                              <span className="font-bold text-emerald-300">{(activeEffects.speed / 1000).toFixed(0)}s</span>
                            </div>
                          )}
                          {activeEffects?.strength > 0 && (
                            <div className="bg-red-900/80 backdrop-blur border border-red-500/30 px-2.5 py-1 rounded-lg text-[10px] text-white flex items-center gap-2 font-mono shadow">
                              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                              <span>FORÇA I:</span>
                              <span className="font-bold text-red-300">{(activeEffects.strength / 1000).toFixed(0)}s</span>
                            </div>
                          )}
                          {activeEffects?.invisibility > 0 && (
                            <div className="bg-purple-900/80 backdrop-blur border border-purple-500/30 px-2.5 py-1 rounded-lg text-[10px] text-white flex items-center gap-2 font-mono shadow">
                              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                              <span>INVISIBILIDADE:</span>
                              <span className="font-bold text-purple-300">{(activeEffects.invisibility / 1000).toFixed(0)}s</span>
                            </div>
                          )}
                        </div>

                        {/* Game Over Modal view */}
                        {matchState?.status === 'ended' && (
                          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-4 z-50 rounded-2xl">
                            <h2 className="text-4xl font-black text-yellow-400 tracking-wider italic">TEMPO ESGOTADO / VITÓRIA</h2>
                            <p className="text-xl text-white/90">Time Campeão: <strong className="capitalize text-yellow-500 font-black font-mono">{matchState.winnerTeam}</strong></p>
                            <button
                              onClick={() => {
                                setMatchId(null);
                                setMatchState(null);
                              }}
                              className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 font-black px-6 py-2.5 rounded-xl text-sm mt-4 shadow-[0px_4px_0px_0px_rgba(180,130,0,1)] hover:translate-y-0.5"
                            >
                              VOLTAR AO MENU PRINCIPAL
                            </button>
                          </div>
                        )}
                      </div>

                      {/* In-game chat feed block */}
                      <div className="lg:col-span-3 bg-black/30 border border-white/10 rounded-2xl p-4 flex flex-col justify-between h-[300px] lg:h-full shadow-lg">
                        <h4 className="text-xs font-black text-yellow-400 uppercase border-b border-white/5 pb-2.5 mb-2.5 flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4 text-yellow-400" /> Bate-papo da Arena
                        </h4>
                        
                        <div className="flex-1 overflow-y-auto flex flex-col gap-2 p-1 pr-2 max-h-[16rem] lg:max-h-[26rem]">
                          {matchState?.chat.map(msg => (
                            <div key={msg.id} className="text-xs break-all leading-relaxed bg-white/5 p-2 rounded-lg border border-white/5">
                              {msg.system ? (
                                <span className="text-yellow-400/95 font-black uppercase font-mono tracking-wide">{msg.text}</span>
                              ) : (
                                <>
                                  <span className={`font-black uppercase mr-1`} style={{ color: msg.team === 'red' ? '#ef4444' : msg.team === 'blue' ? '#3b82f6' : msg.team === 'green' ? '#10b981' : '#eab308' }}>
                                    {msg.senderName}:
                                  </span>
                                  <span className="text-white/90 font-medium">{msg.text}</span>
                                </>
                              )}
                            </div>
                          ))}
                          <div ref={chatBottomRef} />
                        </div>

                        <form onSubmit={sendChatMessage} className="flex gap-2 border-t border-white/5 pt-3.5 mt-2.5">
                          <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Sua Mensagem..."
                            className="bg-black/40 border border-white/10 rounded-xl text-xs p-2.5 text-white/90 flex-1 focus:outline-none focus:border-yellow-400 transition"
                          />
                          <button type="submit" className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 p-2.5 rounded-xl transition shadow active:translate-y-0.5">
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      </div>
                    </div>

                    {/* Merchant Shop Modal Overlay */}
                    <AnimatePresence>
                      {shopOpen && (
                        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-sm select-none">
                          <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-indigo-950 border-4 border-yellow-500/35 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col"
                          >
                            
                            {/* Head shop */}
                            <div className="bg-black/45 p-4 border-b border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
                              <div className="flex items-center gap-2 text-yellow-400">
                                <ShoppingBag className="w-5 h-5 flex-shrink-0" />
                                <h3 className="text-base font-black tracking-wider italic">COMERCIANTE VOXEL</h3>
                              </div>
                              
                              <div className="flex bg-white/5 p-1 rounded-lg border border-white/5">
                                <button
                                  onClick={() => setShopTab('items')}
                                  className={`px-3 py-1 text-xs font-bold rounded-md transition ${shopTab === 'items' ? 'bg-yellow-500 text-slate-950' : 'text-white hover:text-yellow-400'}`}
                                >
                                  Loja de Itens
                                </button>
                                <button
                                  onClick={() => setShopTab('upgrades')}
                                  className={`px-3 py-1 text-xs font-bold rounded-md transition flex items-center gap-1 ${shopTab === 'upgrades' ? 'bg-yellow-500 text-slate-950' : 'text-white hover:text-yellow-400'}`}
                                >
                                  💎 Upgrades Base
                                </button>
                              </div>

                              <button onClick={() => setShopOpen(false)} className="text-white/60 hover:text-white transition hidden sm:block">
                                <X className="w-5 h-5" />
                              </button>
                            </div>

                            {/* Content shop */}
                            <div className="p-5 overflow-y-auto max-h-[25rem]">
                              
                              {shopTab === 'items' ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                  
                                  {/* BLOCKS CATEGORY */}
                                  <div className="sm:col-span-2 text-xs font-black text-yellow-400 uppercase tracking-widest border-b border-white/5 pb-1 select-none">
                                    🧱 Blocos de Construção
                                  </div>

                                  {/* Wool items block */}
                                  <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-black/50 transition">
                                    <div className="flex flex-col">
                                      <h4 className="text-xs font-bold text-white">Lã Colorida (x8)</h4>
                                      <span className="text-[10px] text-white/60 mt-0.5">Pontes e saltos rápidos.</span>
                                      <span className="text-xs text-yellow-400 font-black mt-1 font-mono">Custo: 2 Ferro</span>
                                    </div>
                                    <button
                                      onClick={() => buyShopItem('wool', 'iron', 2)}
                                      className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-3 rounded-lg text-xs font-black shadow"
                                    >
                                      COMPRAR
                                    </button>
                                  </div>

                                  {/* Wood safety blocks */}
                                  <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-black/50 transition">
                                    <div className="flex flex-col">
                                      <h4 className="text-xs font-bold text-white">Madeira de Carvalho (x4)</h4>
                                      <span className="text-[10px] text-white/60 mt-0.5">Defesa forte contra explosivos.</span>
                                      <span className="text-xs text-yellow-400 font-black mt-1 font-mono">Custo: 4 Ouro</span>
                                    </div>
                                    <button
                                      onClick={() => buyShopItem('wood', 'gold', 4)}
                                      className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-3 rounded-lg text-xs font-black shadow"
                                    >
                                      COMPRAR
                                    </button>
                                  </div>

                                  {/* Endstone bed protect blocks */}
                                  <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-black/50 transition">
                                    <div className="flex flex-col">
                                      <h4 className="text-xs font-bold text-white">Pedra do Fim (x8)</h4>
                                      <span className="text-[10px] text-white/60 mt-0.5">Resistente e alta rigidez.</span>
                                      <span className="text-xs text-yellow-400 font-black mt-1 font-mono">Custo: 2 Ouro</span>
                                    </div>
                                    <button
                                      onClick={() => buyShopItem('endstone', 'gold', 2)}
                                      className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-3 rounded-lg text-xs font-black shadow"
                                    >
                                      COMPRAR
                                    </button>
                                  </div>

                                  {/* Obsidian bed protect blocks */}
                                  <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-black/50 transition">
                                    <div className="flex flex-col">
                                      <h4 className="text-xs font-bold text-white">Obsidiana (x2)</h4>
                                      <span className="text-[10px] text-white/60 mt-0.5">Praticamente indestrutível.</span>
                                      <span className="text-xs text-emerald-400 font-black mt-1 font-mono">Custo: 4 Esmeralda</span>
                                    </div>
                                    <button
                                      onClick={() => buyShopItem('obsidian', 'emerald', 4)}
                                      className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-3 rounded-lg text-xs font-black shadow"
                                    >
                                      COMPRAR
                                    </button>
                                  </div>

                                  {/* WEAPONS CATEGORY */}
                                  <div className="sm:col-span-2 text-xs font-black text-yellow-400 uppercase tracking-widest border-b border-white/5 pb-1 mt-3 select-none">
                                    ⚔️ Equipamento & Combate
                                  </div>

                                  {/* Sword item upgrades */}
                                  <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-black/50 transition">
                                    <div className="flex flex-col">
                                      <h4 className="text-xs font-bold text-white">Espada de Pedra</h4>
                                      <span className="text-[10px] text-white/60 mt-0.5">+22 de Dano na investida.</span>
                                      <span className="text-xs text-yellow-400 font-black mt-1 font-mono">Custo: 8 Ferro</span>
                                    </div>
                                    <button
                                      onClick={() => buyShopItem('stone_sword', 'iron', 8)}
                                      className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-3 rounded-lg text-xs font-black shadow"
                                    >
                                      COMPRAR
                                    </button>
                                  </div>

                                  <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-black/50 transition">
                                    <div className="flex flex-col">
                                      <h4 className="text-xs font-bold text-white">Espada de Ferro</h4>
                                      <span className="text-[10px] text-white/60 mt-0.5">+30 de Dano na investida.</span>
                                      <span className="text-xs text-yellow-400 font-black mt-1 font-mono">Custo: 8 Ouro</span>
                                    </div>
                                    <button
                                      onClick={() => buyShopItem('iron_sword', 'gold', 8)}
                                      className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-3 rounded-lg text-xs font-black shadow"
                                    >
                                      COMPRAR
                                    </button>
                                  </div>

                                  <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-black/50 transition">
                                    <div className="flex flex-col">
                                      <h4 className="text-xs font-bold text-white">Espada de Diamante</h4>
                                      <span className="text-[10px] text-white/60 mt-0.5">+40 de Dano devastador.</span>
                                      <span className="text-xs text-emerald-400 font-black mt-1 font-mono">Custo: 4 Esmeralda</span>
                                    </div>
                                    <button
                                      onClick={() => buyShopItem('diamond_sword', 'emerald', 4)}
                                      className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-3 rounded-lg text-xs font-black shadow"
                                    >
                                      COMPRAR
                                    </button>
                                  </div>

                                  {/* Armors upgrades */}
                                  <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-black/50 transition">
                                    <div className="flex flex-col">
                                      <h4 className="text-xs font-bold text-white">Armadura de Ferro</h4>
                                      <span className="text-[10px] text-white/60 mt-0.5">Proteção média 30%.</span>
                                      <span className="text-xs text-yellow-400 font-black mt-1 font-mono">Custo: 12 Ferro</span>
                                    </div>
                                    <button
                                      onClick={() => buyShopItem('iron_armor', 'iron', 12)}
                                      className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-3 rounded-lg text-xs font-black shadow"
                                    >
                                      COMPRAR
                                    </button>
                                  </div>

                                  {/* Diamond armor high block */}
                                  <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-black/50 transition">
                                    <div className="flex flex-col">
                                      <h4 className="text-xs font-bold text-white">Armadura de Diamante</h4>
                                      <span className="text-[10px] text-white/60 mt-0.5">Proteção pesada 50%.</span>
                                      <span className="text-xs text-yellow-400 font-black mt-1 font-mono">Custo: 6 Ouro</span>
                                    </div>
                                    <button
                                      onClick={() => buyShopItem('diamond_armor', 'gold', 6)}
                                      className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-3 rounded-lg text-xs font-black shadow"
                                    >
                                      COMPRAR
                                    </button>
                                  </div>

                                  {/* TOOLS CATEGORY */}
                                  <div className="sm:col-span-2 text-xs font-black text-yellow-400 uppercase tracking-widest border-b border-white/5 pb-1 mt-3 select-none">
                                    🛠️ Ferramentas
                                  </div>

                                  <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-black/50 transition">
                                    <div className="flex flex-col">
                                      <h4 className="text-xs font-bold text-white">Picareta de Mineração</h4>
                                      <span className="text-[10px] text-white/60 mt-0.5">Melhora quebra de Obsidian.</span>
                                      <span className="text-xs text-yellow-400 font-black mt-1 font-mono">Custo: 3 Ouro</span>
                                    </div>
                                    <button
                                      onClick={() => buyShopItem('pickaxe', 'gold', 3)}
                                      className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-3 rounded-lg text-xs font-black shadow"
                                    >
                                      COMPRAR
                                    </button>
                                  </div>

                                  {/* POTIONS CATEGORY */}
                                  <div className="sm:col-span-2 text-xs font-black text-yellow-400 uppercase tracking-widest border-b border-white/5 pb-1 mt-3 select-none">
                                    🧪 Poções Consumíveis
                                  </div>

                                  <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-black/50 transition">
                                    <div className="flex flex-col">
                                      <h4 className="text-xs font-bold text-white">Poção de Velocidade II</h4>
                                      <span className="text-[10px] text-white/60 mt-0.5">Corre mais rápido por 30s.</span>
                                      <span className="text-xs text-emerald-400 font-black mt-1 font-mono">Custo: 1 Esmeralda</span>
                                    </div>
                                    <button
                                      onClick={() => buyShopItem('speed_potion', 'emerald', 1)}
                                      className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-3 rounded-lg text-xs font-black shadow"
                                    >
                                      COMPRAR
                                    </button>
                                  </div>

                                  <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-black/50 transition">
                                    <div className="flex flex-col">
                                      <h4 className="text-xs font-bold text-white">Poção de Força I</h4>
                                      <span className="text-[10px] text-white/60 mt-0.5">+50% Dano extra por 30s.</span>
                                      <span className="text-xs text-emerald-400 font-black mt-1 font-mono">Custo: 2 Esmeralda</span>
                                    </div>
                                    <button
                                      onClick={() => buyShopItem('strength_potion', 'emerald', 2)}
                                      className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-3 rounded-lg text-xs font-black shadow"
                                    >
                                      COMPRAR
                                    </button>
                                  </div>

                                  <div className="bg-black/35 border border-white/5 p-3 rounded-xl flex items-center justify-between hover:bg-black/50 transition">
                                    <div className="flex flex-col">
                                      <h4 className="text-xs font-bold text-white">Cura Instantânea</h4>
                                      <span className="text-[10px] text-white/60 mt-0.5">Recupera toda vida instantâneo.</span>
                                      <span className="text-xs text-emerald-400 font-black mt-1 font-mono">Custo: 1 Esmeralda</span>
                                    </div>
                                    <button
                                      onClick={() => buyShopItem('healing_potion', 'emerald', 1)}
                                      className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-3 rounded-lg text-xs font-black shadow"
                                    >
                                      COMPRAR
                                    </button>
                                  </div>

                                </div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  
                                  {/* UPGRADES ARBORESCENT TREE STRUCTURE */}
                                  <div className="sm:col-span-2 text-xs font-black text-cyan-400 uppercase tracking-widest border-b border-white/5 pb-1 select-none flex items-center justify-between">
                                    <span>🌟 Árvore de Upgrades do Time ({myTeam.toUpperCase()})</span>
                                    <span className="text-[11px] text-white/60 font-medium">Melhorias duráveis compradas com Diamantes</span>
                                  </div>

                                  {/* Sharpness team upgrade */}
                                  <div className="bg-black/35 border border-white/5 p-4 rounded-2xl flex flex-col justify-between hover:bg-black/45 transition">
                                    <div>
                                      <div className="flex justify-between items-start">
                                        <h4 className="text-sm font-bold text-white">Espadas de Sharpness</h4>
                                        <span className="text-[10px] py-0.5 px-2 bg-blue-500/10 text-cyan-400 rounded-md font-mono border border-cyan-500/10">Permanente</span>
                                      </div>
                                      <p className="text-[11px] text-white/60 mt-2">Dá +5 de dano adicional a todas as espadas compradas pelo time.</p>
                                    </div>
                                    <div className="mt-4 flex items-center justify-between">
                                      <span className="text-xs font-black text-cyan-400 font-mono">Custo: 4 Diamantes</span>
                                      {matchState?.teamUpgrades?.[myTeam]?.sharpness ? (
                                        <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/10">ATIVO ✓</span>
                                      ) : (
                                        <button
                                          onClick={() => buyShopUpgrade('sharpness', 4)}
                                          className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-4 rounded-xl text-xs font-black shadow"
                                        >
                                          DESBLOQUEAR
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Armor Protection upgrade (tiered 1-3) */}
                                  <div className="bg-black/35 border border-white/5 p-4 rounded-2xl flex flex-col justify-between hover:bg-black/45 transition">
                                    <div>
                                      <div className="flex justify-between items-start">
                                        <h4 className="text-sm font-bold text-white">Proteção do Time</h4>
                                        <span className="text-[10px] py-0.5 px-2 bg-blue-500/10 text-cyan-400 rounded-md font-mono border border-cyan-500/10">Multi-Nível</span>
                                      </div>
                                      <p className="text-[11px] text-white/60 mt-2">Reduz dano recebido em 10% por nível (Até {matchState?.teamUpgrades?.[myTeam]?.protection || 0}/3).</p>
                                    </div>
                                    <div className="mt-4 flex items-center justify-between">
                                      <span className="text-xs font-black text-cyan-400 font-mono">
                                        {(matchState?.teamUpgrades?.[myTeam]?.protection || 0) >= 3 
                                          ? 'Nível Máximo' 
                                          : `Custo: ${((matchState?.teamUpgrades?.[myTeam]?.protection || 0) + 1) * 2} Diamantes`}
                                      </span>
                                      {(matchState?.teamUpgrades?.[myTeam]?.protection || 0) >= 3 ? (
                                        <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/10">NÍVEL MÁXIMO ✓</span>
                                      ) : (
                                        <button
                                          onClick={() => buyShopUpgrade('protection', ((matchState?.teamUpgrades?.[myTeam]?.protection || 0) + 1) * 2)}
                                          className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-4 rounded-xl text-xs font-black shadow"
                                        >
                                          MELHORAR (Nvl {(matchState?.teamUpgrades?.[myTeam]?.protection || 0) + 1})
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Fast Mining haste upgrade (tiered 1-2) */}
                                  <div className="bg-black/35 border border-white/5 p-4 rounded-2xl flex flex-col justify-between hover:bg-black/45 transition">
                                    <div>
                                      <div className="flex justify-between items-start">
                                        <h4 className="text-sm font-bold text-white">Mineração Haste</h4>
                                        <span className="text-[10px] py-0.5 px-2 bg-blue-500/10 text-cyan-400 rounded-md font-mono border border-cyan-500/10">Multi-Nível</span>
                                      </div>
                                      <p className="text-[11px] text-white/60 mt-2">Aumenta eficiência de mineração e quebra de blocos adversários em 25% por nível.</p>
                                    </div>
                                    <div className="mt-4 flex items-center justify-between">
                                      <span className="text-xs font-black text-cyan-400 font-mono">
                                        {(matchState?.teamUpgrades?.[myTeam]?.haste || 0) >= 2 
                                          ? 'Nível Máximo' 
                                          : `Custo: 2 Diamantes`}
                                      </span>
                                      {(matchState?.teamUpgrades?.[myTeam]?.haste || 0) >= 2 ? (
                                        <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/10">NÍVEL MÁXIMO ✓</span>
                                      ) : (
                                        <button
                                          onClick={() => buyShopUpgrade('haste', 2)}
                                          className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-4 rounded-xl text-xs font-black shadow"
                                        >
                                          MELHORAR (Nvl {(matchState?.teamUpgrades?.[myTeam]?.haste || 0) + 1})
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Alarm trap upgrade */}
                                  <div className="bg-black/35 border border-white/5 p-4 rounded-2xl flex flex-col justify-between hover:bg-black/45 transition">
                                    <div>
                                      <div className="flex justify-between items-start">
                                        <h4 className="text-sm font-bold text-white">Armadilha de Alarme</h4>
                                        <span className="text-[10px] py-0.5 px-2 bg-red-400/10 text-red-400 rounded-md font-mono border border-red-400/10">Defensiva</span>
                                      </div>
                                      <p className="text-[11px] text-white/60 mt-2 font-medium">Primeiro adversário na base soará um alarme alto no chat do time.</p>
                                    </div>
                                    <div className="mt-4 flex items-center justify-between">
                                      <span className="text-xs font-black text-cyan-400 font-mono">Custo: 2 Diamantes</span>
                                      {matchState?.teamUpgrades?.[myTeam]?.bedDefense ? (
                                        <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/10">ARMADO ✓</span>
                                      ) : (
                                        <button
                                          onClick={() => buyShopUpgrade('bedDefense', 2)}
                                          className="bg-yellow-400 hover:bg-yellow-350 text-indigo-950 py-1.5 px-4 rounded-xl text-xs font-black shadow"
                                        >
                                          ATIVAR ARMADILHA
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                </div>
                              )}

                            </div>

                            {/* Foot wallet info */}
                            <div className="bg-black/55 p-4 border-t border-white/5 flex flex-wrap items-center justify-between text-xs text-white/70 select-none gap-2">
                              <span>Mineras Disponíveis:</span>
                              <div className="flex flex-wrap gap-2">
                                <span className="bg-white/5 border border-white/5 px-2.5 py-1 rounded-xl font-mono font-bold text-slate-300">{coins.iron} Ferro</span>
                                <span className="bg-white/5 border border-white/5 px-2.5 py-1 rounded-xl font-mono font-bold text-yellow-400">{coins.gold} Ouro</span>
                                <span className="bg-white/5 border border-white/5 px-2.5 py-1 rounded-xl font-mono font-bold text-cyan-400">{coins.diamond} Diamantes</span>
                                <span className="bg-white/5 border border-white/5 px-2.5 py-1 rounded-xl font-mono font-bold text-emerald-400">{coins.emerald} Esmeraldas</span>
                              </div>
                            </div>
                          </motion.div>
                        </div>
                      )}
                    </AnimatePresence>

                  </div>
                )}

              </div>
            )}

          </div>
        )}

      </main>

      {/* Footer copyright */}
      <footer className="bg-black/60 backdrop-blur-md border-t border-white/10 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-2.5 relative z-10 text-[10px] text-white/40 tracking-wider font-medium select-none">
        <p>© 2026 BEDWARSWEB - INDIE VOXEL ENGINE — TODOS OS DIREITOS RESERVADOS.</p>
        <div className="flex space-x-4">
          <span>WebGL / Three.js</span>
          <span>WebSockets Live</span>
          <span className="font-bold text-yellow-400">HTML5 AUDIO GATE</span>
        </div>
      </footer>
    </div>
  );
}
