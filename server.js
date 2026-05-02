const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server,{ cors:{origin:"*"} });

let players = {};

io.on("connection", socket => {

  socket.on("join", name=>{
    players[socket.id] = {x:50,y:50,name};
    io.emit("players", players);
  });

  socket.on("move", pos=>{
    if(players[socket.id]){
      players[socket.id].x = pos.x;
      players[socket.id].y = pos.y;
      io.emit("players", players);
    }
  });

  socket.on("chat", data=>{
    io.emit("chat", data);
  });

  socket.on("disconnect", ()=>{
    delete players[socket.id];
    io.emit("players", players);
  });

});

server.listen(3001, ()=>console.log("Server running"));
