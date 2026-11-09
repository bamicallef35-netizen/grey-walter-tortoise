// speculatrix.cpp — see speculatrix.h for the model.

#include "speculatrix.h"

namespace speculatrix {

namespace {

float clamp01(float x) { return x < 0.0f ? 0.0f : (x > 1.0f ? 1.0f : x); }
float absf(float x) { return x < 0.0f ? -x : x; }

}  // namespace

const char* modeName(Mode m) {
  switch (m) {
    case Mode::Scan:    return "scan";
    case Mode::Glimpse: return "glimpse";
    case Mode::Lock:    return "lock";
    case Mode::Dazzle:  return "dazzle";
    case Mode::Contact: return "contact";
    case Mode::Docked:  return "docked";
  }
  return "?";
}

Params defaultParams() {
  Params p;
  p.glimpse_delta = 0.04f;
  p.glimpse_ms = 180.0f;
  p.baseline_tau_ms = 600.0f;
  p.lock_level = 0.35f;
  p.dazzle_full = 0.80f;
  p.dazzle_empty = 1.01f;  // above full scale: a flat tortoise is never dazzled
  p.contact_period_dark_ms = 1500.0f;
  p.contact_period_lit_ms = 700.0f;
  p.contact_hold_ms = 900.0f;
  p.v_full = 8.2f;
  p.v_empty = 6.8f;
  p.v_resume = 8.0f;
  return p;
}

Tortoise::Tortoise(const Params& p) : p_(p) { reset(); }

void Tortoise::reset() {
  baseline_ = 0.0f;
  glimpse_left_ms_ = 0.0f;
  contact_phase_ms_ = 0.0f;
  contact_hold_left_ms_ = 0.0f;
  docked_ = false;
  primed_ = false;
}

float Tortoise::charge(float battery_v) const {
  return clamp01((battery_v - p_.v_empty) / (p_.v_full - p_.v_empty));
}

float Tortoise::dazzleThreshold(float battery_v) const {
  const float c = charge(battery_v);
  return p_.dazzle_empty + (p_.dazzle_full - p_.dazzle_empty) * c;
}

Outputs Tortoise::step(const Inputs& in, float dt_ms) {
  if (dt_ms < 0.0f) dt_ms = 0.0f;
  const float light = clamp01(in.light);

  // The coupling capacitor: the first valve answers changes in light
  // strongly and steady light weakly. A running baseline stands in for it.
  if (!primed_) {
    baseline_ = light;
    primed_ = true;
  }
  const float rise = light - baseline_;
  float k = dt_ms / p_.baseline_tau_ms;
  if (k > 1.0f) k = 1.0f;
  baseline_ += (light - baseline_) * k;

  // Hutch: once on the charger with a low battery, rest until recharged.
  if (in.charging && in.battery_v < p_.v_resume) docked_ = true;
  if (docked_ && (!in.charging || in.battery_v >= p_.v_resume)) docked_ = false;
  if (docked_) {
    contact_hold_left_ms_ = 0.0f;
    glimpse_left_ms_ = 0.0f;
    return Outputs{0.0f, 0.0f, false, Mode::Docked};
  }

  // Shell contact turns the amplifier into a multivibrator. Simple light
  // sensitivity is lost while it oscillates.
  if (in.contact) {
    if (contact_hold_left_ms_ <= 0.0f) contact_phase_ms_ = 0.0f;
    contact_hold_left_ms_ = p_.contact_hold_ms;
  }
  if (contact_hold_left_ms_ > 0.0f) {
    if (!in.contact) contact_hold_left_ms_ -= dt_ms;
    const float period =
        light >= p_.lock_level ? p_.contact_period_lit_ms : p_.contact_period_dark_ms;
    contact_phase_ms_ += dt_ms;
    while (contact_phase_ms_ >= period) contact_phase_ms_ -= period;
    glimpse_left_ms_ = 0.0f;
    if (contact_phase_ms_ < period / 3.0f) {
      return Outputs{0.5f, 1.0f, true, Mode::Contact};   // steer hard, push gently
    }
    return Outputs{1.0f, 0.5f, false, Mode::Contact};    // push hard, steer gently
  }

  // Light. Relay two closes on any light and puts out the pilot lamp;
  // relay one opens on intense light and swerves the machine away.
  if (light >= dazzleThreshold(in.battery_v)) {
    glimpse_left_ms_ = 0.0f;
    return Outputs{1.0f, 0.5f, false, Mode::Dazzle};
  }
  if (light >= p_.lock_level) {
    glimpse_left_ms_ = 0.0f;
    return Outputs{1.0f, 0.0f, false, Mode::Lock};
  }
  if (rise >= p_.glimpse_delta) glimpse_left_ms_ = p_.glimpse_ms;
  if (glimpse_left_ms_ > 0.0f) {
    glimpse_left_ms_ -= dt_ms;
    return Outputs{1.0f, 0.0f, false, Mode::Glimpse};
  }
  return Outputs{0.5f, 1.0f, true, Mode::Scan};
}

Wheels mix(float drive, float steer, float turn_gain) {
  float left = drive - steer * turn_gain;
  float right = drive + steer * turn_gain;
  const float m = absf(left) > absf(right) ? absf(left) : absf(right);
  if (m > 1.0f) {
    left /= m;
    right /= m;
  }
  return Wheels{left, right};
}

Explorer::Explorer(float revolution_ms, float run_ms)
    : revolution_ms_(revolution_ms), run_ms_(run_ms), scanned_ms_(0.0f), run_left_ms_(0.0f) {}

Outputs Explorer::shape(const Outputs& o, float dt_ms) {
  if (o.mode != Mode::Scan) {
    scanned_ms_ = 0.0f;
    run_left_ms_ = 0.0f;
    return o;
  }
  if (run_left_ms_ > 0.0f) {
    run_left_ms_ -= dt_ms;
    return Outputs{1.0f, 0.0f, o.pilot, o.mode};
  }
  scanned_ms_ += dt_ms;
  if (scanned_ms_ >= revolution_ms_) {
    scanned_ms_ = 0.0f;
    run_left_ms_ = run_ms_;
  }
  return o;
}

}  // namespace speculatrix
