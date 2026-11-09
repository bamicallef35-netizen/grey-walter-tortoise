# Walter's circuit, as a state machine

This maps the behaviour of W. Grey Walter's *Machina speculatrix* onto the six modes in [`firmware/tortoise/speculatrix.h`](firmware/tortoise/speculatrix.h). It is a reading of Walter's own account, not a transistor-level copy of his wiring. Where the model makes a choice Walter's electronics made for him, I say so.

## What Walter built

The tortoise had two receptors and two effectors. One photocell rode on the front column and turned with the steering. One contact closed when the shell was pushed against anything. One motor drove, one motor steered and swung the photocell around. Between them sat two valves — Walter's "two functional elements, two cells" — wired so that the state of the receptors set the state of the motors through a short feedback path. He called the species *speculatrix*, the machine that looks, because the defining act is the ceaseless scanning of the photocell across the room.

The behaviour comes out of three facts about that circuit:

1. The photocell is coupled through a capacitor, so the first valve answers *changes* in light far more strongly than steady light.
2. One relay closes on any light and stops the scanning; a second relay opens on *strong* light and restarts it, so moderate light attracts and fierce light repels.
3. Touching the shell converts the amplifier into an oscillator. While it rings, the light response is swamped and the machine butts its way past the obstacle.

## The modes

| Mode | What the circuit is doing | Drive | Steer | Pilot lamp |
|------|---------------------------|-------|-------|------------|
| **Scan** | Darkness. Nothing trips the light relay, so the steering motor turns the photocell continuously and the machine quarters the floor looking for a source. | half | full | on |
| **Glimpse** | A faint rise in light. The capacitor-coupled first valve reacts to the *change* and the scan pauses for a moment, long enough to see whether the source holds. | full | none | off |
| **Lock** | Moderate light. The light relay has closed: scanning stops and the machine drives straight at the source — positive phototropism. | full | none | off |
| **Dazzle** | Strong light. The second relay opens and the steering restarts at half effort, so the machine swings away from the glare. | full | half | off |
| **Contact** | The shell is displaced. The amplifier free-runs as a multivibrator, and the motors alternate a hard steer with a gentle push, then a hard push with a gentle steer, working the body around whatever it hit. Light is ignored while this lasts. | alternates | alternates | — |
| **Docked** | On the hutch charger with a flat battery. The machine rests until the pack recovers, then leaves. | rest | rest | off |

Two mechanisms do the interesting work.

**The pilot lamp and the mirror.** A small lamp sits on the shell, wired to light only while the machine scans in the dark. A second tortoise, or the machine's own reflection, therefore sees a light that goes out the instant it is approached — the source steps toward it, the pilot cuts, it loses the source, the pilot returns. Walter watched this produce a halting, flickering "dance" in front of a mirror and used it to argue for a minimal kind of self-recognition. In the model the pilot flag is exactly this: on in Scan and Glimpse, off whenever light has been found.

**The flat-battery homing.** The dazzle threshold is not fixed. It rides on battery voltage, so a well-charged machine turns away from the bright hutch lamp while a tired one is drawn to it. The tortoise finds its way home because running low *changes what bright means*. In [`speculatrix.cpp`](firmware/tortoise/speculatrix.cpp) this is `dazzleThreshold()`, interpolating between `dazzle_full` and `dazzle_empty` by state of charge.

## Where the model departs from the circuit

**Glimpse is a discretisation.** Walter's capacitor gives a continuous transient; the model stands in for it with a running light baseline and a fixed hold time (`glimpse_ms`). The shape is right, the mechanism is a numerical stand-in.

**The thresholds are tuned, not measured.** `lock_level`, the two dazzle thresholds and the contact periods are set to give behaviour that matches Walter's descriptions and photographs. They are not read off his schematics, which give component values and no normalised light scale.

**Explorer is mine.** On a two-wheel body with a fixed photocell, a pure scan turns on the spot and goes nowhere, because the photocell no longer sweeps independently of the wheels. `Explorer` adds a short straight run after each full scan to restore the travel Walter got for free from his front-wheel drive. It is off for the "1949 tricycle" body and labelled as an adaptation wherever it appears.

## Sources

- W. Grey Walter, *The Living Brain* (Duckworth, 1953), appendix "The Design of *M. speculatrix*". Transcribed at [joostrekveld.net/?p=192](http://www.joostrekveld.net/?p=192).
- W. Grey Walter, "An Imitation of Life", *Scientific American*, May 1950.
- W. Grey Walter, "A Machine That Learns", *Scientific American*, August 1951.

Walter built Elmer and Elsie in 1948–49 at the Burden Neurological Institute in Bristol, demonstrated them by the end of 1949, and showed later machines at the 1951 Festival of Britain.
