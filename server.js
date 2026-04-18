const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

io.on('connection', (socket) => {
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    socket.roomId = roomId;
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Set(),
        videoState: 'paused',
        currentTime: 0,
        emeraldGateActive: false,
        sleepModeTriggered: false
      });
    }
    
    const room = rooms.get(roomId);
    room.users.add(socket.id);
    socket.emit('room-state', {
      videoState: room.videoState,
      currentTime: room.currentTime,
      userCount: room.users.size
    });
    socket.to(roomId).emit('user-joined', room.users.size);
  });
  
  socket.on('video-action', (data) => {
    const room = rooms.get(socket.roomId);
    if (room) {
      room.videoState = data.action;
      room.currentTime = data.time;
      socket.to(socket.roomId).emit('video-action', data);
    }
  });
  
  socket.on('chat-message', (msg) => {
    socket.to(socket.roomId).emit('chat-message', {
      text: msg,
      sender: socket.id.slice(0,4),
      timestamp: Date.now()
    });
  });
  
  socket.on('emerald-check', () => {
    const room = rooms.get(socket.roomId);
    if (room) {
      room.emeraldGateActive = true;
      room.lastEmeraldTime = Date.now();
      io.to(socket.roomId).emit('emerald-acknowledged');
      if (room.sleepTimeout) {
        clearTimeout(room.sleepTimeout);
        room.sleepTimeout = null;
      }
      if (room.sleepModeTriggered) {
        room.sleepModeTriggered = false;
        io.to(socket.roomId).emit('wake-up');
      }
    }
  });
  
  socket.on('start-emerald-timer', (duration) => {
    const room = rooms.get(socket.roomId);
    if (room && !room.sleepTimeout) {
      room.emeraldGateActive = false;
      room.sleepTimeout = setTimeout(() => {
        room.sleepModeTriggered = true;
        io.to(socket.roomId).emit('sleep-mode');
      }, duration);
    }
  });
  
  socket.on('disconnect', () => {
    const room = rooms.get(socket.roomId);
    if (room) {
      room.users.delete(socket.id);
      if (room.users.size === 0) {
        rooms.delete(socket.roomId);
      } else {
        socket.to(socket.roomId).emit('user-left', room.users.size);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Emerald Gate running on port ${PORT}`));