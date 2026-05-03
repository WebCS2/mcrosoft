// Simple Pixel Worlds–style multiplayer sandbox using NetplayJS.
// No custom backend: just static hosting + NetplayJS signaling.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 24;
const WORLD_W = 40;
const WORLD_H = 22;

// Generate a simple world: grass on bottom rows, sky above.
function createWorld() {
  const world = [];
  for (let y = 0; y < WORLD_H; y++) {
    const row = [];
    for (let x = 0; x < WORLD_W; x++) {
      if (y > WORLD_H - 4) row.push(1); // ground
      else row.push(0); // air
    }
    world.push(row);
  }
  return world;
}

// Random bright color for players.
function randomColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 80%, 60%)`;
}

// Local input state.
const keys = new Set();
window.addEventListener("keydown", (e) => {
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key) ||
      ["w","a","s","d","W","A","S","D"].includes(e.key)) {
    e.preventDefault();
  }
  keys.add(e.key);
});
window.addEventListener("keyup", (e) => keys.delete(e.key));

// Chat UI helpers.
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

// Game class synced by NetplayJS.
class PixelWorldsGame extends netplayjs.Game {
  constructor() {
    super();
    this.world = createWorld();
    this.players = new Map(); // playerId -> {x,y,color,name}
    this.chatMessages = [];   // purely cosmetic; not synced (local log)
  }

  // Called when a player joins.
  onPlayerJoin(player) {
    const spawnX = Math.floor(WORLD_W / 2);
    const spawnY = WORLD_H - 5;
    this.players.set(player, {
      x: spawnX,
      y: spawnY,
      color: randomColor(),
      name: player.metadata?.name || "Player"
    });
  }

  // Called when a player leaves.
  onPlayerLeave(player) {
    this.players.delete(player);
  }

  // Main simulation step.
  tick(playerInputs) {
    for (const [player, input] of playerInputs.entries()) {
      const p = this.players.get(player);
      if (!p) continue;

      const vel = input.arrowKeys(); // {x,y} from arrows/WASD
      let nx = p.x + vel.x * 0.2;
      let ny = p.y + vel.y * 0.2;

      // Clamp to world bounds.
      nx = Math.max(0, Math.min(WORLD_W - 1, nx));
      ny = Math.max(0, Math.min(WORLD_H - 1, ny));

      p.x = nx;
      p.y = ny;

      // Space = toggle block under feet.
      if (input.keyPressed("Space")) {
        const tx = Math.round(p.x);
        const ty = Math.round(p.y + 0.5);
        if (ty >= 0 && ty < WORLD_H && tx >= 0 && tx < WORLD_W) {
          this.world[ty][tx] = this.world[ty][tx] === 0 ? 1 : 0;
        }
      }
    }
  }
}

// NetplayJS client wrapper.
class PixelWorldsClient extends netplayjs.Client {
  constructor(roomName, playerName) {
    super(PixelWorldsGame, {
      // Room name is used as matchmaking key.
      room: roomName,
      // Attach metadata to identify player.
      metadata: { name: playerName }
    });
    this.playerName = playerName;
  }

  // Map local keyboard state to NetplayJS Input.
  getInput() {
    const input = new netplayjs.Input();
    if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) input.left = true;
    if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) input.right = true;
    if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) input.up = true;
    if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) input.down = true;
    if (keys.has(" ")) input.space = true;
    return input;
  }

  // Translate our custom fields into arrowKeys/keyPressed helpers.
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
        if (name === "Space") return !!raw.space;
        return false;
      }
    };
  }

  // Optional: handle custom messages (chat).
  onMessage(msg, from) {
    if (msg.type === "chat") {
      const name = msg.name || "Player";
      addChatLine(`${name}: ${msg.text}`, msg.color || "#ccc");
    }
  }
}

let client = null;
let game = null;

// UI wiring.
const nameInput = document.getElementById("name-input");
const roomInput = document.getElementById("room-input");
const joinBtn = document.getElementById("join-btn");
const statusSpan = document.getElementById("status");

// Simple local name persistence.
const savedName = localStorage.getItem("pw_name");
if (savedName) nameInput.value = savedName;

joinBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim() || "Player";
  const room = roomInput.value.trim() || "room-1";
  localStorage.setItem("pw_name", name);

  if (client) {
    client.disconnect();
    client = null;
  }

  statusSpan.textContent = "Connecting...";
  joinBtn.disabled = true;

  client = new PixelWorldsClient(room, name);

  client.on("connect", () => {
    statusSpan.textContent = `Connected to "${room}" as ${name}`;
  });

  client.on("disconnect", () => {
    statusSpan.textContent = "Disconnected";
    joinBtn.disabled = false;
  });

  client.on("ready", () => {
    game = client.game;
  });

  try {
    await client.connect();
  } catch (e) {
    console.error(e);
    statusSpan.textContent = "Failed to connect";
    joinBtn.disabled = false;
  }
});

// Chat send.
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

// Rendering.
function render() {
  requestAnimationFrame(render);
  ctx.imageSmoothingEnabled = false;

  // Clear.
  ctx.fillStyle = "#050816";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!game) {
    ctx.fillStyle = "#888";
    ctx.font = "16px monospace";
    ctx.fillText("Enter name + room, then click Join.", 20, 40);
    return;
  }

  // Camera: center on local player if possible.
  let camX = 0;
  let camY = 0;
  const me = game.players.get(client.player);
  if (me) {
    camX = me.x * TILE_SIZE - canvas.width / 2;
    camY = me.y * TILE_SIZE - canvas.height / 2;
  }

  // Draw world.
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const tile = game.world[y][x];
      if (tile === 1) {
        ctx.fillStyle = "#14532d";
        ctx.fillRect(
          x * TILE_SIZE - camX,
          y * TILE_SIZE - camY,
          TILE_SIZE,
          TILE_SIZE
        );
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(
          x * TILE_SIZE - camX + 4,
          y * TILE_SIZE - camY + 4,
          TILE_SIZE - 8,
          TILE_SIZE - 8
        );
      }
    }
  }

  // Draw players.
  for (const [player, p] of game.players.entries()) {
    const px = p.x * TILE_SIZE - camX;
    const py = p.y * TILE_SIZE - camY;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(px, py + TILE_SIZE - 4, TILE_SIZE, 6);

    // Body
    ctx.fillStyle = p.color;
    ctx.fillRect(px, py - TILE_SIZE * 0.5, TILE_SIZE, TILE_SIZE * 1.2);

    // Name tag
    ctx.fillStyle = "#000000aa";
    ctx.fillRect(px - 4, py - TILE_SIZE * 0.9 - 14, TILE_SIZE + 8, 14);
    ctx.fillStyle = "#fff";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      p.name,
      px + TILE_SIZE / 2,
      py - TILE_SIZE * 0.9 - 3
    );
  }
}

render();
