const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const MEMBERS = [
  "王俊凯","王源","易烊千玺",
  "马嘉祺","丁程鑫","宋亚轩","刘耀文","张真源","严浩翔","贺峻霖","敖子逸","李天泽","陈玺达","陈泗旭","宋文嘉",
  "朱志鑫","张泽禹","张极","左航","苏新皓","张峻豪","余宇涵","童禹坤","陈天润","穆祉丞","邓佳鑫","姚昱辰",
  "官俊臣","张桂源","张函瑞","王橹杰","王烁然","左奇函","陈奕恒","杨博文","杨涵博","张奕然","聂玮辰","陈思罕","魏子宸","李煜东","陈浚铭","汪浚熙","王浩","李嘉森"
];

const rooms = {};

function genRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generatePool(targetName) {
  const pool = [targetName];
  const others = MEMBERS.filter(m => m !== targetName);
  others.sort(() => Math.random() - 0.5);
  const count = Math.floor(Math.random() * 6) + 14;
  for (let i = 0; i < count; i++) {
    pool.push(others[i]);
  }
  return pool.sort(() => Math.random() - 0.5);
}

io.on("connection", (socket) => {
  socket.on("create-room", () => {
    const roomId = genRoomId();
    rooms[roomId] = {
      players: [socket.id],
      secrets: {},
      turn: socket.id,
      history: [],
      over: false,
    };
    socket.join(roomId);
    socket.emit("room-created", roomId);
  });

  socket.on("join-room", (roomId) => {
    const room = rooms[roomId];
    if (!room) return socket.emit("error-msg", "房间不存在");
    if (room.players.length >= 2) return socket.emit("error-msg", "房间已满");
    
    room.players.push(socket.id);
    socket.join(roomId);

    const p1 = room.players[0];
    const p2 = room.players[1];

    room.secrets[p1] = MEMBERS[Math.floor(Math.random() * MEMBERS.length)];
    room.secrets[p2] = MEMBERS[Math.floor(Math.random() * MEMBERS.length)];

    const pool1 = generatePool(room.secrets[p2]);
    const pool2 = generatePool(room.secrets[p1]);

    io.to(roomId).emit("room-ready", {
      roomId,
      players: room.players.length,
      turn: room.turn,
    });

    io.to(p1).emit("your-secret", { secret: room.secrets[p1], pool: pool1 });
    io.to(p2).emit("your-secret", { secret: room.secrets[p2], pool: pool2 });
  });

  socket.on("ask", ({ roomId, question }) => {
    const room = rooms[roomId];
    if (!room || room.over || room.turn !== socket.id) return;
    const opponent = room.players.find((p) => p !== socket.id);
    if (!opponent) return;

    io.to(roomId).emit("question-asked", { from: socket.id, question });
    room.turn = opponent;
    io.to(roomId).emit("turn-changed", room.turn);
  });

  socket.on("answer", ({ roomId, answer }) => {
    const room = rooms[roomId];
    if (!room || room.over || room.turn !== socket.id) return;
    if (!["是", "否", "不确定"].includes(answer)) return;

    io.to(roomId).emit("answer-given", { from: socket.id, answer });
    room.turn = socket.id;
    io.to(roomId).emit("turn-changed", room.turn);
  });

  socket.on("guess", ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room || room.over || room.turn !== socket.id) return;

    const opponent = room.players.find((p) => p !== socket.id);
    const correct = room.secrets[opponent] === name;

    io.to(roomId).emit("guess-result", { from: socket.id, name, correct });

    if (correct) {
      room.over = true;
      io.to(roomId).emit("game-over", { winner: socket.id, answer: name });
    } else {
      room.turn = opponent;
      io.to(roomId).emit("turn-changed", room.turn);
    }
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      if (rooms[roomId].players.includes(socket.id)) {
        io.to(roomId).emit("opponent-left");
        delete rooms[roomId];
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
