# Build log

A dated record of the physical build. The firmware and simulation have unit tests. This log records what they cannot show: how the model behaves on a real floor, with real motors and a real battery. Photos go in `media/build/`.

The chassis decision is already made: a two-wheel microcontroller build, chosen in October 2026 over a discrete-transistor replica with Walter's steering column. The reasons were cost, repeatability and the fact that the behaviour I care about lives in the control loop, which a Nano runs faithfully.

---

## Template

Copy this block per session.

### YYYY-MM-DD — short title

- **Did:** what I built or changed.
- **Parts:** anything that differs from [`hardware/BOM.md`](hardware/BOM.md).
- **Firmware:** commit / `config.h` values used.
- **Saw:** behaviour on the floor — modes reached, what worked, what did not.
- **Measured:** revolution time, run length, light raw dark/bright, pack voltage.
- **Next:** the one thing to fix.
- **Photo:** `media/build/YYYY-MM-DD-*.jpg`

---

## Log

### 2026-10-?? — decision

Chose the two-wheel microcontroller build. Ordered the reference parts in [`hardware/BOM.md`](hardware/BOM.md).

<!--
### 2026-11-?? — chassis and drive
- Did:
- Parts:
- Firmware:
- Saw:
- Measured: revolution ___ ms (set REVOLUTION_MS), straight run ___ ms (set RUN_MS)
- Next:
- Photo:

### 2026-11-?? — photocell and shroud
- Did:
- Measured: LIGHT_RAW_DARK ___, LIGHT_RAW_BRIGHT ___
- Saw: Scan -> Lock transition at roughly ___ from a 40 W-equivalent lamp
- Next:

### 2026-11-?? — shell contact
- Did:
- Saw: Contact mode butts clear of a wall? y/n
- Next:

### 2026-11-?? — hutch and homing
- Did: built the charging hutch with its lamp
- Saw: does a flagging battery pull it home? at what pack voltage?
- Next:
-->
