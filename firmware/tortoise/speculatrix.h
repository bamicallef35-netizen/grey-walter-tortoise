// speculatrix.h — the behavioural core of Machina speculatrix.
//
// A plain C++ model of W. Grey Walter's 1949 tortoise "brain": two
// receptors (one photocell, one shell contact), two effectors (drive and
// steering), and the relay logic that couples them. No Arduino headers,
// no heap, no STL, so the same file builds on an 8-bit AVR and on a
// laptop for unit tests.
//
// Walter's circuit, as he describes it in the appendix to The Living
// Brain (1953), maps onto five modes:
//
//   Scan     dark: steering rotates continuously, drive at half speed
//   Glimpse  a faint light appears: scanning pauses for a moment
//   Lock     moderate light: steering stops, drive at full speed
//   Dazzle   intense light: steering restarts at half speed, full drive
//   Contact  shell displaced: the amplifier becomes an oscillator and
//            the motors alternate "steer hard, push gently" (1/3 of the
//            cycle) with "push hard, steer gently" (2/3)
//
// plus a sixth, Docked, for the hutch: the machine rests on its charger
// until the battery recovers. See BEHAVIOUR.md for the derivation.

#pragma once

#include <stdint.h>

namespace speculatrix {

enum class Mode : uint8_t { Scan, Glimpse, Lock, Dazzle, Contact, Docked };

const char* modeName(Mode m);

struct Params {
  // Light, on a normalised 0..1 photocell scale.
  float glimpse_delta;    // rise above the light baseline that halts scanning
  float glimpse_ms;       // how long one glimpse holds the scan
  float baseline_tau_ms;  // baseline time constant (Walter's coupling capacitor)
  float lock_level;       // moderate light: stop scanning, full drive
  float dazzle_full;      // dazzle threshold with a full battery
  float dazzle_empty;     // dazzle threshold with a flat battery

  // Shell-contact oscillator.
  float contact_period_dark_ms;  // leisurely in the dark
  float contact_period_lit_ms;   // hasty near light
  float contact_hold_ms;         // keep oscillating after the shell recentres

  // Battery, in volts.
  float v_full;
  float v_empty;
  float v_resume;  // leave the hutch once charged to this
};

// Defaults tuned for the simulator and a 2S Li-ion replica.
Params defaultParams();

struct Inputs {
  float light;      // 0..1, brighter is higher
  bool contact;     // shell switch closed
  float battery_v;  // pack voltage
  bool charging;    // hutch contacts live
};

struct Outputs {
  float drive;  // 0..1 forward effort
  float steer;  // -1..1 steering effort, positive is counter-clockwise
  bool pilot;   // the pilot lamp on the shell
  Mode mode;
};

class Tortoise {
 public:
  explicit Tortoise(const Params& p);

  // Advance the model by dt_ms and return motor and lamp commands.
  Outputs step(const Inputs& in, float dt_ms);

  // Dazzle threshold at a given battery voltage. A flagging battery
  // raises it, so a lamp that once repelled the machine now draws it in.
  // That is how the tortoise finds its way home to the hutch.
  float dazzleThreshold(float battery_v) const;

  // Battery state of charge, 0..1.
  float charge(float battery_v) const;

  void reset();

 private:
  Params p_;
  float baseline_;
  float glimpse_left_ms_;
  float contact_phase_ms_;
  float contact_hold_left_ms_;
  bool docked_;
  bool primed_;
};

// Differential-drive mixer for the two-wheel replica. Turns (drive,
// steer) into left/right wheel commands in -1..1, scaling both down
// together if either would saturate, so the turn ratio is preserved.
struct Wheels {
  float left;
  float right;
};

Wheels mix(float drive, float steer, float turn_gain);

// Replica adaptation, not part of Walter's circuit. His tricycle travelled
// while it scanned: for part of each steering revolution the front wheel
// pointed forward and pulled the body along, tracing loops across the
// floor. A two-wheel body with a fixed photocell scans by turning on the
// spot, so a pure scan never gets anywhere. Explorer restores the travel:
// after one full revolution with nothing seen, it makes a short straight
// run, then scans again.
class Explorer {
 public:
  Explorer(float revolution_ms, float run_ms);
  Outputs shape(const Outputs& o, float dt_ms);

 private:
  float revolution_ms_;
  float run_ms_;
  float scanned_ms_;
  float run_left_ms_;
};

}  // namespace speculatrix
