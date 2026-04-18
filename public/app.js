const socket = io();
let roomId = '';
let currentSource = 'youtube';
let syncEnabled = true;
let volumeFadeInterval = null;
let ytPlayer = null;

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

function joinRoom() {
    roomId = document.getElementById('roomName').value.trim() || 'emerald-room';
    socket.emit('join-room', roomId);
    
    document.getElementById('roomInput').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    
    setTimeout(() => showEmeraldGate(), 10 * 1000); // 10s for testing, change to 20*60*1000 for 20min
}

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
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\\?v=|\\&v=)([^#\\&\\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

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

function showEmeraldGate() {
    const gate = document.getElementById('emeraldGate');
    gate.style.display = 'block';
    socket.emit('start-emerald-timer', 30000);
    setTimeout(() => {
        if (gate.style.display === 'block') {
            gate.style.display = 'none';
        }
    }, 35000);
}

function pressEmeraldGate() {
    socket.emit('emerald-check');
    document.getElementById('emeraldGate').style.display = 'none';
    setTimeout(() => showEmeraldGate(), 20 * 60 * 1000);
}

function triggerSleepMode() {
    const overlay = document.getElementById('sleepOverlay');
    overlay.classList.add('active');
    
    let volume = 1.0;
    const fadeInterval = setInterval(() => {
        volume -= 0.033;
        if (volume <= 0) {
            volume = 0;
            clearInterval(fadeInterval);
            if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
            const localVideo = document.getElementById('localPlayer');
            if (localVideo) localVideo.pause();
        }
        
        if (ytPlayer && ytPlayer.setVolume) {
            ytPlayer.setVolume(volume * 100);
        }
        const localVideo = document.getElementById('localPlayer');
        if (localVideo) localVideo.volume = volume;
    }, 1000);
    
    volumeFadeInterval = fadeInterval;
}

function wakeUp() {
    const overlay = document.getElementById('sleepOverlay');
    overlay.classList.remove('active');
    
    if (volumeFadeInterval) clearInterval(volumeFadeInterval);
    if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(100);
    const localVideo = document.getElementById('localPlayer');
    if (localVideo) {
        localVideo.volume = 1.0;
        localVideo.play().catch(()=>{});
    }
}

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
    triggerSleepMode();
});

socket.on('wake-up', () => {
    wakeUp();
});

socket.on('user-joined', (count) => {
    addMessage(`Someone joined the room (${count} online)`, 'System');
});

socket.on('user-left', (count) => {
    addMessage(`Someone left (${count} online)`, 'System');
});