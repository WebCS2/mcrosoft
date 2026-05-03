const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 24;
const WORLD_W = 80;
const WORLD_H = 40;

function createWorld() {
  const world = [];
  for (let y = 0; y < WORLD_H; y++) {
    const row = [];
    for (let x = 0; x < WORLD_W; x++) {
      if (y > WORLD_H - 5) row.push(1); // ground
      else row.push(0); // air
    }
    world.push(row);
  }
  return world;
}

function randomColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 80%, 60%)`;
}

// INPUT STATE (keyboard + mobile)
const keys = new Set();
window.addEventListener("keydown", (e) => {
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key) ||
      ["w","a","s","d","W","A","S","D"].includes(e.key)) {
    e.preventDefault();
  }
  keys.add(e.key);
});
window.addEventListener("keyup", (e) => keys.delete(e.key));

const mobileInput = { up:false, down:false, left:false, right:false, build:false };

function bindHoldButton(id, prop) {
  const el = document.getElementById(id);
  const onDown = (e) => { e.preventDefault(); mobileInput[prop] = true; };
  const onUp = (e) => { e.preventDefault(); mobileInput[prop] = false; };
  ["mousedown","touchstart"].forEach(ev => el.addEventListener(ev, onDown));
  ["mouseup","mouseleave","touchend","touchcancel"].forEach(ev => el.addEventListener(ev, onUp));
}
bindHoldButton("btn-up", "up");
bindHoldButton("btn-down", "down");
bindHoldButton("btn-left", "left");
bindHoldButton("btn-right", "right");
bindHoldButton("btn-build", "build");

// CHAT UI
const chatLog = document.getElementById("chat-log");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");

function addChatLine(text, color = "#ccc") {
  const div = document.createElement("div");
  div.textContent = text;
  div.style.color = color;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// GAME CLASS
class PixelWorldsGame extends netplayjs.Game {
  constructor() {
    super();
    this.world = createWorld();
    this.players = new Map(); // player -> {x,y,color,name}
  }

  onPlayerJoin(player) {
    const spawnX = Math.floor(WORLD_W / 2);
    const spawnY = WORLD_H - 6;
    this.players.set(player, {
      x: spawnX,
      y: spawnY,
      color: randomColor(),
      name: player.metadata?.name || "Player"
    });
  }

  onPlayerLeave(player) {
    this.players.delete(player);
  }

  tick(playerInputs) {
    for (const [player, input] of playerInputs.entries()) {
      const p = this.players.get(player);
      if (!p) continue;

      const vel = input.arrowKeys();
      let nx = p.x + vel.x * 0.2;
      let ny = p.y + vel.y * 0.2;

      nx = Math.max(0, Math.min(WORLD_W - 1, nx));
      ny = Math.max(0, Math.min(WORLD_H - 1, ny));

      p.x = nx;
      p.y = ny;

      if (input.keyPressed("Build")) {
        const tx = Math.round(p.x);
        const ty = Math.round(p.y + 0.5);
        if (ty >= 0 && ty < WORLD_H && tx >= 0 && tx < WORLD_W) {
          this.world[ty][tx] = this.world[ty][tx] === 0 ? 1 : 0;
        }
      }
    }
  }
}

// CLIENT
class PixelWorldsClient extends netplayjs.Client {
  constructor(playerName) {
    super(PixelWorldsGame, {
      room: "GLOBAL_PIXEL_WORLD",
      metadata: { name: playerName }
    });
    this.playerName = playerName;
  }

  getInput() {
    const input = new netplayjs.Input();
    if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A") || mobileInput.left) input.left = true;
    if (keys.has("ArrowRight") || keys.has("d") || keys.has("D") || mobileInput.right) input.right = true;
    if (keys.has("ArrowUp") || keys.has("w") || keys.has("W") || mobileInput.up) input.up = true;
    if (keys.has("ArrowDown") || keys.has("s") || keys.has("S") || mobileInput.down) input.down = true;
    if (keys.has(" ") || mobileInput.build) input.build = true;
    return input;
  }

  transformInput(raw) {
    return {
      arrowKeys() {
        let x = 0, y = 0;
        if (raw.left) x -= 1;
        if (raw.right) x += 1;
        if (raw.up) y -= 1;
        if (raw.down) y += 1;
        return { x, y };
      },
      keyPressed(name) {
        if (name === "Build") return !!raw.build;
        return false;
      }
    };
  }

  onMessage(msg, from) {
    if (msg.type === "chat") {
      const name = msg.name || "Player";
      addChatLine(`${name}: ${msg.text}`, msg.color || "#ccc");
    }
    if (msg.type === "admin_kick") {
      if (msg.target === this.playerName) {
        addChatLine("You were kicked by admin.", "#f97316");
        this.disconnect();
      }
    }
    if (msg.type === "admin_respawn") {
      if (msg.target === this.playerName && this.game) {
        const p = this.game.players.get(this.player);
        if (p) {
          p.x = Math.floor(WORLD_W / 2);
          p.y = WORLD_H - 6;
        }
      }
    }
  }
}

let client = null;
let game = null;

// NAME FLOW
const nameModal = document.getElementById("name-modal");
const nameInput = document.getElementById("name-input");
const nameConfirm = document.getElementById("name-confirm");
const statusSpan = document.getElementById("status");
const adminPanel = document.getElementById("admin-panel");
const adminTarget = document.getElementById("admin-target");
const adminKick = document.getElementById("admin-kick");
const adminRespawn = document.getElementById("admin-respawn");

const savedName = localStorage.getItem("pw_name");
if (savedName) {
  nameInput.value = savedName;
} else {
  nameInput.value = "";
}

function startWithName(name) {
  localStorage.setItem("pw_name", name);
  nameModal.style.display = "none";

  if (name === "Menimen") {
    adminPanel.style.display = "block";
  }

  client = new PixelWorldsClient(name);

  client.on("connect", () => {
    statusSpan.textContent = `Connected as ${name}`;
  });

  client.on("disconnect", () => {
    statusSpan.textContent = "Disconnected";
  });

  client.on("ready", () => {
    game = client.game;
  });

  client.connect().catch((e) => {
    console.error(e);
    statusSpan.textContent = "Failed to connect";
  });
}

nameConfirm.addEventListener("click", () => {
  const name = nameInput.value.trim() || "Player";
  startWithName(name);
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const name = nameInput.value.trim() || "Player";
    startWithName(name);
  }
});

// Auto-start if name already saved
if (savedName) {
  startWithName(savedName);
}

// CHAT SEND
function sendChat() {
  const text = chatInput.value.trim();
  if (!text || !client) return;
  chatInput.value = "";
  const color = "#4ade80";
  addChatLine(`You: ${text}`, color);
  client.send({ type: "chat", text, name: client.playerName, color });
}
chatSend.addEventListener("click", sendChat);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendChat();
  }
});

// ADMIN ACTIONS (Menimen only)
adminKick.addEventListener("click", () => {
  if (!client) return;
  const target = adminTarget.value.trim();
  if (!target) return;
  client.send({ type: "admin_kick", target });
  addChatLine(`Admin: kicked ${target}`, "#f97316");
});

adminRespawn.addEventListener("click", () => {
  if (!client) return;
  const target = adminTarget.value.trim();
  if (!target) return;
  client.send({ type: "admin_respawn", target });
  addChatLine(`Admin: respawned ${target}`, "#f97316");
});

// RENDER LOOP
function render() {
  requestAnimationFrame(render);
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!game) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "16px monospace";
    ctx.fillText("Connecting to global world...", 20, 40);
    return;
  }

  let camX = 0;
  let camY = 0;
  const me = game.players.get(client.player);
  if (me) {
    camX = me.x * TILE_SIZE - canvas.width / 2;
    camY = me.y * TILE_SIZE - canvas.height / 2;
  }

  // WORLD
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const tile = game.world[y][x];
      if (tile === 1) {
        const sx = x * TILE_SIZE - camX;
        const sy = y * TILE_SIZE - camY;
        ctx.fillStyle = "#14532d";
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      }
    }
  }

  // PLAYERS
  for (const [player, p] of game.players.entries()) {
    const px = p.x * TILE_SIZE - camX;
    const py = p.y * TILE_SIZE - camY;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(px, py + TILE_SIZE - 4, TILE_SIZE, 6);

    ctx.fillStyle = p.color;
    ctx.fillRect(px, py - TILE_SIZE * 0.5, TILE_SIZE, TILE_SIZE * 1.2);

    ctx.fillStyle = "#000000aa";
    ctx.fillRect(px - 4, py - TILE_SIZE * 0.9 - 14, TILE_SIZE + 8, 14);
    ctx.fillStyle = "#fff";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(p.name, px + TILE_SIZE / 2, py - TILE_SIZE * 0.9 - 3);
  }
}

render();
