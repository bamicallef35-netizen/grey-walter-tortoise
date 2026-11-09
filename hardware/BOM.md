# Bill of materials — the reference build

A two-wheel *Machina speculatrix* for roughly **£35–45** in parts. These are the reference choices the firmware and [`config.h`](../firmware/tortoise/config.h) assume. Swap freely; change the pins in `config.h` to match your wiring. Prices are rough UK retail as of late 2026, before postage.

> This is the reference build, not a parts list I can promise matches yours. Put what you actually bought — motors, driver, cells, chassis — in [`BUILD_LOG.md`](../BUILD_LOG.md), and correct the pins and calibration here to suit.

## Parts

| Part | Suggested item | Qty | ~£ | Notes |
|------|----------------|-----|----|-------|
| Microcontroller | Arduino Nano (ATmega328P), genuine or clone | 1 | 4–12 | Any 5 V AVR board; clones are fine for a toy |
| Motor driver | TB6612FNG breakout | 1 | 5 | Two channels, 5 V logic, far cheaper and cooler than an L298N |
| Gear motors | N20 micro metal gearmotor, 6 V, ~150–220 rpm | 2 | 7 | Slow suits Walter; higher ratio = more torque, less speed |
| Wheels | N20-hub wheels (~42 mm) | 2 | 3 | Match the N20 D-shaft |
| Castor | Ball castor or a PTFE slider | 1 | 2 | The third point; a smooth caster keeps the heading straight |
| Light sensor | LDR (GL5528) + 10 kΩ resistor | 1 | 0.50 | Divider: 5 V — LDR — A0 — 10 kΩ — GND, so brighter reads higher |
| Shroud | Black heat-shrink or a short tube | 1 | 0.50 | Over the LDR, pointing forward, so it sees a narrow cone like Walter's photocell |
| Shell contact | Microswitch with a long lever, or a foil ring | 1 | 1 | Closes to GND when the shell is pushed off centre |
| Battery | 2× 18650 Li-ion + 2S holder | 1 set | 10 | Or 1× 18650 + an MT3608 boost; keep the pack voltage inside `config.h` |
| Pilot lamp | Warm-white 3 mm LED + 220 Ω | 1 | 0.30 | On the shell; this is the lamp that makes the mirror trick work |
| Chassis | 3D print, 3 mm acrylic, or foamboard | 1 | 0–5 | A flat deck plus a dome for the shell is enough |
| Wiring | Dupont leads, standoffs, a power switch | — | 4 | — |

## Wiring (to `config.h`)

| Signal | Pin | `config.h` |
|--------|-----|------------|
| Light divider | A0 | `PIN_LIGHT` |
| Battery divider (10 k / 10 k) | A1 | `PIN_BATTERY`, `BATTERY_DIVIDER 2.0` |
| Shell contact to GND | D2 | `PIN_SHELL` |
| Driver standby | D4 | `PIN_STBY` |
| Left motor (A) | D7, D8, D5 | `PIN_AIN1/2`, `PIN_PWMA` |
| Right motor (B) | D9, D10, D6 | `PIN_BIN1/2`, `PIN_PWMB` |
| Pilot LED | D3 | `PIN_PILOT` |
| Charger sense (optional) | — | `PIN_CHARGING -1` to disable |

If a wheel runs backwards, set `LEFT_REVERSED` or `RIGHT_REVERSED` to 1 instead of re-soldering.

## The shell

Walter's shell was the whole point of the touch sense: the dome floated on a single central contact so a push from any direction closed it. The cheap version is a dome resting on a springy standoff that presses one lever microswitch, which gives you "touched / not touched" without the full floating gimbal. A ring of foil that meets a second ring when the shell tips does the same for pennies. Either way the firmware only reads a single `contact` bit, so start simple.

## Battery safety

2S Li-ion is 8.4 V full, 6.0 V flat. Use cells with a protection board, or a 2S protection module, and do not run the pack below about 6.4 V (3.2 V a cell). The model's `v_empty` is 6.8 V, which keeps a margin. Charge with a proper 2S balance charger, never a bench supply left unattended.

## Calibrate once

Set `CALIBRATE 1` in `config.h`, open the serial monitor at 115200, and read the raw light value in your room's dark corner and with a lamp about 20 cm from the shroud. Put those in `LIGHT_RAW_DARK` and `LIGHT_RAW_BRIGHT`, then set `CALIBRATE 0`. The behaviour depends on this: the thresholds are on a normalised 0–1 scale, and calibration is what maps your room onto it.
