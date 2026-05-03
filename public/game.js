const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const TILE = 24;
const W = 80;
const H = 40;

function makeWorld() {
  const w = [];
  for (let y = 0; y < H; y++) {
    const r = [];
    for (let x = 0; x < W; x++) {
      r.push(y > H - 5 ? 1 : 0);
    }
    w.push(r);
  }
  return w;
}

const keys = new Set();
window.addEventListener("keydown", e => keys.add(e.key));
window.addEventListener("keyup", e => keys.delete(e.key));

const mobile = { up:false, down:false, left:false, right:false, build:false };

function bind(id, prop) {
  const el = document.getElementById(id);
  el.addEventListener("touchstart", e => { e.preventDefault(); mobile[prop] = true; });
  el.addEventListener("touchend", e => { e.preventDefault(); mobile[prop] = false; });
  el.addEventListener("mousedown", () => mobile[prop] = true);
  el.addEventListener("mouseup", () => mobile[prop] = false);
}
bind("up","up");
bind("down","down");
bind("left","left");
bind("right","right");
bind("build","build");

class WorldGame extends netplayjs.Game {
  constructor() {
    super();
    this.world = makeWorld();
    this.players = new Map();
  }

  onPlayerJoin(p) {
    this.players.set(p, {
      x:40, y:30,
      name:p.metadata.name,
      color:`hsl(${Math.random()*360},80%,60%)`
    });
  }

  onPlayerLeave(p) {
    this.players.delete(p);
  }

  tick(inputs) {
    for (const [p,input] of inputs.entries()) {
      const pl = this.players.get(p);
      if (!pl) continue;

      const v = input.move();
      pl.x = Math.max(0, Math.min(W-1, pl.x + v.x*0.2));
      pl.y = Math.max(0, Math.min(H-1, pl.y + v.y*0.2));

      if (input.buildPressed()) {
        const tx = Math.round(pl.x);
        const ty = Math.round(pl.y+0.5);
        this.world[ty][tx] = this.world[ty][tx] ? 0 : 1;
      }
    }
  }
}

class Client extends netplayjs.Client {
  constructor(name) {
    super(WorldGame, {
      room:"GLOBAL_WORLD",
      metadata:{ name }
    });
    this.name = name;
  }

  getInput() {
    const i = new netplayjs.Input();
    i.left = keys.has("a") || keys.has("ArrowLeft") || mobile.left;
    i.right = keys.has("d") || keys.has("ArrowRight") || mobile.right;
    i.up = keys.has("w") || keys.has("ArrowUp") || mobile.up;
    i.down = keys.has("s") || keys.has("ArrowDown") || mobile.down;
    i.build = keys.has(" ") || mobile.build;
    return i;
  }

  transformInput(r) {
    return {
      move() {
        return {
          x:(r.left?-1:0)+(r.right?1:0),
          y:(r.up?-1:0)+(r.down?1:0)
        };
      },
      buildPressed() { return r.build; }
    };
  }

  onMessage(msg) {
    if (msg.type === "kick" && msg.target === this.name) {
      alert("You were kicked by admin");
      this.disconnect();
    }
    if (msg.type === "respawn" && msg.target === this.name) {
      const p = this.game.players.get(this.player);
      if (p) { p.x=40; p.y=30; }
    }
  }
}

let client = null;
let game = null;

const nameScreen = document.getElementById("name-screen");
const nameInput = document.getElementById("name-input");
const nameBtn = document.getElementById("name-btn");

const saved = localStorage.getItem("name");
if (saved) nameInput.value = saved;

nameBtn.onclick = () => {
  const n = nameInput.value.trim() || "Player";
  localStorage.setItem("name", n);
  nameScreen.style.display = "none";

  if (n === "Menimen") document.getElementById("admin-panel").style.display = "block";

  client = new Client(n);
  client.on("ready", () => game = client.game);
  client.connect();
};

document.getElementById("kick-btn").onclick = () => {
  const t = document.getElementById("admin-target").value.trim();
  client.send({ type:"kick", target:t });
};
document.getElementById("respawn-btn").onclick = () => {
  const t = document.getElementById("admin-target").value.trim();
  client.send({ type:"respawn", target:t });
};

function loop() {
  requestAnimationFrame(loop);
  ctx.fillStyle="#020617";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  if (!game) return;

  const me = game.players.get(client.player);
  let camX=0, camY=0;
  if (me) {
    camX = me.x*TILE - canvas.width/2;
    camY = me.y*TILE - canvas.height/2;
  }

  for (let y=0;y<H;y++) {
    for (let x=0;x<W;x++) {
      if (game.world[y][x]) {
        ctx.fillStyle="#14532d";
        ctx.fillRect(x*TILE-camX, y*TILE-camY, TILE, TILE);
      }
    }
  }

  for (const [id,p] of game.players.entries()) {
    const px = p.x*TILE - camX;
    const py = p.y*TILE - camY;

    ctx.fillStyle=p.color;
    ctx.fillRect(px, py-10, TILE, TILE+10);

    ctx.fillStyle="white";
    ctx.font="12px sans-serif";
    ctx.fillText(p.name, px, py-14);
  }
}

loop();
