import React, { useEffect, useRef, useState } from 'react';
import { getTrack, TRACK_OPTIONS, DEFAULT_TRACK_ID, LAPS } from '../shared/track.js';
import { ITEMS } from '../shared/party.js';
const COLORS = ['#d7fc70', '#8ad4ff', '#ff946c', '#c9abff', '#f0f1ec'];
const MAPS = Object.fromEntries(
  TRACK_OPTIONS.map(({ id }) => {
    const { samples } = getTrack(id),
      xs = samples.map((p) => p.x),
      zs = samples.map((p) => p.z);
    const x = Math.min(...xs) - 30,
      z = Math.min(...zs) - 30;
    return [
      id,
      {
        route: [...samples.filter((_, i) => i % 4 === 0), samples[0]]
          .map((p) => `${p.x},${p.z}`)
          .join(' '),
        viewBox: `${x} ${z} ${Math.max(...xs) - x + 30} ${Math.max(...zs) - z + 30}`,
      },
    ];
  }),
);
function CircuitPicker({ trackId, onSelect, disabled = false }) {
  return (
    <div className="circuit-picker" aria-label="Choose race circuit">
      {TRACK_OPTIONS.map((t) => (
        <button
          key={t.id}
          disabled={disabled}
          aria-pressed={trackId === t.id}
          onClick={() => onSelect(t.id)}
          style={{ '--circuit-accent': t.accent }}
        >
          <span>{t.number}</span>
          {t.name}
        </button>
      ))}
    </div>
  );
}
const time = (s) =>
  s == null ? '—' : `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
function Icon({ name, ...props }) {
  const paths = {
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    bolt: 'm14 2-9 12h6l-1 8 9-12h-6l1-8Z',
    close: 'm6 6 12 12M18 6 6 18',
    pause: 'M8 5v14M16 5v14',
    play: 'm8 5 11 7-11 7V5Z',
    volume: 'm11 5-6 4H2v6h3l6 4V5Zm4 3a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14',
    mute: 'm11 5-6 4H2v6h3l6 4V5Zm5 4 6 6m0-6-6 6',
    expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
    users:
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    flag: 'M5 22V3m0 0c5-5 9 5 14 0v11c-5 5-9-5-14 0',
    check: 'm5 12 4 4L19 6',
    settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
    key: 'M12 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-2 3 10 10m-4-4 3-3m-6 0 3-3',
    shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm-4 10 3 3 5-6',
    pulse:
      'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 6a8.5 8.5 0 0 0 0 12m12-12a8.5 8.5 0 0 1 0 12M3 3a13 13 0 0 0 0 18M21 3a13 13 0 0 1 0 18',
    trap: 'm12 3 10 17H2L12 3Zm0 6v5m0 3v.1',
    box: 'm12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10 9-5M12 12 3 7m9 5v10',
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.arrow} />
    </svg>
  );
}
function MiniMap({ cars = [], ownId, large = false, trackId }) {
  const track = getTrack(trackId),
    { gates } = track,
    { route, viewBox } = MAPS[track.id];
  return (
    <svg
      className={`minimap ${large ? 'large' : ''}`}
      viewBox={viewBox}
      aria-label={`${track.name} circuit map`}
    >
      <polyline
        points={route}
        fill="none"
        stroke="currentColor"
        strokeWidth="22"
        opacity=".09"
        strokeLinejoin="round"
      />
      <polyline
        points={route}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {gates
        .filter((g) => g.index === 0)
        .map((g) => (
          <path
            key={g.index}
            d={`M${g.x - g.tz * 17.4} ${g.z + g.tx * 17.4}L${g.x + g.tz * 17.4} ${g.z - g.tx * 17.4}`}
            stroke="#d7fc70"
            strokeWidth="7"
          />
        ))}
      {cars.map((c) => (
        <g key={c.id}>
          <circle
            cx={c.x}
            cy={c.z}
            r={c.id === ownId ? 9 : 6}
            fill={c.color}
            stroke="#10191e"
            strokeWidth="3"
          />
          {c.id === ownId && (
            <circle
              cx={c.x}
              cy={c.z}
              r="14"
              fill="none"
              stroke={c.color}
              strokeWidth="2"
              opacity=".5"
            />
          )}
        </g>
      ))}
    </svg>
  );
}
function Controls() {
  return (
    <div className="control-grid">
      {[
        ['W A S D', 'Drive · steer on ground / in air'],
        ['SHIFT', 'Tap: use stored boost · 10s'],
        ['E', 'Use held power-up · collect purple ? boxes'],
        ['SPACE', 'Tap to jump · tap again in air for a 360'],
        ['X + A / D', 'Hold to slide through corners · release to grip'],
        ['R', 'Hold to reverse'],
        ['F', 'Recover car · +3 seconds'],
        ['C', 'Change camera'],
        ['ESC', 'Pause / race menu'],
      ].map(([key, label]) => (
        <div key={key}>
          <kbd>{key}</kbd>
          <span>{label}</span>
        </div>
      ))}
      <p className="gamepad-note">
        Controller: RT / LT drive · left stick steer · A jump / tap again for 360 · B power-up · RB
        boost · LB drift · Y reverse · View / Select recover.
      </p>
    </div>
  );
}
function PartySlot({ own, elapsed, gamepad }) {
  const item = ITEMS[own?.item];
  const shield = Math.max(0, (own?.shieldUntil || 0) - elapsed);
  const emp = Math.max(0, (own?.empUntil || 0) - elapsed);
  const protection = Math.max(0, (own?.immuneUntil || 0) - elapsed);
  return (
    <div
      className={`party-slot ${item ? 'loaded' : ''}`}
      style={{ '--item-color': item?.color || '#ba96df' }}
    >
      <div className="party-slot-label">
        MYSTERY POWER-UP <span>1 SLOT</span>
      </div>
      <div className="party-slot-main">
        <div className="party-icon">
          <Icon name={item?.icon || 'box'} />
        </div>
        <div>
          <strong>{item?.name || 'FIND A BOX'}</strong>
          <p>{item ? 'READY TO USE' : 'PURPLE ? BOXES ON TRACK'}</p>
        </div>
        <kbd>{gamepad ? 'B' : 'E'}</kbd>
      </div>
      {item && (
        <p className="party-description">
          {own.item === 'emp' && !own.grounded ? 'Land to drop your trap' : item.hint}
        </p>
      )}
      {(shield > 0 || emp > 0 || protection > 0) && (
        <div className={`party-effect-status ${emp > 0 ? 'jammed' : ''}`}>
          <Icon name={shield > 0 ? 'shield' : emp > 0 ? 'trap' : 'shield'} />
          <span>
            {shield > 0 ? 'SHIELD ACTIVE' : emp > 0 ? 'EMP · BOOST PAUSED' : 'ATTACK PROTECTION'}
          </span>
          <b>{(shield || emp || protection).toFixed(1)}s</b>
        </div>
      )}
    </div>
  );
}
export default function App() {
  const viewport = useRef(null),
    engine = useRef(null);
  const [state, setState] = useState({
    trackId: DEFAULT_TRACK_ID,
    ready: false,
    progress: 0,
    phase: 'loading',
    hud: null,
    sound: false,
    paused: false,
    error: null,
    room: null,
    online: false,
    connecting: false,
  });
  const [panel, setPanel] = useState(null),
    [name, setName] = useState(() => {
      try {
        return localStorage.getItem('roadster-name') || 'DRIVER';
      } catch {
        return 'DRIVER';
      }
    }),
    [color, setColor] = useState(COLORS[0]),
    [code, setCode] = useState(''),
    [quality, setQuality] = useState('medium'),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    let game,
      cancelled = false;
    // Load the 3D runtime after the first screen, and only on the client.
    import('./game/engine.js')
      .then(({ RaceEngine }) => {
        if (cancelled) return;
        game = new RaceEngine(viewport.current, (patch) => setState((s) => ({ ...s, ...patch })));
        engine.current = game;
        game.init();
      })
      .catch(() => {
        if (!cancelled)
          setState((s) => ({ ...s, error: 'The game files could not load. Reload to try again.' }));
      });
    return () => {
      cancelled = true;
      game?.dispose();
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('roadster-name', name);
    } catch {}
  }, [name]);
  useEffect(() => {
    if (state.phase === 'lobby' || state.phase === 'countdown') setPanel(null);
  }, [state.phase]);
  const { phase, hud, room } = state,
    own = hud?.own,
    isRace = ['countdown', 'racing', 'results'].includes(phase),
    me = room?.players.find((p) => p.id === engine.current?.ownId),
    isHost = room?.host === engine.current?.ownId;
  const start = (practice) => {
    setPanel(null);
    engine.current.startLocal(practice, name.trim() || 'DRIVER', color);
  };
  const quit = () => {
    setPanel(null);
    engine.current.quit();
  };
  const openFriends = () => {
    setState((s) => ({ ...s, error: null }));
    setPanel('friends');
  };
  const connect = (action) => engine.current.connect(action, name.trim() || 'DRIVER', code);
  const fullScreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setState((s) => ({
        ...s,
        error: 'Your room code is ' + room.code + '. Share it with your friends.',
      }));
    }
  };
  const track = getTrack(state.trackId);
  const nextGate = own ? track.gates[own.nextGate] : null,
    distance = nextGate ? Math.round(Math.hypot(nextGate.x - own.x, nextGate.z - own.z)) : 0;
  return (
    <main
      className={`game-shell ${isRace ? 'in-race' : ''} ${phase === 'menu' ? 'home-screen' : ''} track-${track.id}`}
    >
      <div ref={viewport} className="world" />
      <div className="vignette" />
      {!state.ready && (
        <div className="loading-screen">
          <div className="brand">
            R<span>/</span>R
          </div>
          <p className="eyebrow">ROADSTER RUSH</p>
          <h1>{state.error ? 'Unable to start' : 'Preparing the grid.'}</h1>
          <p>{state.error || `${track.name} · Circuit ${track.number}`}</p>
          <div className="loading-track">
            <i style={{ width: state.progress + '%' }} />
          </div>
          {state.error ? (
            <button className="primary" onClick={() => location.reload()}>
              Try again <Icon name="arrow" />
            </button>
          ) : (
            <small>{Math.round(state.progress)}%</small>
          )}
        </div>
      )}
      {state.ready && (
        <>
          <header className="topbar">
            <button
              className="wordmark"
              onClick={() => {
                if (!isRace && phase !== 'lobby') setPanel(null);
              }}
              aria-label="Roadster Rush"
            >
              R<span>/</span>R <b>ROADSTER RUSH</b>
            </button>
            <div className="top-actions">
              {!isRace && (
                <span className="build-tag">
                  <i /> TWO CIRCUITS · BUILD 10
                </span>
              )}
              <button
                className="icon-button"
                title={state.sound ? 'Mute sound (M)' : 'Enable sound (M)'}
                aria-label={state.sound ? 'Mute sound' : 'Enable sound'}
                onClick={() => engine.current.setSound(!state.sound)}
              >
                <Icon name={state.sound ? 'volume' : 'mute'} />
              </button>
              <button
                className="icon-button"
                title="Fullscreen"
                aria-label="Fullscreen"
                onClick={fullScreen}
              >
                <Icon name="expand" />
              </button>
              {isRace ? (
                <button
                  className="icon-button"
                  aria-label="Open race menu"
                  onClick={() => engine.current.setPaused(!state.paused)}
                >
                  <Icon name="pause" />
                </button>
              ) : (
                <button
                  className="icon-button"
                  aria-label="Settings and controls"
                  onClick={() => setPanel('settings')}
                >
                  <Icon name="settings" />
                </button>
              )}
            </div>
          </header>
          {phase === 'menu' && (
            <>
              <div className="menu-shade" />
              <section className="hero">
                <p className="eyebrow">
                  <span className="accent-line" /> {track.name.toUpperCase()} / PARTY RACING
                </p>
                <h1>
                  ROADSTER
                  <br />
                  <em>RUSH.</em>
                </h1>
                <p className="hero-sub">
                  {track.id === 'starport'
                    ? 'From the factory to the launch pad.'
                    : 'The city is yours after dark.'}
                  <br />
                  Collect. Defend. Outrace your rivals.
                </p>
                <div className="driver-row">
                  <label className="name-label">
                    <span>YOUR CALLSIGN</span>
                    <input
                      aria-label="Driver name"
                      maxLength={18}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="off"
                      spellCheck="false"
                    />
                  </label>
                  <div className="colors" aria-label="Car accent color">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        aria-label={
                          'Select ' +
                          {
                            '#d7fc70': 'lime',
                            '#8ad4ff': 'blue',
                            '#ff946c': 'orange',
                            '#c9abff': 'violet',
                            '#f0f1ec': 'silver',
                          }[c]
                        }
                        aria-pressed={c === color}
                        style={{ '--swatch': c }}
                        onClick={() => {
                          setColor(c);
                          engine.current.color = c;
                          const car = engine.current.cars.find((c) => c.id === 'you');
                          if (car) car.color = c;
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="compact-circuit-picker">
                  <CircuitPicker
                    trackId={track.id}
                    onSelect={(id) => engine.current.selectTrack(id)}
                  />
                </div>
                <div className="play-actions">
                  <button className="primary start" onClick={() => start(false)}>
                    START RACE <Icon name="arrow" />
                  </button>
                  <button className="secondary" onClick={() => start(true)}>
                    PRACTICE
                  </button>
                  <button className="friends-button" onClick={openFriends}>
                    <Icon name="users" /> RACE WITH FRIENDS <span>2–4</span>
                  </button>
                </div>
                <p className="menu-hint">{track.name} · 3 rivals. 3 laps.</p>
              </section>
              <aside className="track-card">
                <div className="track-card-header">
                  <span className="eyebrow">CHOOSE YOUR CIRCUIT</span>
                  <span>{track.number} / 02</span>
                </div>
                <CircuitPicker
                  trackId={track.id}
                  onSelect={(id) => engine.current.selectTrack(id)}
                />
                <div className="track-details">
                  <div>
                    <p className="circuit-tag">{track.tag}</p>
                    <h2>
                      {track.name.split(' ').map((word, i) => (
                        <React.Fragment key={word}>
                          {i > 0 && <br />}
                          {word.toUpperCase()}
                        </React.Fragment>
                      ))}
                    </h2>
                  </div>
                  <MiniMap large trackId={track.id} />
                </div>
                <p className="circuit-description">{track.description}</p>
                <div className="track-facts">
                  <span>
                    <strong>{(track.TRACK_LENGTH / 1000).toFixed(2)}</strong> KM
                  </span>
                  <span>
                    <strong>03</strong> LAPS
                  </span>
                  <span>
                    <strong>04</strong> DRIVERS
                  </span>
                </div>
              </aside>
              <footer className="menu-footer">
                <span>
                  DESKTOP BROWSER EDITION <i>•</i> KEYBOARD + CONTROLLER
                </span>
                <button onClick={() => setPanel('controls')}>
                  <Icon name="key" /> HOW TO PLAY <span>↗</span>
                </button>
              </footer>
            </>
          )}
          {phase === 'lobby' && room && (
            <div className="overlay lobby-overlay">
              <section className="panel lobby-panel">
                <div className="panel-head">
                  <p className="eyebrow">PRIVATE GRID · {track.name.toUpperCase()}</p>
                  <button className="icon-button" aria-label="Leave room" onClick={quit}>
                    <Icon name="close" />
                  </button>
                </div>
                <h2>
                  Get the crew
                  <br />
                  <em>on the grid.</em>
                </h2>
                <div className="room-code">
                  <div>
                    <span>SHARE YOUR ROOM CODE</span>
                    <strong>{room.code}</strong>
                  </div>
                  <button className="secondary small" onClick={copyCode}>
                    {copied ? 'COPIED' : 'COPY CODE'}
                  </button>
                </div>
                <CircuitPicker
                  trackId={track.id}
                  disabled={!isHost}
                  onSelect={(id) => engine.current.send({ type: 'track', trackId: id })}
                />
                <p className="muted">
                  {isHost
                    ? 'Choose a circuit before everyone readies up.'
                    : 'The host chooses the circuit for everyone.'}
                </p>
                <div className="lobby-list">
                  {Array.from({ length: 4 }, (_, i) => {
                    const p = room.players[i];
                    return (
                      <div className="lobby-driver" key={p?.id || i}>
                        <span className="seat">0{i + 1}</span>
                        <i style={{ background: p?.color || '#526068' }} />
                        <strong>
                          {p?.name || 'Waiting for driver…'}
                          {p?.id === me?.id && <small>YOU</small>}
                        </strong>
                        <span className={p?.ready ? 'ready' : 'waiting'}>
                          {p
                            ? p.ready
                              ? 'READY'
                              : p.id === room.host
                                ? 'HOST'
                                : 'NOT READY'
                            : 'OPEN'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="muted">
                  Everyone must be ready. The host starts the race once at least two drivers have
                  joined.
                </p>
                <div className="panel-actions">
                  <button
                    className={me?.ready ? 'secondary' : 'primary'}
                    onClick={() => engine.current.send({ type: 'ready', ready: !me?.ready })}
                  >
                    {me?.ready ? 'NOT READY' : 'I’M READY'} <Icon name="check" />
                  </button>
                  {isHost && (
                    <button
                      className="primary"
                      disabled={room.players.length < 2 || !room.players.every((p) => p.ready)}
                      onClick={() => engine.current.send({ type: 'start' })}
                    >
                      START RACE <Icon name="arrow" />
                    </button>
                  )}
                </div>
              </section>
            </div>
          )}
          {isRace && hud && (
            <div className="race-hud">
              <div className="race-top">
                <div className="position-block">
                  <span>POSITION</span>
                  <strong>
                    {hud.position || 1}
                    <small> / {hud.cars.length}</small>
                  </strong>
                </div>
                <div className="lap-block">
                  <span>LAP</span>
                  <strong>
                    {Math.min(own?.lap || 1, LAPS)}
                    <small> / {LAPS}</small>
                  </strong>
                </div>
                <div className="time-block">
                  <span>RACE TIME</span>
                  <strong>{time(own?.finishTime ?? hud.elapsed)}</strong>
                  <small>BEST LAP {time(own?.bestLap)}</small>
                </div>
              </div>
              <div className="race-standing">
                {hud.ordered.map((c, i) => (
                  <div key={c.id} className={c.id === own?.id ? 'current' : ''}>
                    <span>{i + 1}</span>
                    <i style={{ background: c.color }} />
                    <strong>{c.name}</strong>
                    {c.finishTime !== null ? (
                      <Icon name="flag" />
                    ) : (
                      <small>{c.id === own?.id ? 'YOU' : state.online ? 'LIVE' : 'CPU'}</small>
                    )}
                  </div>
                ))}
              </div>
              <div className="race-map">
                <p>
                  {track.name.toUpperCase()} <span>{track.number}</span>
                </p>
                <MiniMap cars={hud.cars} ownId={own?.id} trackId={track.id} />
                <div>
                  <i className="status-dot" />
                  {state.online
                    ? 'ONLINE RACE'
                    : hud.cars.length === 1
                      ? 'PRACTICE SESSION'
                      : 'PARTY RACE'}
                </div>
              </div>
              <div className="race-center-message" aria-live="polite">
                {own?.finishTime != null && phase === 'racing' ? (
                  <strong>FINISHED · WAITING FOR THE GRID</strong>
                ) : own?.offroad ? (
                  <strong className="warning">
                    OFF TRACK · {own.boosting ? 'BOOST ASSIST' : 'LOW GRIP'} · STEER BACK TO THE
                    ROAD
                  </strong>
                ) : own?.wrongWay ? (
                  <strong className="warning">WRONG WAY</strong>
                ) : own?.partyEventUntil > hud.elapsed ? (
                  <strong
                    className={
                      own.partyEvent.includes('HIT') && !own.partyEvent.includes('RIVAL')
                        ? 'warning'
                        : 'party-message'
                    }
                  >
                    {own.partyEvent}
                  </strong>
                ) : own?.eventTTL > 0 ? (
                  <strong className={own.event.includes('HIT') ? 'warning' : ''}>
                    {own.event}
                  </strong>
                ) : null}
              </div>
              <div className="next-gate">
                <span>NEXT CHECKPOINT</span>
                <strong>
                  {String(own?.nextGate || 0).padStart(2, '0')} <i>↗</i> <small>{distance} m</small>
                </strong>
              </div>
              <div className="telemetry">
                <div className="speed">
                  <strong>
                    {Math.round(Math.abs(own?.speed || 0) * 3.6)
                      .toString()
                      .padStart(3, '0')}
                  </strong>
                  <div>
                    <span>KM/H</span>
                    <b>
                      {own?.offroad
                        ? 'OFF TRACK'
                        : own?.speed < -0.1
                          ? 'REVERSE'
                          : own?.boosting
                            ? own?.drifting
                              ? 'BOOST DRIFT'
                              : 'THRUST'
                            : own?.drifting
                              ? 'DRIFTING'
                              : own?.grounded
                                ? 'DRIVE'
                                : 'AIRBORNE'}
                    </b>
                  </div>
                </div>
                <div className="speed-track">
                  <i
                    style={{ width: `${Math.min(100, (Math.abs(own?.speed || 0) / 72) * 100)}%` }}
                  />
                </div>
                <div className={`boost-stock ${own?.boostTime > 0 ? 'active' : ''}`}>
                  <div className="boost-caption">
                    <span>
                      <Icon name="bolt" /> BOOST CANISTERS
                    </span>
                    <strong>
                      {own?.boostTime > 0
                        ? `${own.boostTime.toFixed(1)}s`
                        : `${own?.boosts || 0} / 3`}
                    </strong>
                  </div>
                  <div className="boost-slots">
                    {[0, 1, 2].map((i) => (
                      <i key={i} className={i < (own?.boosts || 0) ? 'filled' : ''} />
                    ))}
                    <span>
                      <kbd>{hud.gamepad ? 'RB' : 'SHIFT'}</kbd>{' '}
                      {own?.boostTime > 0
                        ? own.empUntil > hud.elapsed
                          ? 'EMP PAUSED'
                          : 'ACTIVE'
                        : own?.boosts
                          ? 'ACTIVATE · 10s'
                          : 'COLLECT TO CHARGE'}
                    </span>
                  </div>
                  {own?.boostTime > 0 && (
                    <div className="boost-timer">
                      <i style={{ width: `${own.boostTime * 10}%` }} />
                    </div>
                  )}
                </div>
                <PartySlot own={own} elapsed={hud.elapsed} gamepad={hud.gamepad} />
                <div className="charge-label">
                  <span>
                    <Icon name="bolt" /> JUMP RESERVE
                  </span>
                  <strong>
                    {Math.round(own?.charge || 0)}
                    <small>%</small>
                  </strong>
                </div>
                <div className={`charge-track ${own?.charge < 24 ? 'low' : ''}`}>
                  <i style={{ width: `${own?.charge || 0}%` }} />
                </div>
                <div className="ability-status">
                  <span
                    className={
                      own?.grounded && own?.charge >= 24 && own?.jumpCooldown <= 0
                        ? 'available'
                        : ''
                    }
                  >
                    <kbd>{hud.gamepad ? 'A' : 'SPACE'}</kbd> JUMP {own?.jumpCooldown > 0 ? '↻' : ''}
                  </span>
                  <span
                    className={
                      !own?.grounded && own?.charge >= 6 && !own?.rollActive && !own?.rollDone
                        ? 'available'
                        : ''
                    }
                  >
                    <kbd>{hud.gamepad ? 'A' : 'SPACE'}</kbd>{' '}
                    {own?.rollActive ? '360 ACTIVE' : 'AGAIN · 360'}
                  </span>
                </div>
              </div>
              <div className="race-controls">
                {hud.gamepad ? (
                  <span>CONTROLLER CONNECTED</span>
                ) : (
                  <>
                    <span>
                      <kbd>WASD</kbd> DRIVE
                    </span>
                    <span>
                      <kbd>SHIFT</kbd> BOOST
                    </span>
                    <span>
                      <kbd>E</kbd> POWER-UP
                    </span>
                    <span>
                      <kbd>X</kbd> DRIFT
                    </span>
                    <span>
                      <kbd>R</kbd> REVERSE
                    </span>
                    <span>
                      <kbd>F</kbd> RECOVER
                    </span>
                    <span>
                      <kbd>C</kbd> CAMERA
                    </span>
                  </>
                )}
              </div>
              {phase === 'countdown' && (
                <div className="countdown">
                  <span>GET READY</span>
                  <strong key={Math.ceil(hud.countdown)}>
                    {Math.max(1, Math.ceil(hud.countdown))}
                  </strong>
                  <p>
                    {state.online ? 'Race your crew.' : 'Find your line.'} Jump early. Land clean.
                  </p>
                </div>
              )}
              {phase === 'racing' && hud.elapsed < 1 && (
                <div className="countdown go">
                  <strong>GO.</strong>
                </div>
              )}
            </div>
          )}
          {state.paused && phase !== 'results' && (
            <div className="overlay">
              <section className="panel pause-panel">
                <p className="eyebrow">TAKE A BREATH</p>
                <h2>{state.online ? 'Race menu.' : 'Paused.'}</h2>
                {state.online && (
                  <p className="muted">The online race continues while this menu is open.</p>
                )}
                <Controls />
                <div className="panel-actions">
                  <button className="primary" onClick={() => engine.current.setPaused(false)}>
                    RESUME <Icon name="play" />
                  </button>
                  {!state.online && (
                    <button className="secondary" onClick={() => start(engine.current.practice)}>
                      RESTART
                    </button>
                  )}
                  <button className="text-button" onClick={quit}>
                    LEAVE RACE
                  </button>
                </div>
              </section>
            </div>
          )}
          {phase === 'results' && hud && (
            <div className="overlay">
              <section className="panel results-panel">
                <p className="eyebrow">{track.name.toUpperCase()} · SESSION COMPLETE</p>
                <h2>
                  {own?.finishTime === null
                    ? 'Time’s up.'
                    : hud.position === 1
                      ? 'First over the line.'
                      : 'Made it count.'}
                </h2>
                <div className="result-stats">
                  <div>
                    <span>RACE TIME</span>
                    <strong>{time(own?.finishTime)}</strong>
                    {own?.penalty > 0 && <small>Includes {own.penalty}s recovery penalty</small>}
                  </div>
                  <div>
                    <span>BEST LAP</span>
                    <strong>{time(own?.bestLap)}</strong>
                  </div>
                  <div>
                    <span>360s LANDED</span>
                    <strong>{own?.stunts || 0}</strong>
                  </div>
                </div>
                <p className="party-results">
                  <strong>{own?.itemsUsed || 0}</strong> ITEMS USED <span>·</span>{' '}
                  <strong>{own?.partyHits || 0}</strong> RIVALS HIT <span>·</span>{' '}
                  <strong>{own?.shieldBlocks || 0}</strong> ATTACKS BLOCKED
                </p>
                <div className="result-table">
                  {hud.ordered.map((c, i) => (
                    <div key={c.id} className={c.id === own?.id ? 'current' : ''}>
                      <b>{String(i + 1).padStart(2, '0')}</b>
                      <i style={{ background: c.color }} />
                      <strong>{c.name}</strong>
                      <span>
                        {c.finishTime === null
                          ? state.online
                            ? 'DNF'
                            : 'ON TRACK'
                          : time(c.finishTime)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="panel-actions">
                  {!state.online ? (
                    <button className="primary" onClick={() => start(engine.current.practice)}>
                      RACE AGAIN <Icon name="arrow" />
                    </button>
                  ) : isHost ? (
                    <button
                      className="primary"
                      onClick={() => engine.current.send({ type: 'rematch' })}
                    >
                      BACK TO LOBBY <Icon name="users" />
                    </button>
                  ) : (
                    <p className="muted">Waiting for the host to set up a rematch.</p>
                  )}
                  <button className="secondary" onClick={quit}>
                    MAIN MENU
                  </button>
                </div>
              </section>
            </div>
          )}
          {panel && (
            <div className="overlay">
              <section className={`panel ${panel === 'friends' ? 'friends-panel' : ''}`}>
                <div className="panel-head">
                  <p className="eyebrow">ROADSTER RUSH</p>
                  <button
                    className="icon-button"
                    aria-label="Close panel"
                    disabled={state.connecting}
                    onClick={() => setPanel(null)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
                {panel === 'friends' ? (
                  <>
                    <h2>
                      Better
                      <br />
                      <em>with rivals.</em>
                    </h2>
                    <p className="muted">
                      Create a private room and share its code, or join your friends on the grid. Up
                      to four drivers. Your room starts on {track.name}; guests load the same
                      circuit automatically.
                    </p>
                    <label className="field">
                      <span>YOUR CALLSIGN</span>
                      <input
                        maxLength={18}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <button
                      className="primary full"
                      disabled={state.connecting}
                      onClick={() => connect('create')}
                    >
                      {state.connecting ? 'CONNECTING…' : 'CREATE ROOM'} <Icon name="users" />
                    </button>
                    <div className="divider">
                      <span>OR JOIN A ROOM</span>
                    </div>
                    <form
                      className="join-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        connect('join');
                      }}
                    >
                      <input
                        aria-label="Room code"
                        placeholder="ROOM CODE"
                        maxLength={5}
                        value={code}
                        onChange={(e) =>
                          setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, ''))
                        }
                        autoComplete="off"
                      />
                      <button
                        className="secondary"
                        disabled={code.length !== 5 || state.connecting}
                      >
                        JOIN <Icon name="arrow" />
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <h2>{panel === 'controls' ? 'Find your flow.' : 'Make it yours.'}</h2>
                    {panel === 'settings' && (
                      <div className="settings">
                        <label>
                          Graphics
                          <select
                            value={quality}
                            onChange={(e) => {
                              setQuality(e.target.value);
                              engine.current.setQuality(e.target.value);
                            }}
                          >
                            <option value="high">High · full scenery + glow</option>
                            <option value="medium">Balanced · smooth motion + scenery</option>
                            <option value="low">Low · smoother on laptops</option>
                          </select>
                        </label>
                        <label>
                          Motor audio
                          <button
                            className="secondary small"
                            onClick={() => engine.current.setSound(!state.sound)}
                          >
                            {state.sound ? 'ON' : 'OFF'}
                          </button>
                        </label>
                      </div>
                    )}
                    <Controls />
                    <div className="tip">
                      <Icon name="bolt" />
                      <p>
                        Tap Space to jump, release it, then tap Space again in the air for a 360. A
                        clean stunt landing restores jump charge. Collect blue canisters on the
                        road, then tap Shift for a 10-second boost. Hold X while steering to drift;
                        release X to regain grip. Use A / D to steer in the air. Off track, drive or
                        reverse slowly back onto the road. Boost gives a little extra speed. F is an
                        optional recovery shortcut. Purple mystery boxes hold shields, shockwaves
                        and EMP traps. Press E (controller B) to use your item. Jump over orange
                        traps or block them with a shield.
                      </p>
                    </div>
                    <button className="primary full" onClick={() => setPanel(null)}>
                      GOT IT <Icon name="check" />
                    </button>
                  </>
                )}
              </section>
            </div>
          )}
          {state.error && (
            <div role="alert" className="toast">
              <span>{state.error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setState((s) => ({ ...s, error: null }))}
              >
                <Icon name="close" />
              </button>
            </div>
          )}
          <div className="small-screen-note">
            Best played on desktop with a keyboard or controller.
          </div>
        </>
      )}
    </main>
  );
}
