import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Rocket, Heart, Trophy, RefreshCw, Play, Volume2, VolumeX, Delete, Maximize, Minimize, Keyboard, LogOut } from 'lucide-react';

// --- Types ---

interface Problem {
  id: string;
  factorA: number;
  factorB: number;
  x: number;
  y: number;
  speed: number;
  color: string;
}

interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface Laser {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  life: number;
  color: string;
}

interface FlyingNumber {
  id: string;
  value: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  progress: number; // 0 to 1
  color: string;
  problemId: string;
  scale: number;
}

type GameState = 'MENU' | 'PLAYING' | 'GAME_OVER';

// --- Constants ---

const COLORS = ['#F43F5E', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B']; // Tailwind colors: Rose, Violet, Cyan, Emerald, Amber
const SPAWN_RATE_INITIAL = 3500; // Slower start (3.5s)
const SPAWN_RATE_MIN = 1000; // Cap at 1s (was 0.5s)
const SPEED_INITIAL = 0.3; // Slower initial speed
const SPEED_MAX = 2.0; // Lower max speed

// --- Helper Functions ---

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

const generateProblem = (width: number, difficultyMultiplier: number, level: number): Problem => {
  let minFactor = 1;
  let maxFactor = 10;
  
  if (level === 1) {
    minFactor = 1;
    maxFactor = 10;
  } else if (level === 2) {
    minFactor = 5;
    maxFactor = 15;
  } else if (level === 3) {
    minFactor = 1;
    maxFactor = 20;
  }
  
  const factorA = randomInt(minFactor, maxFactor);
  const factorB = randomInt(minFactor, maxFactor);

  // Slower speed progression
  const speed = Math.min(SPEED_MAX, SPEED_INITIAL + (difficultyMultiplier * 0.02));

  return {
    id: Math.random().toString(36).substr(2, 9),
    factorA,
    factorB,
    x: randomInt(50, width - 50),
    y: -50,
    speed,
    color: COLORS[randomInt(0, COLORS.length - 1)],
  };
};

export default function MathGame() {
  // --- State ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('MENU');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [inputValue, setInputValue] = useState('');
  const [highScore, setHighScore] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(1); // 1, 2, or 3
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- Refs for Game Loop (Mutable state without re-renders) ---
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const problemsRef = useRef<Problem[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const lasersRef = useRef<Laser[]>([]);
  const flyingNumbersRef = useRef<FlyingNumber[]>([]);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const difficultyRef = useRef(1);
  const gameStateRef = useRef<GameState>('MENU');
  const levelRef = useRef(1);
  const bottomOffsetRef = useRef(0);
  
  // Persistent Audio Context
  const audioCtxRef = useRef<AudioContext | null>(null);

  // --- Audio (Low Latency) ---
  const playSound = useCallback((type: 'shoot' | 'explode' | 'damage' | 'gameover' | 'spawn') => {
    if (isMuted) return;
    
    // Initialize AudioContext only once
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        audioCtxRef.current = new AudioContext();
      }
    }

    const ctx = audioCtxRef.current;
    if (!ctx) return;

    // Resume context if suspended (browser policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(ctx.destination);

    if (type === 'shoot') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.1); // Shorter duration
      
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      
      osc.connect(gain);
      gain.connect(masterGain);
      
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'explode') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.2); // Snappier

      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'damage') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.3);
      
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
      
      osc.connect(gain);
      gain.connect(masterGain);
      
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'spawn') {
       const osc = ctx.createOscillator();
       const gain = ctx.createGain();
       
       osc.type = 'sine';
       osc.frequency.setValueAtTime(800, now);
       
       gain.gain.setValueAtTime(0.05, now); // Quieter spawn
       gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05); // Very short
       
       osc.connect(gain);
       gain.connect(masterGain);
       
       osc.start(now);
       osc.stop(now + 0.05);
    } else if (type === 'gameover') {
       const osc = ctx.createOscillator();
       const gain = ctx.createGain();
       
       osc.type = 'sawtooth';
       osc.frequency.setValueAtTime(200, now);
       osc.frequency.linearRampToValueAtTime(50, now + 1.0);
       
       gain.gain.setValueAtTime(0.5, now);
       gain.gain.linearRampToValueAtTime(0.01, now + 1.0);
       
       osc.connect(gain);
       gain.connect(masterGain);
       
       osc.start(now);
       osc.stop(now + 1.0);
    }
  }, [isMuted]);

  // --- Game Logic Methods ---

  const spawnParticle = (x: number, y: number, color: string, count = 20) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      particlesRef.current.push({
        id: Math.random().toString(),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color,
        size: Math.random() * 4 + 2,
      });
    }
  };

  const checkInput = useCallback((value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) return;

    const matchIndex = problemsRef.current.findIndex(p => p.factorA * p.factorB === numValue);

    if (matchIndex !== -1) {
      const problem = problemsRef.current[matchIndex];
      
      // Create Flying Number
      if (canvasRef.current) {
        const startY = canvasRef.current.height - (isTouchDevice ? 230 : 120);
        flyingNumbersRef.current.push({
          id: Math.random().toString(),
          value: value,
          x: canvasRef.current.width / 2,
          y: startY,
          targetX: problem.x,
          targetY: problem.y,
          progress: 0,
          color: problem.color,
          problemId: problem.id,
          scale: 2.0
        });
        playSound('shoot');
        
        // Launch particles
        spawnParticle(canvasRef.current.width / 2, startY, '#22d3ee', 10);
      }

      // Clear Input immediately so user can type next one
      setInputValue('');
    }
  }, [playSound]);

  const handleNumpadPress = useCallback((key: string) => {
    if (gameStateRef.current !== 'PLAYING') return;

    if (key === 'backspace') {
      setInputValue(prev => prev.slice(0, -1));
    } else if (key === 'clear') {
      setInputValue('');
    } else {
      setInputValue(prev => {
        const newValue = prev + key;
        setTimeout(() => checkInput(newValue), 0);
        return newValue;
      });
    }
  }, [checkInput]);

  const startGame = () => {
    setGameState('PLAYING');
    gameStateRef.current = 'PLAYING';
    levelRef.current = selectedLevel; // Set level ref
    setScore(0);
    setLives(3);
    setInputValue('');
    
    scoreRef.current = 0;
    livesRef.current = 3;
    difficultyRef.current = 1;
    problemsRef.current = [];
    particlesRef.current = [];
    lasersRef.current = [];
    flyingNumbersRef.current = [];
    lastTimeRef.current = performance.now();
    
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  const gameOver = () => {
    setGameState('GAME_OVER');
    gameStateRef.current = 'GAME_OVER'; // Sync ref
    playSound('gameover');
    
    const finalScore = scoreRef.current;
    let newHighScore = highScore;

    if (finalScore > highScore) {
      newHighScore = finalScore;
      setHighScore(finalScore);
    }

    // Export score to parent window for integration
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'MATH_GAME_OVER',
        score: finalScore,
        highScore: newHighScore,
        level: levelRef.current,
        timestamp: new Date().toISOString()
      }, '*');
    }
    cancelAnimationFrame(requestRef.current);
  };

  const returnToMenu = useCallback(() => {
    setGameState('MENU');
    gameStateRef.current = 'MENU';
    cancelAnimationFrame(requestRef.current);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, []);

  // --- Main Game Loop ---

  const gameLoop = (time: number) => {
    // If not playing, stop immediately (double check)
    if (gameStateRef.current !== 'PLAYING') return;

    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;

    const canvas = canvasRef.current;
    if (!canvas) {
        requestRef.current = requestAnimationFrame(gameLoop);
        return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        requestRef.current = requestAnimationFrame(gameLoop);
        return;
    }

    // Clear Canvas (No Trails - Clean Refresh)
    ctx.fillStyle = '#0f172a'; // Slate-900 Opaque
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Starfield Background (Enhanced)
    for (let i = 0; i < 80; i++) {
        const x = (Math.sin(i * 132.1) * 43758.5453 + i * 50) % canvas.width;
        const speed = (i % 3) + 0.5;
        const y = (time * 0.05 * speed + i * 100) % canvas.height;
        const size = Math.random() * 2;
        
        ctx.globalAlpha = 0.5 + (Math.sin(time * 0.002 + i) * 0.4);
        ctx.fillStyle = i % 5 === 0 ? '#6366f1' : '#ffffff'; // Occasional purple stars
        ctx.beginPath();
        ctx.arc(Math.abs(x), y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // --- Update & Draw ---

    // 1. Spawner
    spawnTimerRef.current += deltaTime;
    
    // Adaptive Spawn Logic
    let targetSpawnRate = 4000; 
    targetSpawnRate = Math.max(1500, 4000 - (difficultyRef.current * 100));

    if (problemsRef.current.length > 0) {
        targetSpawnRate += problemsRef.current.length * 1000;
    }
    
    if (spawnTimerRef.current > targetSpawnRate) {
      problemsRef.current.push(generateProblem(canvas.width, difficultyRef.current, levelRef.current));
      spawnTimerRef.current = 0;
      playSound('spawn');
    }

    // 2. Problems
    problemsRef.current.forEach((p, index) => {
      p.y += p.speed * (deltaTime / 16);

      // Draw Problem Glow
      ctx.shadowBlur = 20;
      ctx.shadowColor = p.color;
      
      // Draw Text Background Pill
      const text = `${p.factorA} × ${p.factorB}`;
      ctx.font = 'bold 20px "JetBrains Mono", monospace';
      const textWidth = ctx.measureText(text).width;
      
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.beginPath();
      ctx.roundRect(p.x - textWidth/2 - 8, p.y - 20, textWidth + 16, 28, 6);
      ctx.fill();

      // Draw Text
      ctx.fillStyle = p.color;
      ctx.textAlign = 'center';
      ctx.fillText(text, p.x, p.y);
      
      // Reset Shadow
      ctx.shadowBlur = 0;

      // Check Collision with bottom
      const effectiveHeight = canvas.height - bottomOffsetRef.current;
      if (p.y > effectiveHeight - 50) {
        livesRef.current -= 1;
        setLives(livesRef.current);
        playSound('damage');
        spawnParticle(p.x, p.y, '#ef4444', 30);
        problemsRef.current.splice(index, 1);
        
        // Screen Shake Effect (simulated by offset)
        ctx.translate(Math.random() * 10 - 5, Math.random() * 10 - 5);
        setTimeout(() => ctx.setTransform(1, 0, 0, 1, 0, 0), 50);
        
        if (livesRef.current <= 0) {
          gameOver();
        }
      }
    });

    // 3. Flying Numbers
    flyingNumbersRef.current.forEach((fn, index) => {
      fn.progress += deltaTime / 400; // Speed of flight (400ms)
      
      // Update target position in case the problem moved
      const targetProblem = problemsRef.current.find(p => p.id === fn.problemId);
      if (targetProblem) {
        fn.targetX = targetProblem.x;
        fn.targetY = targetProblem.y;
      }

      // Current position based on progress
      const startY = canvas.height - (isTouchDevice ? 230 : 120);
      fn.x = (canvas.width / 2) + (fn.targetX - (canvas.width / 2)) * fn.progress;
      fn.y = startY + (fn.targetY - startY) * fn.progress;
      fn.scale = 2.0 - fn.progress * 1.2; // Shrink from 2x to 0.8x

      if (fn.progress >= 1) {
        // Hit!
        const pIndex = problemsRef.current.findIndex(p => p.id === fn.problemId);
        if (pIndex !== -1) {
          const problem = problemsRef.current[pIndex];
          
          // Create Laser effect at impact
          lasersRef.current.push({
            id: Math.random().toString(),
            startX: canvas.width / 2,
            startY: canvas.height - bottomOffsetRef.current - 20,
            endX: problem.x,
            endY: problem.y,
            life: 0.5,
            color: problem.color
          });

          // Explosion
          spawnParticle(problem.x, problem.y, problem.color, 15);
          playSound('explode');

          // Remove problem
          problemsRef.current.splice(pIndex, 1);
          
          // Update Score
          scoreRef.current += 10;
          setScore(scoreRef.current);
          difficultyRef.current = 1 + Math.floor(scoreRef.current / 100);
        }
        
        flyingNumbersRef.current.splice(index, 1);
        return;
      }

      // Draw Flying Number
      ctx.shadowBlur = 15 * fn.scale;
      ctx.shadowColor = fn.color;
      ctx.font = `bold ${Math.floor(32 * fn.scale)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = fn.color;
      ctx.textAlign = 'center';
      ctx.fillText(fn.value, fn.x, fn.y);
      ctx.shadowBlur = 0;
    });

    // 4. Lasers (Enhanced Beam)
    lasersRef.current.forEach((laser, index) => {
      laser.life -= deltaTime / 300;
      if (laser.life <= 0) {
        lasersRef.current.splice(index, 1);
        return;
      }

      ctx.beginPath();
      ctx.moveTo(laser.startX, laser.startY);
      ctx.lineTo(laser.endX, laser.endY);
      
      // Core
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * laser.life;
      ctx.stroke();
      
      // Glow
      ctx.strokeStyle = laser.color;
      ctx.lineWidth = 8 * laser.life;
      ctx.shadowBlur = 20;
      ctx.shadowColor = laser.color;
      ctx.stroke();
      
      ctx.shadowBlur = 0;
    });

    // 5. Particles (Enhanced Physics)
    particlesRef.current.forEach((p, index) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1; // Gravity
      p.life -= deltaTime / 800; // Longer life
      p.size *= 0.96;

      if (p.life <= 0) {
        particlesRef.current.splice(index, 1);
        return;
      }

      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.shadowBlur = 10 * p.life;
      ctx.shadowColor = p.color;
      
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1.0;
    });

    // 6. Player Base
    const effectiveHeight = canvas.height - bottomOffsetRef.current;
    const baseX = canvas.width / 2;
    const baseY = effectiveHeight - 30;
    
    // Base Glow
    const glowIntensity = 10 + Math.sin(time * 0.005) * 5;
    ctx.shadowBlur = glowIntensity;
    ctx.shadowColor = '#3b82f6'; // Blue-500
    
    // Draw Turret
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(baseX, baseY, 20, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw Barrel (aims at lowest problem or straight up)
    let targetX = baseX;
    let targetY = 0;
    if (problemsRef.current.length > 0) {
        // Find lowest problem
        const lowest = problemsRef.current.reduce((prev, curr) => (prev.y > curr.y ? prev : curr));
        targetX = lowest.x;
        targetY = lowest.y;
    }
    const angle = Math.atan2(targetY - baseY, targetX - baseX);
    
    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.rotate(angle + Math.PI / 2); // Adjust for drawing upright
    ctx.fillStyle = '#64748b';
    ctx.fillRect(-5, -30, 10, 30);
    ctx.restore();

    ctx.shadowBlur = 0;

    if (gameStateRef.current === 'PLAYING') {
      requestRef.current = requestAnimationFrame(gameLoop);
    }
  };

  // --- Effects ---

  // Handle Resize and Touch Detection
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        const parent = canvasRef.current.parentElement;
        if (parent) {
          canvasRef.current.width = parent.clientWidth;
          canvasRef.current.height = parent.clientHeight;
        }
      }
      
      // Check for touch device
      const isTouch = window.matchMedia("(pointer: coarse)").matches || 'ontouchstart' in window;
      setIsTouchDevice(isTouch);
      bottomOffsetRef.current = isTouch ? 160 : 0;
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle Fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handle Input Focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== 'PLAYING') return;

      if (e.key === 'Escape') {
        returnToMenu();
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        const newValue = inputValue + e.key;
        setInputValue(newValue);
        checkInput(newValue);
      } else if (e.key === 'Backspace') {
        setInputValue(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        setInputValue(''); // Clear on enter if wrong
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, inputValue, checkInput, returnToMenu]);

  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-slate-900 overflow-hidden font-sans select-none touch-none">
      
      {/* Canvas Layer */}
      <div className="absolute inset-0 z-0">
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>

      {/* UI Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6">
        
        {/* Header HUD */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-slate-400 text-sm uppercase tracking-widest font-bold">
              <Trophy className="w-4 h-4" /> Punkte
            </div>
            <div className="text-4xl font-mono font-bold text-white tracking-tighter shadow-black drop-shadow-lg">
              {score.toString().padStart(6, '0')}
            </div>
          </div>

          <div className="flex gap-4">
             <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 text-slate-400 text-sm uppercase tracking-widest font-bold">
                  Leben
                </div>
                <div className="flex gap-1">
                  {[...Array(3)].map((_, i) => (
                    <Heart 
                      key={i} 
                      className={`w-6 h-6 ${i < lives ? 'text-rose-500 fill-rose-500' : 'text-slate-700'}`} 
                    />
                  ))}
                </div>
             </div>
             <div className="flex gap-2">
               <button 
                 onClick={toggleFullscreen}
                 className="pointer-events-auto p-2 rounded-full bg-slate-800/50 text-slate-400 hover:text-white transition-colors"
               >
                 {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
               </button>
               <button 
                 onClick={() => setIsMuted(!isMuted)}
                 className="pointer-events-auto p-2 rounded-full bg-slate-800/50 text-slate-400 hover:text-white transition-colors"
               >
                 {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
               </button>
             </div>
          </div>
        </div>

        {/* Bottom Input HUD */}
        <div className={`flex flex-col items-center gap-4 ${isTouchDevice ? 'mb-[170px]' : 'mb-10'}`}>
           <AnimatePresence>
             {inputValue && (
               <motion.div 
                 initial={{ opacity: 0, y: 20, scale: 0.8 }}
                 animate={{ opacity: 1, y: 0, scale: 1 }}
                 exit={{ opacity: 0, scale: 0.5 }}
                 className="text-6xl font-mono font-bold text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]"
               >
                 {inputValue}
               </motion.div>
             )}
           </AnimatePresence>
           
           {gameState === 'PLAYING' && (
             <div className="text-slate-500 text-sm uppercase tracking-widest animate-pulse">
               Tippe die Antwort
             </div>
           )}
        </div>
      </div>

      {/* Numpad Overlay for Touch Devices */}
      <AnimatePresence>
        {isTouchDevice && gameState === 'PLAYING' && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 p-3 bg-slate-900/90 backdrop-blur-lg border-t border-slate-700 pointer-events-auto flex justify-center z-30"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
          >
            <div className="grid grid-cols-6 gap-2 w-full max-w-lg">
              {[1, 2, 3, 4, 5].map(num => (
                <button 
                  key={num} 
                  onClick={() => handleNumpadPress(num.toString())} 
                  className="h-12 bg-slate-800 rounded-xl text-xl font-mono text-white active:bg-indigo-600 active:scale-95 transition-all border border-slate-700 shadow-md"
                >
                  {num}
                </button>
              ))}
              <button 
                onClick={() => handleNumpadPress('backspace')} 
                className="col-start-6 row-start-1 row-span-2 bg-slate-800 rounded-xl text-xl font-mono text-white active:bg-rose-600 active:scale-95 transition-all border border-slate-700 shadow-md flex items-center justify-center"
              >
                <Delete className="w-6 h-6" />
              </button>
              {[6, 7, 8, 9, 0].map(num => (
                <button 
                  key={num} 
                  onClick={() => handleNumpadPress(num.toString())} 
                  className="h-12 bg-slate-800 rounded-xl text-xl font-mono text-white active:bg-indigo-600 active:scale-95 transition-all border border-slate-700 shadow-md"
                >
                  {num}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlays */}
      <AnimatePresence>
        {gameState === 'MENU' && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm"
          >
            <div className="bg-slate-800/90 p-8 rounded-3xl border border-slate-700 shadow-2xl max-w-md w-full text-center pointer-events-auto">
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-indigo-500/20 rounded-full">
                   <Rocket className="w-12 h-12 text-indigo-400" />
                </div>
              </div>
              <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Neon Math Defense</h1>
              <p className="text-slate-400 mb-4">Verteidige die Basis, indem du Multiplikationsaufgaben löst.</p>
              
              <div className="bg-slate-800/50 rounded-xl p-4 mb-6 text-left text-sm text-slate-300 space-y-3 border border-slate-700/50">
                <div className="flex items-center gap-3">
                  <Keyboard className="w-5 h-5 text-indigo-400 shrink-0" />
                  <span>Tippe die Lösung ein, um zu schießen.</span>
                </div>
                <div className="flex items-center gap-3">
                  <Maximize className="w-5 h-5 text-indigo-400 shrink-0" />
                  <span>Vollbildmodus oben rechts aktivierbar.</span>
                </div>
                <div className="flex items-center gap-3">
                  <LogOut className="w-5 h-5 text-indigo-400 shrink-0" />
                  <span>Mit <strong>ESC</strong> jederzeit ins Menü zurückkehren.</span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 mb-8">
                {[1, 2, 3].map((level) => (
                  <button
                    key={level}
                    onClick={() => setSelectedLevel(level)}
                    className={`p-3 rounded-lg border-2 font-bold transition-all ${
                      selectedLevel === level 
                        ? 'border-indigo-500 bg-indigo-500/20 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]' 
                        : 'border-slate-700 bg-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                    }`}
                  >
                    <div className="text-xs uppercase tracking-wider mb-1">Level {level}</div>
                    <div className="text-sm">
                      {level === 1 ? '1-10' : level === 2 ? '5-15' : '1-20'}
                    </div>
                  </button>
                ))}
              </div>

              <button 
                onClick={startGame}
                className="group relative w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(79,70,229,0.5)] hover:shadow-[0_0_30px_rgba(79,70,229,0.7)] overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                <span className="flex items-center justify-center gap-2">
                  <Play className="w-5 h-5 fill-current" /> MISSION STARTEN
                </span>
              </button>
            </div>
          </motion.div>
        )}

        {gameState === 'GAME_OVER' && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-red-900/20 backdrop-blur-md"
          >
            <div className="bg-slate-900/90 p-8 rounded-3xl border border-red-500/30 shadow-2xl max-w-md w-full text-center pointer-events-auto">
              <h2 className="text-5xl font-bold text-white mb-2 tracking-tight drop-shadow-lg">SPIEL VORBEI</h2>
              <div className="text-red-400 font-mono text-xl mb-8">Basis zerstört</div>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-800 p-4 rounded-xl">
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">Endstand</div>
                  <div className="text-3xl font-bold text-white">{score}</div>
                </div>
                <div className="bg-slate-800 p-4 rounded-xl">
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">Rekord</div>
                  <div className="text-3xl font-bold text-amber-400">{highScore}</div>
                </div>
              </div>

              <button 
                onClick={startGame}
                className="w-full py-4 px-6 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-5 h-5" /> NOCHMAL VERSUCHEN
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
