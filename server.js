// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const players = {}; // socketId -> {id,name,mod,x,y}

io.on("connection", (socket) => {
  console.log("connected", socket.id);

  socket.on("join", (data) => {
    players[socket.id] = {
      id: socket.id,
      name: data.name,
      mod: !!data.mod,
      x: data.x || 0,
      y: data.y || 0
    };

    // send full world state to this player
    socket.emit("world-state", players);

    // tell others about this player
    socket.broadcast.emit("player-joined", players[socket.id]);
  });

  socket.on("move", (data) => {
    const p = players[socket.id];
    if (!p) return;
    p.x = data.x;
    p.y = data.y;
    p.name = data.name;
    p.mod = !!data.mod;

    socket.broadcast.emit("player-moved", p);
  });

  socket.on("chat", (msg) => {
    const p = players[socket.id];
    if (!p) return;
    io.emit("chat", {
      name: p.name,
      mod: p.mod,
      msg: msg.msg
    });
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("player-left", socket.id);
    console.log("disconnected", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server listening on", PORT);
});
