import { drivingInput } from './controls.js';
import { createBoostPickups } from '../../shared/powerups.js';
import {
  createPartyState,
  beginPartyStep,
  endPartyStep,
  partyBotInput,
} from '../../shared/party.js';
import { createWorld } from './scene.js';
import { RenderMotion } from './motion.js';
import { DEFAULT_QUALITY } from './render-settings.js';
import {
  createCar,
  stepCar,
  botInput,
  blankInput,
  DT,
  collideCars,
  raceOrder,
  wrap,
} from '../../shared/physics.js';
import { getTrack, DEFAULT_TRACK_ID } from '../../shared/track.js';
const clone = (x) => JSON.parse(JSON.stringify(x));
export class RaceEngine {
  constructor(container, notify, worldFactory = createWorld) {
    this.worldFactory = worldFactory;
    this.container = container;
    this.notify = notify;
    this.phase = 'loading';
    this.trackId = DEFAULT_TRACK_ID;
    try {
      this.trackId = getTrack(localStorage.getItem('roadster-track')).id;
    } catch {}
    this.switchingTrack = false;
    this.cars = [];
    this.ownId = 'you';
    this.keys = new Set();
    this.elapsed = 0;
    this.pickups = createBoostPickups(this.trackId);
    this.party = createPartyState(undefined, this.trackId);
    this.countdown = 3;
    this.accumulator = 0;
    this.paused = false;
    this.online = false;
    this.room = null;
    this.pending = [];
    this.sequence = 0;
    this.socket = null;
    this.cameraView = 0;
    this.sound = false;
    this.quality = DEFAULT_QUALITY;
    this.closed = false;
    this.motion = new RenderMotion();
    this.lastHud = 0;
    this.input = blankInput();
    this.gamepad = false;
  }
  async init() {
    try {
      this.world = await this.worldFactory(
        this.container,
        (progress) => this.notify({ progress }),
        this.quality,
        this.trackId,
      );
      if (this.closed) {
        this.world.dispose();
        return;
      }
      this.cars = [
        this.makeCar('you', 'YOU', 0),
        this.makeCar('nova', 'NOVA', 1, '#8ad4ff'),
        this.makeCar('blaze', 'BLAZE', 2, '#ff946c'),
        this.makeCar('vector', 'VECTOR', 3, '#c9abff'),
      ];
      this.motion.reset(this.cars);
      this.phase = 'menu';
      this.notify({ ready: true, phase: 'menu', progress: 100, trackId: this.trackId });
      this.bind();
      this.last = performance.now();
      this.frame = requestAnimationFrame((t) => this.loop(t));
    } catch (e) {
      console.error(e);
      this.notify({
        error: 'The 3D scene could not load. Check that WebGL is enabled, then reload.',
        ready: false,
      });
    }
  }
  makeCar(id, name, index = 0, color = '#d7fc70') {
    return createCar(id, name, index, color, this.trackId);
  }
  async loadTrack(trackId) {
    const track = getTrack(trackId);
    if (track.id === this.trackId && this.world) return;
    const previousPhase = this.phase;
    this.switchingTrack = true;
    this.notify({ ready: false, progress: 0, error: null, trackId: track.id });
    try {
      const world = await this.worldFactory(
        this.container,
        (progress) => this.notify({ progress }),
        this.quality,
        track.id,
      );
      if (this.closed) {
        world.dispose();
        return;
      }
      this.world?.dispose();
      this.world = world;
      this.trackId = track.id;
      this.accumulator = 0;
      this.pending = [];
      this.keys.clear();
      this.pickups = createBoostPickups(this.trackId);
      this.party = createPartyState(undefined, this.trackId);
      this.motion.reset([]);
      try {
        localStorage.setItem('roadster-track', this.trackId);
      } catch {}
      this.notify({ ready: true, progress: 100, trackId: this.trackId, phase: previousPhase });
    } catch (error) {
      this.notify({
        ready: true,
        trackId: this.trackId,
        error: 'This circuit could not load. Please try again.',
      });
      throw error;
    } finally {
      this.switchingTrack = false;
    }
  }
  async selectTrack(trackId) {
    if (this.phase !== 'menu' || this.switchingTrack) return;
    try {
      await this.loadTrack(trackId);
      if (!this.closed) this.quit();
    } catch {}
  }
  bind() {
    this.keydown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) &&
        ['racing', 'countdown'].includes(this.phase)
      )
        e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Escape' && ['racing', 'countdown'].includes(this.phase)) {
        this.setPaused(!this.paused);
        return;
      }
      if (e.code === 'KeyC') this.cameraView = (this.cameraView + 1) % 2;
      if (e.code === 'KeyM') this.setSound(!this.sound);
      this.keys.add(e.code);
    };
    this.keyup = (e) => this.keys.delete(e.code);
    this.blur = () => {
      this.keys.clear();
      if (!this.online && ['racing', 'countdown'].includes(this.phase)) this.setPaused(true);
    };
    addEventListener('keydown', this.keydown);
    addEventListener('keyup', this.keyup);
    addEventListener('blur', this.blur);
  }
  readInput() {
    if (this.paused) return blankInput();
    const pad = Array.from(navigator.getGamepads?.() || []).find(Boolean);
    this.gamepad = !!pad;
    return drivingInput(this.keys, pad);
  }
  startLocal(practice = false, name = 'YOU', color = '#d7fc70') {
    this.disconnect();
    this.online = false;
    this.ownId = 'you';
    this.name = name || 'YOU';
    this.color = color;
    this.practice = practice;
    this.cars = [this.makeCar('you', this.name, 0, color)];
    if (!practice)
      this.cars.push(
        this.makeCar('nova', 'NOVA', 1, '#8ad4ff'),
        this.makeCar('blaze', 'BLAZE', 2, '#ff946c'),
        this.makeCar('vector', 'VECTOR', 3, '#c9abff'),
      );
    this.elapsed = 0;
    this.pickups = createBoostPickups(this.trackId);
    this.party = createPartyState(Date.now(), this.trackId);
    this.countdown = 3;
    this.accumulator = 0;
    this.phase = 'countdown';
    this.paused = false;
    this.keys.clear();
    this.motion.reset(this.cars);
    this.world.resetCamera();
    this.ensureAudio();
    this.notify({ phase: this.phase, paused: false, online: false, room: null, error: null });
  }
  setPaused(value) {
    this.paused = value;
    this.accumulator = 0;
    this.motion.beforeStep(this.cars);
    this.keys.clear();
    this.notify({ paused: value });
  }
  quit() {
    this.disconnect();
    this.online = false;
    this.phase = 'menu';
    this.pickups = createBoostPickups(this.trackId);
    this.party = createPartyState(undefined, this.trackId);
    this.elapsed = 0;
    this.paused = false;
    this.keys.clear();
    this.cars = [
      this.makeCar('you', 'YOU', 0, this.color || '#d7fc70'),
      this.makeCar('nova', 'NOVA', 1, '#8ad4ff'),
      this.makeCar('blaze', 'BLAZE', 2, '#ff946c'),
      this.makeCar('vector', 'VECTOR', 3, '#c9abff'),
    ];
    this.ownId = 'you';
    this.accumulator = 0;
    this.motion.reset(this.cars);
    this.world?.resetCamera();
    this.notify({
      phase: 'menu',
      paused: false,
      room: null,
      online: false,
      error: null,
      connecting: false,
    });
  }
  tick() {
    if (this.switchingTrack) return;
    this.input = this.readInput();
    if (this.phase === 'menu' || this.phase === 'loading' || this.phase === 'lobby') return;
    if (this.paused && !this.online) return;
    if (this.online) {
      const own = this.cars.find((c) => c.id === this.ownId);
      if (!own) return;
      if (['countdown', 'racing'].includes(this.phase)) {
        const seq = ++this.sequence;
        this.send({ type: 'input', seq, input: this.input });
        this.pending.push({ seq, input: { ...this.input } });
        if (this.pending.length > 180) this.pending.shift();
        if (this.phase === 'racing') {
          this.elapsed += DT;
          stepCar(own, this.input, DT, this.elapsed, true, this.pickups);
        }
      }
      return;
    }
    if (this.phase === 'countdown') {
      this.countdown -= DT;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.elapsed = 0;
        this.notify({ phase: 'racing' });
      }
      return;
    }
    if (this.phase === 'racing' || this.phase === 'results') {
      this.elapsed += DT;
      const previous = new Map(this.cars.map((c) => [c.id, { ...c }]));
      const inputs = new Map(
        this.cars.map((c, j) => [
          c.id,
          j === 0
            ? this.input
            : partyBotInput(botInput(c, j - 1), c, this.cars, this.party, this.elapsed),
        ]),
      );
      beginPartyStep(this.cars, inputs, this.party, this.elapsed);
      for (let j = 0; j < this.cars.length; j++)
        stepCar(this.cars[j], inputs.get(this.cars[j].id), DT, this.elapsed, true, this.pickups);
      collideCars(this.cars);
      endPartyStep(this.cars, previous, this.party, this.elapsed);
      if (this.cars[0].finishTime !== null && this.phase !== 'results') {
        this.phase = 'results';
        this.notify({ phase: 'results' });
        try {
          const previous = Number(
            localStorage.getItem('roadster-best-' + this.trackId) || Infinity,
          );
          if (this.cars[0].finishTime < previous)
            localStorage.setItem('roadster-best-' + this.trackId, String(this.cars[0].finishTime));
        } catch {}
      }
    }
  }
  loop(now) {
    if (this.closed) return;
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.accumulator += dt;
    while (this.accumulator >= DT) {
      this.motion.beforeStep(this.cars);
      this.tick();
      this.accumulator -= DT;
    }
    if (!this.switchingTrack)
      this.world.update(
        this.motion.sample(this.cars, this.accumulator / DT, dt, now, this.online, this.ownId),
        this.ownId,
        dt,
        this.phase === 'menu' || this.phase === 'lobby' ? 'menu' : this.phase,
        this.input,
        this.cameraView,
        this.pickups,
        this.elapsed,
        this.party,
      );
    this.updateAudio();
    if (!this.switchingTrack && now - this.lastHud > 80) {
      this.lastHud = now;
      const own = this.cars.find((c) => c.id === this.ownId) || this.cars[0],
        ordered = raceOrder(this.cars);
      this.notify({
        hud: {
          own: { ...own },
          ordered: ordered.map((c) => ({ ...c })),
          cars: this.cars.map((c) => ({ ...c })),
          elapsed: this.elapsed,
          countdown: this.countdown,
          position: ordered.findIndex((c) => c.id === this.ownId) + 1,
          phase: this.phase,
          gamepad: this.gamepad,
          online: this.online,
        },
        sound: this.sound,
      });
    }
    this.frame = requestAnimationFrame((t) => this.loop(t));
  }
  async connect(action, name, code) {
    this.disconnect();
    this.notify({ connecting: true, error: null });
    try {
      let url = import.meta.env.VITE_RACE_SERVER_URL?.trim();
      if (!url) url = location.origin.replace(/^http/, 'ws') + '/race/ws';
      else {
        url = url.replace(/^http/, 'ws');
        if (new URL(url).pathname === '/') url = url.replace(/\/$/, '') + '/race/ws';
      }
      const socket = new WebSocket(url);
      this.socket = socket;
      let welcomed = false;
      const timeout = setTimeout(() => {
        if (!welcomed) {
          socket.close();
          this.notify({
            connecting: false,
            error: 'The race server is unavailable. Solo racing is ready to play.',
          });
        }
      }, 7000);
      socket.onopen = () => this.send({ type: action, name, code, trackId: this.trackId });
      let receiveQueue = Promise.resolve();
      socket.onmessage = (e) => {
        let m;
        try {
          m = JSON.parse(e.data);
        } catch {
          return;
        }
        if (m.type === 'error' && !welcomed) {
          clearTimeout(timeout);
          socket.close();
        }
        if (m.type === 'welcome') {
          welcomed = true;
          clearTimeout(timeout);
          this.online = true;
          this.ownId = m.id;
          this.notify({ online: true, connecting: false });
        }
        receiveQueue = receiveQueue
          .then(() => {
            if (this.socket === socket) return this.receive(m, socket);
          })
          .catch(() => {
            if (this.socket === socket) socket.close();
          });
      };
      socket.onerror = () => {
        this.notify({
          error: 'Could not reach the race server. Solo racing is still available.',
          connecting: false,
        });
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        if (this.socket !== socket) return;
        this.socket = null;
        if (this.online) {
          this.online = false;
          this.phase = 'menu';
          this.ownId = 'you';
          this.cars = [this.makeCar('you', 'YOU')];
          this.party = createPartyState(undefined, this.trackId);
          this.motion.reset(this.cars);
          this.world.resetCamera();
          this.notify({
            phase: 'menu',
            online: false,
            room: null,
            error: 'Disconnected from the race server. Rejoin with the room code.',
            connecting: false,
          });
        }
      };
    } catch {
      this.notify({ connecting: false, error: 'The race server address is invalid.' });
    }
  }
  async receive(m, sourceSocket = this.socket) {
    if (m.trackId && m.trackId !== this.trackId) await this.loadTrack(m.trackId);
    if (this.closed || (sourceSocket && this.socket !== sourceSocket)) return;
    if (m.type === 'error') {
      this.notify({ error: m.message, connecting: false });
      return;
    }
    if (m.type === 'lobby') {
      this.room = m;
      this.notify({ room: m, trackId: this.trackId });
      if (m.phase === 'lobby') {
        this.phase = 'lobby';
        this.cars = m.players.map((p, i) => this.makeCar(p.id, p.name, i, p.color));
        this.party = createPartyState(undefined, this.trackId);
        this.motion.reset(this.cars);
        this.notify({ phase: 'lobby', paused: false });
      }
      return;
    }
    if (m.type === 'raceStart') {
      this.cars = clone(m.cars);
      this.pickups = clone(m.pickups);
      this.party = clone(m.party);
      this.phase = 'countdown';
      this.countdown = 3;
      this.elapsed = 0;
      this.sequence = 0;
      this.pending = [];
      this.paused = false;
      this.keys.clear();
      this.accumulator = 0;
      this.motion.reset(this.cars);
      this.world.resetCamera();
      this.ensureAudio();
      this.notify({ phase: 'countdown', paused: false });
      return;
    }
    if (m.type === 'snapshot') {
      this.elapsed = m.elapsed;
      this.countdown = m.countdown;
      if (this.phase !== m.phase) this.notify({ phase: m.phase });
      this.phase = m.phase;
      const incoming = clone(m.cars);
      this.motion.pushSnapshot(incoming, performance.now());
      this.pickups = clone(m.pickups);
      this.party = clone(m.party);
      const mine = incoming.find((c) => c.id === this.ownId);
      if (mine) {
        this.pending = this.pending.filter((p) => p.seq > mine.lastSeq);
        if (m.phase === 'racing') {
          for (let j = 0; j < this.pending.length; j++)
            stepCar(mine, this.pending[j].input, DT, m.elapsed + (j + 1) * DT, true, this.pickups);
          this.elapsed = m.elapsed + this.pending.length * DT;
        }
        this.motion.reconcile(
          this.cars.find((c) => c.id === this.ownId),
          mine,
        );
      }
      this.cars = incoming;
      return;
    }
    if (m.type === 'finished') {
      this.cars = clone(m.cars);
      this.motion.reset(this.cars);
      this.party = clone(m.party);
      this.elapsed = m.elapsed;
      this.phase = 'results';
      this.notify({ phase: 'results', paused: false });
    }
  }
  send(data) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(data));
  }
  disconnect() {
    if (this.socket) {
      const s = this.socket;
      this.socket = null;
      s.close();
    }
    this.pending = [];
    this.room = null;
  }
  setQuality(q) {
    this.quality = q;
    this.world?.setQuality(q);
  }
  ensureAudio() {
    if (!this.sound) return;
    try {
      if (!this.audio) {
        const context = new (window.AudioContext || window.webkitAudioContext)(),
          gain = context.createGain(),
          motor = context.createOscillator(),
          filter = context.createBiquadFilter();
        motor.type = 'sawtooth';
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        gain.gain.value = 0;
        motor.connect(filter).connect(gain).connect(context.destination);
        motor.start();
        this.audio = { context, gain, motor, filter };
      }
      this.audio.context.resume();
    } catch {}
  }
  setSound(value) {
    this.sound = value;
    if (value) this.ensureAudio();
    else if (this.audio)
      this.audio.gain.gain.setTargetAtTime(0, this.audio.context.currentTime, 0.05);
    this.notify({ sound: value });
  }
  updateAudio() {
    if (!this.audio) return;
    const { context, gain, motor, filter } = this.audio,
      c = this.cars.find((c) => c.id === this.ownId);
    const active = this.sound && ['racing', 'countdown'].includes(this.phase) && !this.paused;
    gain.gain.setTargetAtTime(
      active ? 0.012 + (c?.boosting ? 0.007 : 0) : 0,
      context.currentTime,
      0.08,
    );
    motor.frequency.setTargetAtTime(35 + Math.abs(c?.speed || 0) * 3.8, context.currentTime, 0.05);
    filter.frequency.setTargetAtTime(180 + Math.abs(c?.speed || 0) * 15, context.currentTime, 0.1);
  }
  dispose() {
    this.closed = true;
    cancelAnimationFrame(this.frame);
    this.disconnect();
    removeEventListener('keydown', this.keydown);
    removeEventListener('keyup', this.keyup);
    removeEventListener('blur', this.blur);
    this.audio?.context.close();
    this.world?.dispose();
  }
}
