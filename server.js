const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  socket.on("join", (name) => {
    socket.data.name = name;
    io.emit("chat", { name: "System", message: name + " joined" });
  });

  socket.on("chat", (data) => {
    io.emit("chat", data);
  });

  socket.on("disconnect", () => {
    if (socket.data.name) {
      io.emit("chat", {
        name: "System",
        message: socket.data.name + " left",
      });
    }
  });
});

server.listen(3001, () => {
  console.log("Server running on port 3001");
});
