# Digi Smash

A Super Smash Bros-style platform fighter starring Digimon, playable in the browser.
Fight the CPU, share one keyboard, or **send a link to a friend and play online**.

## Play online with a friend

1. Open the game and click **Play Online**.
2. Copy the link it gives you (`…/#join=abc123`) and send it to your friend.
3. When they open it you're both dropped into character select. The host picks the stage and starts the fight.

Online play is peer-to-peer over WebRTC ([PeerJS](https://peerjs.com/)). The free PeerJS broker
is only used to introduce the two browsers; game data flows directly between you. The host runs
the simulation and streams it to the guest (~85 KB/s), so the guest's input delay is one
round-trip. The ping is shown in the top-left corner.

## The roster

| Rookie  | Digivolves into | Style |
|---------|-----------------|-------|
| Agumon  | Greymon   | All-rounder: Pepper Breath fireballs, fiery recovery |
| Gabumon | Garurumon | Fast: freezing Blue Blaster, Pelt Counter |
| Patamon | Angemon   | Floaty, five jumps, Boom Bubble pushback |
| Guilmon | Growlmon  | Heavy hitter: arcing Pyro Sphere, Rock Breaker |

## Mechanics

- **Damage % and knockback**: the more damage you have, the further you fly. Get launched past the blast zone and you lose a stock.
- **Digivolve**: dealing and taking damage fills the DIGI meter. When it's full, press Digivolve to become your Champion for 15 seconds. You get a bigger body, harder hits and a whole new set of specials. The transformation also blasts nearby opponents away.
- **Smash attacks** (direction + attack on the ground; hold to charge), aerials (down-air spikes), jab combos, dash attacks.
- **Specials**: neutral / side / up (recovery) / down for every form, including projectiles, beams, dashes, slams and a counter.
- **Shield, roll, spot dodge, air dodge, grabs and throws, ledge grabbing, platform drop-through, fast fall, teching.**
- **Items**: Digi-Meat heals 25%. Data Chips fill your DIGI meter or extend your Champion time.
- **Stages**: File Island, Infinity Mountain and Primary Village (flat).

## Controls

| Action | Online / vs CPU | Local P1 | Local P2 | Gamepad |
|---|---|---|---|---|
| Move | WASD / arrows | WASD | arrows | stick / D-pad |
| Jump | Space, W, ↑ | W / Space | ↑ | X / Y |
| Attack | J / Z | F | `.` / Num1 | A |
| Special | K / X | G | `/` / Num2 | B |
| Shield | L / C / Shift | H | Right Shift / Num3 | RB / triggers |
| Digivolve | I / V | T | Enter / Num0 | LB |

Pause with Esc. On a gamepad, the right stick does smash attacks.

## Running locally

It's a static site with no build step. ES modules need to be served over HTTP:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Run the headless simulation tests (CPU vs CPU on every stage) with `npm test`.

## Hosting

`.github/workflows/pages.yml` runs the tests and publishes the default branch to GitHub Pages.
Enable it once under **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Code map

| File | What it does |
|---|---|
| `js/engine.js` | Deterministic 60 Hz simulation (physics, moves, hits, ledges, items) with plain-JSON state |
| `js/data.js` | Characters, forms, move frame data, stages |
| `js/ai.js` | CPU opponent |
| `js/render.js` | Canvas renderer, camera, effects, HUD |
| `js/sprites.js` | Procedurally drawn Digimon (no image assets) |
| `js/net.js` | PeerJS wrapper |
| `js/input.js` | Keyboard and gamepad mapping |
| `js/audio.js` | WebAudio synth sound effects |
| `js/main.js` | Menus, game loop, online host/guest flow |

Digimon is © Bandai / Toei Animation. This is a non-commercial fan project.
