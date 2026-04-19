
# Fix the JS bug and regenerate clean version

js_v2_fixed = r'''const socket = io();
let roomId = '';
let currentSource = 'youtube';
let syncEnabled = true;
let ytPlayer = null;

// Sleep system variables
let sleepStepInterval = null;
let gateTimeout = null;
let dimLevel = 0;
let currentVolume = 1.0;
let isAsleep = false;

// YouTube API
function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('player', {
        height: '100%',
        width: '100%',
        playerVars: { 
            'playsinline': 1,
            'enablejsapi': 1,
            'origin': window.location.origin
        },
        events: {
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerStateChange(event) {
    if (!syncEnabled) return;
    let action = '';
    if (event.data === YT.PlayerState.PLAYING) action = 'play';
    else if (event.data === YT.PlayerState.PAUSED) action = 'pause';
    
    if (action) {
        socket.emit('video-action', {
            action: action,
            time: ytPlayer.getCurrentTime(),
            source: 'youtube'
        });
    }
}

// Room join
function joinRoom() {
    roomId = document.getElementById('roomName').value.trim() || 'emerald-room';
    socket.emit('join-room', roomId);
    
    document.getElementById('roomInput').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    
    // Start: 2 minutes of normal watching, then show gate
    setTimeout(() => showEmeraldGate(), 2 * 60 * 1000);
}

// Source toggle
function setSource(source) {
    currentSource = source;
    document.querySelectorAll('.source-toggle button').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    if (source === 'local') {
        document.getElementById('fileInput').click();
        document.getElementById('videoInput').placeholder = 'Select a local file...';
    } else {
        document.getElementById('videoInput').placeholder = 'Paste YouTube URL...';
    }
}

// Load video
function loadVideo() {
    const url = document.getElementById('videoInput').value;
    if (!url) return;
    
    if (currentSource === 'youtube') {
        const videoId = extractVideoID(url);
        if (videoId && ytPlayer) {
            ytPlayer.loadVideoById(videoId);
        }
    }
}

function extractVideoID(url) {
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// Local file
function loadLocalFile(event) {
    const file = event.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        document.getElementById('player').classList.add('hidden');
        document.getElementById('localPlayer').classList.remove('hidden');
        document.getElementById('localPlayer').src = url;
        
        const localVideo = document.getElementById('localPlayer');
        localVideo.onplay = () => emitLocalAction('play', localVideo.currentTime);
        localVideo.onpause = () => emitLocalAction('pause', localVideo.currentTime);
        localVideo.onseeked = () => emitLocalAction('seek', localVideo.currentTime);
    }
}

function emitLocalAction(action, time) {
    if (!syncEnabled) return;
    socket.emit('video-action', { action, time, source: 'local' });
}

// Chat
function sendMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (msg) {
        socket.emit('chat-message', msg);
        addMessage(msg, 'You');
        input.value = '';
    }
}

function addMessage(text, sender) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `<div class="message-sender">${sender}</div>${text}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ================= NEW EMERALD GATE SYSTEM =================

function showEmeraldGate() {
    if (isAsleep) return;
    
    const gate = document.getElementById('emeraldGate');
    gate.style.display = 'block';
    
    // Start gradual sleep after 1 minute if not tapped
    gateTimeout = setTimeout(() => {
        startGradualSleep();
    }, 60 * 1000); // 1 minute to respond
}

function pressEmeraldGate() {
    // Reset everything
    clearTimeout(gateTimeout);
    clearInterval(sleepStepInterval);
    
    document.getElementById('emeraldGate').style.display = 'none';
    document.getElementById('sleepStatus').classList.remove('visible');
    
    // Restore brightness
    dimLevel = 0;
    document.getElementById('dimOverlay').style.background = 'rgba(0,0,0,0)';
    
    // Restore volume
    currentVolume = 1.0;
    setVolume(1.0);
    
    // Visual feedback
    document.body.style.boxShadow = 'inset 0 0 50px rgba(80,200,120,0.4)';
    setTimeout(() => {
        document.body.style.boxShadow = 'none';
    }, 600);
    
    // Schedule next gate in 15 minutes
    setTimeout(() => showEmeraldGate(), 15 * 60 * 1000);
}

function startGradualSleep() {
    if (isAsleep) return;
    
    document.getElementById('sleepStatus').classList.add('visible');
    
    let steps = 0;
    const maxSteps = 5; // 5 minutes total (1 min per step)
    
    sleepStepInterval = setInterval(() => {
        steps++;
        
        // Increase dim by 15% each minute
        dimLevel = Math.min(steps * 0.15, 0.85);
        document.getElementById('dimOverlay').style.background = `rgba(0,0,0,${dimLevel})`;
        
        // Lower volume by 20% each minute
        currentVolume = Math.max(1.0 - (steps * 0.2), 0.1);
        setVolume(currentVolume);
        
        // Update status text
        const status = document.getElementById('sleepStatus');
        if (steps < 3) {
            status.textContent = `🌙 Getting sleepy... ${steps}m`;
        } else if (steps < 5) {
            status.textContent = `🌙 Very sleepy... ${steps}m`;
        } else {
            status.textContent = `🌙 Almost asleep...`;
        }
        
        // After 5 minutes, trigger full sleep mode
        if (steps >= maxSteps) {
            clearInterval(sleepStepInterval);
            triggerFullSleep();
        }
    }, 60 * 1000); // Every 1 minute
}

function setVolume(vol) {
    if (ytPlayer && ytPlayer.setVolume) {
        ytPlayer.setVolume(vol * 100);
    }
    const localVideo = document.getElementById('localPlayer');
    if (localVideo) localVideo.volume = vol;
}

function triggerFullSleep() {
    isAsleep = true;
    document.getElementById('sleepStatus').classList.remove('visible');
    
    const overlay = document.getElementById('sleepOverlay');
    overlay.classList.add('active');
    
    // Pause video
    if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
    const localVideo = document.getElementById('localPlayer');
    if (localVideo) localVideo.pause();
}

function wakeUp() {
    isAsleep = false;
    dimLevel = 0;
    currentVolume = 1.0;
    
    document.getElementById('sleepOverlay').classList.remove('active');
    document.getElementById('dimOverlay').style.background = 'rgba(0,0,0,0)';
    setVolume(1.0);
    
    // Resume video
    const localVideo = document.getElementById('localPlayer');
    if (localVideo) localVideo.play().catch(()=>{});
}

// Socket listeners
socket.on('room-state', (state) => {
    console.log('Room state:', state);
});

socket.on('video-action', (data) => {
    syncEnabled = false;
    
    if (data.source === 'youtube' && ytPlayer) {
        if (Math.abs(ytPlayer.getCurrentTime() - data.time) > 2) {
            ytPlayer.seekTo(data.time, true);
        }
        if (data.action === 'play') ytPlayer.playVideo();
        else if (data.action === 'pause') ytPlayer.pauseVideo();
    } else if (data.source === 'local') {
        const localVideo = document.getElementById('localPlayer');
        if (localVideo) {
            if (Math.abs(localVideo.currentTime - data.time) > 2) {
                localVideo.currentTime = data.time;
            }
            if (data.action === 'play') localVideo.play();
            else if (data.action === 'pause') localVideo.pause();
        }
    }
    
    setTimeout(() => syncEnabled = true, 500);
});

socket.on('chat-message', (data) => {
    addMessage(data.text, data.sender);
});

socket.on('emerald-acknowledged', () => {
    document.body.style.boxShadow = 'inset 0 0 50px rgba(80,200,120,0.3)';
    setTimeout(() => {
        document.body.style.boxShadow = 'none';
    }, 500);
});

socket.on('sleep-mode', () => {
    triggerFullSleep();
});

socket.on('wake-up', () => {
    wakeUp();
});

socket.on('user-joined', (count) => {
    addMessage(`Someone joined the room (${count} online)`, 'System');
});

socket.on('user-left', (count) => {
    addMessage(`Someone left (${count} online)`, 'System');
});'''

print(js_v2_fixed)
