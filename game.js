class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.scoreElement = document.getElementById('score');
        
        this.setCanvasSize();
        this.bindEvents();
        
        this.gameState = 'waiting';
        this.score = 0;
        this.notes = [];
        this.lastNoteTime = 0;
        this.noteInterval = 800;
        this.noteSpeed = 3;
        this.hitZone = { x: 80, width: 60 };
        this.hitEffect = null;
        this.audioContext = null;
        this.bassOscillator = null;
        this.backgroundGain = null;
        this.animationId = null;
        this.lastTime = 0;
        this.musicTimeout = null;
        this.isMusicPlaying = false;
        
        this.colors = ['#6B7280', '#9CA3AF', '#4B5563', '#374151'];
        
        this.initAudio();
        this.render();
        this.animationId = requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    setCanvasSize() {
        const containerWidth = this.canvas.parentElement.offsetWidth - 40;
        this.canvas.width = Math.min(800, containerWidth);
        this.canvas.height = 400;
        this.hitZone.y = this.canvas.height / 2;
    }
    
    bindEvents() {
        window.addEventListener('resize', () => this.setCanvasSize());
        
        document.getElementById('startBtn').addEventListener('click', () => this.start());
        document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        
        document.getElementById('audioPlayBtn').addEventListener('click', () => this.startBackgroundMusic());
        document.getElementById('audioPauseBtn').addEventListener('click', () => this.stopBackgroundMusic());
        
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.handleClick(touch);
        });
    }
    
    initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Web Audio API not supported');
        }
    }
    
    startBackgroundMusic() {
        if (!this.audioContext || this.isMusicPlaying) return;
        
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        this.createAmbientMusic();
        this.isMusicPlaying = true;
    }
    
    createAmbientMusic() {
        const now = this.audioContext.currentTime;
        
        const bassFreq = 55;
        const bassOsc = this.audioContext.createOscillator();
        const bassGain = this.audioContext.createGain();
        
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(bassFreq, now);
        bassGain.gain.setValueAtTime(0.15, now);
        
        bassOsc.connect(bassGain);
        bassGain.connect(this.audioContext.destination);
        
        bassOsc.start(now);
        
        const notes = [110, 146.83, 165, 196, 220];
        let noteIndex = 0;
        
        const playNote = () => {
            if (this.gameState !== 'playing') {
                bassOsc.stop();
                return;
            }
            
            const noteTime = this.audioContext.currentTime;
            
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(notes[noteIndex], noteTime);
            gain.gain.setValueAtTime(0, noteTime);
            gain.gain.linearRampToValueAtTime(0.1, noteTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, noteTime + 0.8);
            
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            
            osc.start(noteTime);
            osc.stop(noteTime + 0.8);
            
            noteIndex = (noteIndex + 1) % notes.length;
            
            this.musicTimeout = setTimeout(playNote, 600);
        };
        
        playNote();
        this.bassOscillator = bassOsc;
    }
    
    stopBackgroundMusic() {
        if (this.musicTimeout) {
            clearTimeout(this.musicTimeout);
            this.musicTimeout = null;
        }
        
        if (this.bassOscillator) {
            try {
                this.bassOscillator.stop();
            } catch (e) {}
            this.bassOscillator = null;
        }
        
        this.isMusicPlaying = false;
    }
    
    playHitSound() {
        if (!this.audioContext) return;
        
        const now = this.audioContext.currentTime;
        
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1760, now + 0.1);
        
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        
        osc.start(now);
        osc.stop(now + 0.2);
    }
    
    start() {
        if (this.gameState === 'waiting' || this.gameState === 'paused') {
            this.gameState = 'playing';
            this.startBackgroundMusic();
        }
    }
    
    togglePause() {
        if (this.gameState === 'playing') {
            this.gameState = 'paused';
        } else if (this.gameState === 'paused') {
            this.start();
        }
    }
    
    reset() {
        this.gameState = 'waiting';
        this.score = 0;
        this.notes = [];
        this.lastNoteTime = 0;
        this.hitEffect = null;
        this.updateScore();
        this.render();
    }
    
    handleClick(event) {
        if (this.gameState !== 'playing') return;
        
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;
        
        let hit = false;
        
        for (let i = this.notes.length - 1; i >= 0; i--) {
            const note = this.notes[i];
            const distance = Math.sqrt(
                Math.pow(x - note.x, 2) + Math.pow(y - note.y, 2)
            );
            
            if (distance < note.radius + 30) {
                const hitLeft = this.hitZone.x - this.hitZone.width / 2;
                const hitRight = this.hitZone.x + this.hitZone.width / 2;
                
                if (note.x >= hitLeft && note.x <= hitRight) {
                    hit = true;
                    this.score += 100;
                    this.updateScore();
                    this.hitEffect = { x: note.x, y: note.y, radius: note.radius, alpha: 1 };
                    this.playHitSound();
                    this.notes.splice(i, 1);
                    break;
                }
            }
        }
    }
    
    updateScore() {
        this.scoreElement.textContent = this.score;
    }
    
    spawnNote() {
        const now = Date.now();
        if (now - this.lastNoteTime > this.noteInterval) {
            this.notes.push({
                x: this.canvas.width + 50,
                y: Math.random() * (this.canvas.height - 100) + 50,
                radius: 25,
                color: this.colors[Math.floor(Math.random() * this.colors.length)],
                type: Math.random() > 0.5 ? 'circle' : 'rect',
                width: 50,
                height: 50
            });
            this.lastNoteTime = now;
        }
    }
    
    updateNotes() {
        for (let i = this.notes.length - 1; i >= 0; i--) {
            this.notes[i].x -= this.noteSpeed;
            
            if (this.notes[i].x < this.hitZone.x - this.hitZone.width && !this.notes[i].missed) {
                this.notes[i].missed = true;
                this.playMissSound();
            }
            
            if (this.notes[i].x < -50) {
                this.notes.splice(i, 1);
            }
        }
    }
    
    playMissSound() {
        if (!this.audioContext) return;
        
        const now = this.audioContext.currentTime;
        
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);
        
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        
        osc.start(now);
        osc.stop(now + 0.2);
    }
    
    updateHitEffect() {
        if (this.hitEffect) {
            this.hitEffect.alpha -= 0.05;
            this.hitEffect.radius += 3;
            if (this.hitEffect.alpha <= 0) {
                this.hitEffect = null;
            }
        }
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.drawHitZone();
        this.drawNotes();
        this.drawHitEffect();
    }
    
    drawHitZone() {
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([10, 10]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.hitZone.x, 0);
        this.ctx.lineTo(this.hitZone.x, this.canvas.height);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        this.ctx.fillStyle = 'rgba(51, 51, 51, 0.05)';
        this.ctx.fillRect(
            this.hitZone.x - this.hitZone.width / 2, 0,
            this.hitZone.width, this.canvas.height
        );
    }
    
    drawNotes() {
        this.notes.forEach(note => {
            this.ctx.fillStyle = note.color;
            
            if (note.type === 'circle') {
                this.ctx.beginPath();
                this.ctx.arc(note.x, note.y, note.radius, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                this.ctx.fillRect(
                    note.x - note.width / 2,
                    note.y - note.height / 2,
                    note.width,
                    note.height
                );
            }
        });
    }
    
    drawHitEffect() {
        if (this.hitEffect) {
            this.ctx.strokeStyle = `rgba(34, 197, 94, ${this.hitEffect.alpha})`;
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.arc(
                this.hitEffect.x,
                this.hitEffect.y,
                this.hitEffect.radius,
                0,
                Math.PI * 2
            );
            this.ctx.stroke();
        }
    }
    
    gameLoop(time) {
        if (this.gameState === 'playing') {
            const deltaTime = time - this.lastTime;
            this.lastTime = time;
            
            this.spawnNote();
            this.updateNotes();
            this.updateHitEffect();
        }
        
        this.render();
        this.animationId = requestAnimationFrame((t) => this.gameLoop(t));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Game();
});