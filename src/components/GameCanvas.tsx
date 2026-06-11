import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MatchState, PlayerState, VoxelBlock, Team, SKINS_LIST } from '../types';
import { playAudio } from '../utils/audio';
import { getMapThemes } from '../utils/mapThemes';
import { getCustomSkinById } from '../utils/skinDatabase';
import { COSMETICS_LIST } from '../utils/cosmetics';
import { Sword, Compass, Shield, ShieldCheck, ShoppingBag, Pickaxe, Zap, Award } from 'lucide-react';

const teamHexColors: Record<Team, string> = {
  red: '#ef4444',
  blue: '#2563eb',
  green: '#10b981',
  yellow: '#eab308',
  cyan: '#06b6d4',
  white: '#ffffff',
  pink: '#ec4899',
  gray: '#9ca3af'
};

interface GameCanvasProps {
  match: MatchState;
  username: string;
  myTeam: Team;
  ws: WebSocket | null;
  onOpenShop: () => void;
  coins: { iron: number; gold: number; diamond: number; emerald: number };
}

export default function GameCanvas({ match, username, myTeam, ws, onOpenShop, coins }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Refs for three.js resources
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  
  // Gameplay physics & position refs (to avoid React state delay in render loop)
  const playerPos = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 1.5, z: -35 });
  const playerVel = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const keyboard = useRef<Record<string, boolean>>({});
  const isGrounded = useRef<boolean>(true);
  const camAngle = useRef<{ phi: number; theta: number }>({ phi: 0, theta: Math.PI / 2 }); // third person orbit control
  
  // Sword swing animation state
  const isSwingingRef = useRef<boolean>(false);
  const swingTimerRef = useRef<number>(0);
  const swordMeshRef = useRef<THREE.Mesh | null>(null);

  // Drag state
  const isDragging = useRef<boolean>(false);
  const previousMousePosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Map to hold other players' mesh groups
  const playerMeshes = useRef<Record<string, { group: THREE.Group; lastUpdate: number }>>({});
  // Map to hold blocks' meshes
  const blockMeshes = useRef<Record<string, THREE.Mesh>>({});
  // List of active spawner crystals
  const generatorMeshes = useRef<Record<string, THREE.Mesh>>({});

  // Local state for UI feedback
  const [nearShopkeeper, setNearShopkeeper] = useState<boolean>(false);
  const [respawnText, setRespawnText] = useState<string | null>(null);
  const [selectedBlockType, setSelectedBlockType] = useState<'wool' | 'wood' | 'endstone' | 'obsidian'>('wool');

  // Load correct spawn position based on player team
  useEffect(() => {
    const teamPositions: Record<Team, { x: number; y: number; z: number }> = {
      red: { x: 0, y: 1.5, z: -35 },
      blue: { x: 0, y: 1.5, z: 35 },
      green: { x: 35, y: 1.5, z: 0 },
      yellow: { x: -35, y: 1.5, z: 0 },
      cyan: { x: -25, y: 1.5, z: 25 },
      white: { x: 25, y: 1.5, z: 25 },
      pink: { x: 25, y: 1.5, z: -25 },
      gray: { x: -25, y: 1.5, z: -25 }
    };
    const startPos = teamPositions[myTeam] || { x: 0, y: 1.5, z: 0 };
    playerPos.current = { ...startPos };
    playerVel.current = { x: 0, y: 0, z: 0 };
  }, [myTeam]);

  // Handle keys and drag interactions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keyboard.current[e.key.toLowerCase()] = true;
      
      // Select block options via hotkeys 1-4
      if (e.key === '1') setSelectedBlockType('wool');
      if (e.key === '2') setSelectedBlockType('wood');
      if (e.key === '3') setSelectedBlockType('endstone');
      if (e.key === '4') setSelectedBlockType('obsidian');

      if (e.key === 'e' && nearShopkeeper) {
        onOpenShop();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keyboard.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [nearShopkeeper, onOpenShop]);

  // Setup Three Game Loop
  useEffect(() => {
    if (!containerRef.current) return;

    // Find the current map theme colors
    const allThemes = getMapThemes();
    const currentTheme = allThemes.find(t => t.name === match.mapTheme) || allThemes[0];
    const targetSkyColor = currentTheme ? currentTheme.skyColor : '#38bdf8';

    // Create scene, camera, renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(targetSkyColor);
    sceneRef.current = scene;

    // Fog for blocky horizon depth
    scene.fog = new THREE.FogExp2(targetSkyColor, 0.015);

    const camera = new THREE.PerspectiveCamera(65, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;
    containerRef.current.appendChild(renderer.domElement);

    // Ambiant & Directional lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
    sunLight.position.set(40, 100, 30);
    sunLight.castShadow = true;
    scene.add(sunLight);

    // Generates dynamic colored canvases to act as pixelated wool textures
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 16;
    textureCanvas.height = 16;
    const ctx = textureCanvas.getContext('2d')!;

    // Create a dictionary of textures per team color & block type
    function buildPixelTexture(type: string, teamColor?: string) {
      ctx.fillStyle = teamColor || (type === "endstone" ? "#eab308" : type === "wood" ? "#78350f" : "#451a03");
      ctx.fillRect(0, 0, 16, 16);
      
      // Paint pixel jittering
      for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
          if ((x + y) % 3 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(x, y, 1, 1);
          } else if ((x - y) % 4 === 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.08)';
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
      return new THREE.CanvasTexture(textureCanvas.cloneNode(true) as HTMLCanvasElement);
    }

    // Keep block Geometries
    const voxelGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98);

    // Render original voxel blocks of BedWarsWeb
    const blockKeys = Object.keys(match.blocks);
    blockKeys.forEach(key => {
      const b = match.blocks[key];
      let col = '#a1a1aa'; // default stone
      if (b.team) {
        col = teamHexColors[b.team];
      } else if (b.type === 'wood') {
        col = '#a16207';
      } else if (b.type === 'endstone') {
        col = '#fef08a';
      } else if (b.type === 'obsidian') {
        col = '#1e1b4b';
      }

      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(col),
        roughness: 0.9,
        metalness: 0.1,
      });

      const mesh = new THREE.Mesh(voxelGeo, mat);
      mesh.position.set(b.x, b.y, b.z);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      scene.add(mesh);
      blockMeshes.current[key] = mesh;
    });

    // Spawn Diamond/Emerald rotating visuals
    match.generators.forEach(gen => {
      const crystalGeo = new THREE.OctahedronGeometry(0.5, 0);
      const isEmerald = gen.type === 'emerald';
      const crystalMat = new THREE.MeshStandardMaterial({
        color: isEmerald ? 0x10b981 : 0x0ea5e9,
        roughness: 0.2,
        metalness: 0.8,
        emissive: isEmerald ? 0x047857 : 0x0284c7,
        emissiveIntensity: 0.5,
      });

      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      crystal.position.set(gen.x, gen.y + 1, gen.z);
      scene.add(crystal);
      generatorMeshes.current[gen.id] = crystal;

      // Spawner ring foundation
      const ringGeo = new THREE.RingGeometry(0.7, 0.8, 8);
      const ringMat = new THREE.MeshBasicMaterial({ color: isEmerald ? 0x10b981 : 0x0ea5e9, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(gen.x, gen.y + 0.1, gen.z);
      scene.add(ring);
    });

    // Set up Shopkeeper block models
    const teamsList: Team[] = ['red', 'blue', 'green', 'yellow', 'cyan', 'white', 'pink', 'gray'];
    const teamPositionsList: Record<Team, [number, number]> = {
      red: [0, -35],
      blue: [0, 35],
      green: [35, 0],
      yellow: [-35, 0],
      cyan: [-25, 25],
      white: [25, 25],
      pink: [25, -25],
      gray: [-25, -25]
    };

    teamsList.forEach(t => {
      const [tx, tz] = teamPositionsList[t];
      // Simple shopkeeper styled box model
      const shopGroup = new THREE.Group();
      shopGroup.position.set(tx + 2, -1.8, tz - 2);

      // Body (brown wool)
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x7c2d12 }));
      torso.position.y = 0.6;
      shopGroup.add(torso);

      // Head
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0xfcc194 }));
      head.position.y = 1.3;
      shopGroup.add(head);

      // Cap
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.7), new THREE.MeshStandardMaterial({ color: 0x111827 }));
      cap.position.y = 1.6;
      shopGroup.add(cap);

      scene.add(shopGroup);
    });

    // Create local player sword mesh (attached to camera or animated locally overlay)
    const swordGroup = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), new THREE.MeshStandardMaterial({ color: 0x451a03 }));
    handle.position.y = -0.25;
    swordGroup.add(handle);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.15), new THREE.MeshStandardMaterial({ color: 0xeab308 }));
    guard.position.y = -0.1;
    swordGroup.add(guard);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.06), new THREE.MeshStandardMaterial({ color: 0x38bdf8 }));
    blade.position.y = 0.35;
    swordGroup.add(blade);

    swordGroup.scale.set(0.6, 0.6, 0.6);
    scene.add(swordGroup);
    swordMeshRef.current = swordGroup as unknown as THREE.Mesh;

    // Handle mouse drag orbiting camera parameters
    const onMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      previousMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const deltaX = e.clientX - previousMousePosition.current.x;
      const deltaY = e.clientY - previousMousePosition.current.y;

      // Update camera orbital rotations
      camAngle.current.theta -= deltaX * 0.007;
      camAngle.current.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, camAngle.current.phi + deltaY * 0.007));

      previousMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging.current = false;
    };

    const containerElem = containerRef.current;
    containerElem.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Main animation ticking loop
    let reqId = requestAnimationFrame(animate);

    function animate() {
      reqId = requestAnimationFrame(animate);

      // 1. Controls & Player Physics
      const pState = match.players.find(p => p.username === username);
      if (pState && pState.isDead) {
        setRespawnText(`Respawning in ${pState.respawnTime}s...`);
        // Force player mesh to sky or void
        playerPos.current.y = -999;
      } else {
        setRespawnText(null);
        if (playerPos.current.y < -15) {
          // Fallen into void
          playAudio.playHit();
          playerPos.current.y = -20;
          // Notify server of damage / void fall
          ws?.send(JSON.stringify({
            type: "game:attack",
            payload: { targetName: username, damage: 100 }
          }));
        } else {
          // Normal physics (Moving)
          const moveSpeed = 0.16;
          const targetDir = new THREE.Vector3();
          
          // Calculate camera look directions
          const forwardVec = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), camAngle.current.theta);
          const rightVec = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), camAngle.current.theta);

          if (keyboard.current['w'] || keyboard.current['arrowup']) targetDir.add(forwardVec);
          if (keyboard.current['s'] || keyboard.current['arrowdown']) targetDir.add(forwardVec.negate());
          if (keyboard.current['a'] || keyboard.current['arrowleft']) targetDir.add(rightVec.negate());
          if (keyboard.current['d'] || keyboard.current['arrowright']) targetDir.add(rightVec);

          if (targetDir.lengthSq() > 0) {
            targetDir.normalize();
            playerPos.current.x += targetDir.x * moveSpeed;
            playerPos.current.z += targetDir.z * moveSpeed;
            
            // Sync movement coords to server at slight throttle inside animation loop
            if (Math.random() < 0.2) {
              ws?.send(JSON.stringify({
                type: "game:move",
                payload: {
                  x: playerPos.current.x,
                  y: playerPos.current.y,
                  z: playerPos.current.z,
                  rotY: camAngle.current.theta
                }
              }));
            }
          }

          // Jump & gravity loop
          const playerRadius = 0.5;
          const px = playerPos.current.x;
          const py = playerPos.current.y;
          const pz = playerPos.current.z;

          // Simple block collision checks
          let belowBlockFound = false;
          let highestY = -15;

          const keys = Object.keys(match.blocks);
          for (let i = 0; i < keys.length; i++) {
            const b = match.blocks[keys[i]];
            // Math.abs bounds check
            if (Math.abs(px - b.x) < 0.9 && Math.abs(pz - b.z) < 0.9) {
              const checkY = b.y + 0.99; // standing platform top
              if (py >= checkY - 0.4 && py <= checkY + 0.1) {
                belowBlockFound = true;
                if (checkY > highestY) highestY = checkY;
              }
            }
          }

          if (belowBlockFound) {
            isGrounded.current = true;
            playerPos.current.y = highestY;
            playerVel.current.y = 0;
          } else {
            isGrounded.current = false;
            playerVel.current.y -= 0.012; // gravity pull
          }

          // Trigger jump
          if (isGrounded.current && keyboard.current[' ']) {
            playerVel.current.y = 0.22;
            isGrounded.current = false;
          }

          playerPos.current.y += playerVel.current.y;
        }
      }

      // 2. Camera placement (Orbit view)
      const r = 5.5; // follow radius distance
      const theta = camAngle.current.theta;
      const phi = camAngle.current.phi;

      camera.position.x = playerPos.current.x + r * Math.sin(theta) * Math.cos(phi);
      camera.position.y = playerPos.current.y + 1.2 + r * Math.sin(phi);
      camera.position.z = playerPos.current.z + r * Math.cos(theta) * Math.cos(phi);
      camera.lookAt(playerPos.current.x, playerPos.current.y + 0.8, playerPos.current.z);

      // 3. Sword position anchoring inside orbit matrix
      if (swordGroup) {
        if (isSwingingRef.current) {
          swingTimerRef.current += 1;
          const swingAngle = Math.sin((swingTimerRef.current / 8) * Math.PI) * 0.9;
          swordGroup.position.set(
            playerPos.current.x + 0.45 * Math.sin(theta - 0.5),
            playerPos.current.y + 0.4 - Math.sin(swingAngle) * 0.2,
            playerPos.current.z + 0.45 * Math.cos(theta - 0.5)
          );
          swordGroup.rotation.set(-swingAngle, theta + Math.PI / 4, -swingAngle * 0.5);
          if (swingTimerRef.current >= 8) {
            isSwingingRef.current = false;
            swingTimerRef.current = 0;
          }
        } else {
          // follow naturally idle
          swordGroup.position.set(
            playerPos.current.x + 0.45 * Math.sin(theta - 0.5),
            playerPos.current.y + 0.4,
            playerPos.current.z + 0.45 * Math.cos(theta - 0.5)
          );
          swordGroup.rotation.set(0.1, theta + Math.PI / 4, 0);
        }
      }

      // 4. Animate Diamond & Emerald floating generators
      Object.keys(generatorMeshes.current).forEach(id => {
        const mesh = generatorMeshes.current[id];
        if (mesh) {
          mesh.rotation.y += 0.035;
          mesh.position.y = match.generators.find(g => g.id === id)!.y + 1 + Math.sin(Date.now() * 0.0035) * 0.15;
          
          // Pickup trigger distance
          const gen = match.generators.find(g => g.id === id);
          if (gen) {
            const dist = Math.hypot(playerPos.current.x - gen.x, playerPos.current.y - (gen.y + 1), playerPos.current.z - gen.z);
            if (dist < 1.6 && Math.random() < 0.1) {
              playAudio.playPickup();
              ws?.send(JSON.stringify({
                type: "game:claim_spawner_coins",
                payload: { coinType: gen.type, amount: 1 }
              }));
            }
          }
        }
      });

      // 5. Update local proximity to Shopkeeper
      const teamPositionsList: Record<Team, [number, number]> = {
        red: [0, -35],
        blue: [0, 35],
        green: [35, 0],
        yellow: [-35, 0],
        cyan: [-25, 25],
        white: [25, 25],
        pink: [25, -25],
        gray: [-25, -25]
      };
      const [tx, tz] = teamPositionsList[myTeam];
      const distToShop = Math.hypot(playerPos.current.x - (tx + 2), playerPos.current.z - (tz - 2));
      const near = distToShop < 3.2;
      setNearShopkeeper(near);

      // 6. Update online/other players meshes dynamically
      match.players.forEach(p => {
        if (p.username === username) return; // skip self

        let pGroupObj = playerMeshes.current[p.username];
        if (!pGroupObj) {
          // Instantiate a cute blocky model
          const group = new THREE.Group();
          
          // Head (Box) with dynamic custom skins
          const skinData = getCustomSkinById(p.skinId);
          const skinHexColor = skinData?.skinHex || '#fdba74';
          const headGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
          const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(skinHexColor), roughness: 0.8 });
          const headMesh = new THREE.Mesh(headGeo, headMat);
          headMesh.position.y = 1.35;
          group.add(headMesh);

          // Add cute blocky eyes and hair overlay representing custom Hypixel skin features
          const hairColor = skinData?.hairColor || '#451a03';
          const hairGeo = new THREE.BoxGeometry(0.57, 0.18, 0.57);
          const hairMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(hairColor), roughness: 0.9 });
          const hairMesh = new THREE.Mesh(hairGeo, hairMat);
          hairMesh.position.set(0, 1.55, 0); // Hair cap
          group.add(hairMesh);

          const eyeColor = skinData?.eyeColor || '#3b82f6';
          const eyeGeo = new THREE.BoxGeometry(0.12, 0.06, 0.04);
          const eyeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(eyeColor) });
          
          const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
          leftEye.position.set(0.14, 1.32, 0.28);
          group.add(leftEye);

          const rightEye = leftEye.clone();
          rightEye.position.x = -0.14;
          group.add(rightEye);

          // BODY / TORSO (Team color)
          const torsoGeo = new THREE.BoxGeometry(0.7, 1.0, 0.45);
          const torsoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamHexColors[p.team]), roughness: 0.7 });
          const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
          torsoMesh.position.y = 0.6;
          group.add(torsoMesh);

          // Lunar Cosmetics: 1. CAPE (Capas de pvp com cores vibrantes)
          if (p.selectedCape && p.selectedCape !== 'none') {
            const capeDef = COSMETICS_LIST.find(c => c.id === p.selectedCape);
            const capeColor = capeDef ? capeDef.color : '#ef4444';
            const capeGeo = new THREE.BoxGeometry(0.48, 0.75, 0.04);
            const capeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(capeColor), roughness: 0.6 });
            const capeMesh = new THREE.Mesh(capeGeo, capeMat);
            capeMesh.position.set(0, 0.5, -0.26); // Behind torso
            capeMesh.rotation.x = 0.08; // slightly loose flap
            group.add(capeMesh);
          }

          // Lunar Cosmetics: 2. HALO (Auréola dourada flutuante)
          if (p.selectedHalo && p.selectedHalo !== 'none') {
            const haloGeo = new THREE.RingGeometry(0.18, 0.23, 16);
            const haloMat = new THREE.MeshStandardMaterial({ color: 0xffea00, emissive: 0xffaa00, side: THREE.DoubleSide, roughness: 0.1 });
            const haloMesh = new THREE.Mesh(haloGeo, haloMat);
            haloMesh.position.set(0, 1.72, 0);
            haloMesh.rotation.x = Math.PI / 2; // Flat horizontal above head
            group.add(haloMesh);
          }

          // Lunar Cosmetics: 3. WINGS (Asas de dragão / asas angelicais)
          if (p.selectedWings && p.selectedWings !== 'none') {
            const wingDef = COSMETICS_LIST.find(c => c.id === p.selectedWings);
            const wingColor = wingDef ? wingDef.color : '#a855f7';
            
            // Left Wing
            const leftWingGeo = new THREE.BoxGeometry(0.65, 0.3, 0.04);
            const wingMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(wingColor), roughness: 0.5, side: THREE.DoubleSide });
            const leftWing = new THREE.Mesh(leftWingGeo, wingMat);
            leftWing.position.set(0.4, 0.7, -0.24);
            leftWing.rotation.set(0, -Math.PI / 6, Math.PI / 12);
            group.add(leftWing);

            // Right Wing
            const rightWing = leftWing.clone();
            rightWing.position.x = -0.4;
            rightWing.rotation.set(0, Math.PI / 6, -Math.PI / 12);
            group.add(rightWing);
          }

          // Lunar Cosmetics: 4. HAT / CROWN (Coroa de rei dourada)
          if (p.selectedHat && p.selectedHat !== 'none') {
            const hatGeo = new THREE.BoxGeometry(0.6, 0.15, 0.6);
            const hatMat = new THREE.MeshStandardMaterial({ color: 0xffea00, roughness: 0.2 });
            const hatMesh = new THREE.Mesh(hatGeo, hatMat);
            hatMesh.position.set(0, 1.66, 0); // On top of head
            group.add(hatMesh);
          }

          // Head text badge
          const canvas = document.createElement('canvas');
          canvas.width = 120;
          canvas.height = 32;
          const ctx2d = canvas.getContext('2d')!;
          ctx2d.font = 'bold 16px sans-serif';
          ctx2d.fillStyle = teamHexColors[p.team];
          ctx2d.fillText(p.username, 8, 22);

          const badgeTex = new THREE.CanvasTexture(canvas);
          const badgeMat = new THREE.SpriteMaterial({ map: badgeTex });
          const badge = new THREE.Sprite(badgeMat);
          badge.position.y = 1.8;
          badge.scale.set(1.5, 0.4, 1.0);
          group.add(badge);

          scene.add(group);
          pGroupObj = { group, lastUpdate: Date.now() };
          playerMeshes.current[p.username] = pGroupObj;
        }

        // Apply placement data instantly (with smooth rotation updates)
        if (!p.isDead) {
          pGroupObj.group.position.set(p.x, p.y, p.z);
          pGroupObj.group.rotation.y = p.rotY;
          pGroupObj.group.visible = true;
        } else {
          pGroupObj.group.visible = false;
        }
      });

      // Cleanup left players
      Object.keys(playerMeshes.current).forEach(pName => {
        if (!match.players.find(p => p.username === pName)) {
          scene.remove(playerMeshes.current[pName].group);
          delete playerMeshes.current[pName];
        }
      });

      renderer.render(scene, camera);
    }

    // Handle container Resizing fluidly per ResizeObserver constraint
    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(reqId);
      resizeObserver.disconnect();
      containerElem.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (rendererRef.current) {
        containerElem?.removeChild(rendererRef.current.domElement);
      }
    };
  }, [match.blocks, match.players, nearShopkeeper]);

  // Execute voxel actions (left click to break block, right click/E action to place)
  const handleVoxelAction = (action: 'place' | 'break' | 'attack') => {
    if (action === 'attack') {
      isSwingingRef.current = true;
      swingTimerRef.current = 0;
      playAudio.playHit();

      // Check if enemy player is close enough to damage them
      match.players.forEach(p => {
        if (p.username === username || p.isDead || p.team === myTeam) return;
        const dist = Math.hypot(playerPos.current.x - p.x, playerPos.current.z - p.z);
        if (dist < 3.2) {
          // Attacked! Send hit event to server
          ws?.send(JSON.stringify({
            type: "game:attack",
            payload: { targetName: p.username, damage: 25 }
          }));
        }
      });

      // Check if opponent Bed is close to destroy it
      const bedsPositions: Record<Team, [number, number]> = {
        red: [0, -35],
        blue: [0, 35],
        green: [35, 0],
        yellow: [-35, 0],
        cyan: [-25, 25],
        white: [25, 25],
        pink: [25, -25],
        gray: [-25, -25]
      };

      Object.entries(bedsPositions).forEach(([t, pos]) => {
        if (t !== myTeam && match.beds[t as Team]) {
          const distBed = Math.hypot(playerPos.current.x - pos[0], playerPos.current.z - (pos[1] - 1));
          if (distBed < 3.5) {
            playAudio.playBedBreak();
            ws?.send(JSON.stringify({
              type: "game:break_bed",
              payload: { targetTeam: t }
            }));
          }
        }
      });
    }

    if (action === 'place') {
      // Deduct wool blocks
      const metalType = selectedBlockType === 'wool' ? 'iron' : selectedBlockType === 'wood' ? 'gold' : 'diamond';
      const cost = selectedBlockType === 'wool' ? 2 : 4;
      
      const balance = coins[metalType as keyof typeof coins];
      if (balance >= cost) {
        // Place block straight in front of our looking coordinates
        const lookAngle = camAngle.current.theta;
        const placeX = Math.round(playerPos.current.x + Math.sin(lookAngle) * 1.5);
        const placeZ = Math.round(playerPos.current.z + Math.cos(lookAngle) * 1.5);
        const placeY = Math.round(playerPos.current.y - 0.5);

        // Send place request
        ws?.send(JSON.stringify({
          type: "game:claim_spawner_coins",
          payload: { coinType: metalType, amount: -cost }
        }));

        ws?.send(JSON.stringify({
          type: "game:place_block",
          payload: { x: placeX, y: placeY, z: placeZ, type: selectedBlockType }
        }));
        playAudio.playPlace();
      }
    }

    if (action === 'break') {
      // Find block straight forward and delete it
      const lookAngle = camAngle.current.theta;
      const tX = Math.round(playerPos.current.x + Math.sin(lookAngle) * 1.5);
      const tZ = Math.round(playerPos.current.z + Math.cos(lookAngle) * 1.5);
      const tY = Math.round(playerPos.current.y - 0.5);

      const blockKey = `${tX},${tY},${tZ}`;
      if (match.blocks[blockKey]) {
        // Can only break placed blocks (not bedrock endstone)
        if (match.blocks[blockKey].type !== 'endstone') {
          ws?.send(JSON.stringify({
            type: "game:break_block",
            payload: { x: tX, y: tY, z: tZ }
          }));
          playAudio.playBreak();
        }
      }
    }
  };

  return (
    <div id="game-arena-container" className="relative w-full h-full flex flex-col md:flex-row bg-slate-900 border-2 border-amber-600 rounded-lg overflow-hidden">
      
      {/* 3D Render Window */}
      <div ref={containerRef} className="relative flex-1 h-[450px] md:h-full cursor-pointer overflow-hidden">
        
        {/* Proximity / Shop Trigger Info */}
        {nearShopkeeper && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-500/90 text-slate-900 font-bold px-4 py-2 rounded-full border-2 border-yellow-300 animate-bounce flex items-center gap-2 shadow-lg select-none z-10">
            <ShoppingBag className="w-5 h-5" />
            <span>Pressione E ou Clique para Comprar Materiais!</span>
            <button onClick={onOpenShop} className="bg-slate-900 text-yellow-500 py-0.5 px-2.5 rounded-lg text-xs font-black shadow ml-2 hover:bg-slate-800 transition">
              ABRIR LOJA
            </button>
          </div>
        )}

        {/* Respawn Counter Frame */}
        {respawnText && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 z-40 select-none">
            <h1 className="text-4xl font-extrabold text-red-500 tracking-wider">VOCÊ CAIU NO VAZIO</h1>
            <p className="text-xl text-slate-300">{respawnText}</p>
          </div>
        )}

        {/* Floating crosshair overlay */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none text-white/45 font-black text-2xl z-10">
          +
        </div>

        {/* Game instructions bar on foot */}
        <div className="absolute bottom-4 left-4 bg-slate-950/70 border border-slate-700/50 text-xs text-slate-300 p-3 rounded-lg flex flex-col gap-1 backdrop-blur select-none">
          <div className="flex items-center gap-1.5"><Compass className="w-3.5 h-3.5 text-blue-400" /> <span>WASD / Setas - Caminhar</span></div>
          <div className="flex items-center gap-1.5"><Pickaxe className="w-3.5 h-3.5 text-amber-400" /> <span>Barra de Espaço - Pular</span></div>
          <div className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-green-400" /> <span>Arraste o Mouse para Rotacionar Câmera</span></div>
        </div>

        {/* Voxel Palette Selector */}
        <div className="absolute bottom-4 right-4 bg-slate-950/80 border border-slate-700/50 p-2.5 rounded-xl flex items-center gap-2 backdrop-blur select-none z-10">
          <span className="text-xs text-slate-400 mr-2 font-semibold">Bloco:</span>
          {(['wool', 'wood', 'endstone', 'obsidian'] as const).map(type => (
            <button
              key={type}
              onClick={() => setSelectedBlockType(type)}
              className={`p-2 rounded text-xs font-bold capitalize border-2 transition ${
                selectedBlockType === type
                  ? 'bg-amber-500 border-amber-300 text-slate-950'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Side Action HUD / Stats Panels */}
      <div className="w-full md:w-80 bg-slate-950 flex flex-col justify-between border-t-2 md:border-t-0 md:border-l-2 border-slate-800 p-4">
        
        {/* Header HUD */}
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className={`w-3.5 h-3.5 rounded-full`} style={{ backgroundColor: teamHexColors[myTeam] }} />
              <h2 className="text-lg font-bold text-white capitalize">Time {myTeam}</h2>
            </div>
            <span className="text-xs bg-slate-800 text-slate-400 py-1 px-2 rounded-full font-mono">
              FPS: 60
            </span>
          </div>

          {/* Living Beds Status List */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex flex-col gap-2.5 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-amber-500" /> Status das Camas:
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {(['red', 'blue', 'green', 'yellow'] as Team[]).map(t => {
                const isMyBed = t === myTeam;
                const isIntact = match.beds[t];
                return (
                  <div
                    key={t}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs capitalize ${
                      isIntact ? 'bg-slate-800 text-slate-100' : 'bg-red-950/40 text-red-400 border border-red-900/30 line-through'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: teamHexColors[t] }} />
                      <span className="font-semibold">{t}</span>
                    </div>
                    {isIntact ? (
                      <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-black border border-green-500/30">✔</span>
                    ) : (
                      <span className="text-[10px] bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded font-black border border-red-500/30">✗</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Player Health list */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex flex-col gap-2 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-blue-500" /> Guerreiros Offline/Online:
            </h3>
            <div className="flex flex-col gap-2 max-h-36 overflow-y-auto">
              {match.players.map(p => (
                <div key={p.username} className="flex items-center justify-between text-xs bg-slate-950/70 p-2 rounded">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: teamHexColors[p.team] }} />
                    <span className="text-slate-200 font-semibold">{p.username}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">PV:</span>
                    <span className="font-mono text-emerald-400 font-bold">{p.isDead ? 'Morte' : `${p.health}`}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Combat Controls Actions / Touch Joystick for web wrapper compatibility */}
        <div className="bg-slate-900 border border-slate-800/80 p-3.5 rounded-xl flex flex-col gap-3 shadow-md mt-4">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest self-center">AÇÕES DO JOGADOR</span>
          
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleVoxelAction('attack')}
              className="bg-red-600 hover:bg-red-500 border-2 border-red-300 text-white font-black py-2.5 rounded-lg text-xs tracking-wider flex items-center justify-center gap-1.5 transition active:scale-95 shadow-lg shadow-red-950/40"
            >
              <Sword className="w-4 h-4" /> ATACAR
            </button>
            
            <button
              onClick={() => handleVoxelAction('place')}
              className="bg-emerald-600 hover:bg-emerald-500 border-2 border-emerald-300 text-white font-black py-2.5 rounded-lg text-xs tracking-wider flex items-center justify-center gap-1.5 transition active:scale-95 shadow-lg shadow-emerald-950/40"
            >
              <ShieldCheck className="w-4 h-4" /> PONTE / BLOCO
            </button>
          </div>

          <button
            onClick={() => handleVoxelAction('break')}
            className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold py-2 rounded-lg text-xs tracking-wider transition active:scale-95 shadow"
          >
            ⛏ QUEBRAR BLOCO À FRENTE
          </button>
        </div>
      </div>
    </div>
  );
}
