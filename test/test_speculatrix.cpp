// Host-side tests for the speculatrix model. Build and run with `make test`.
// Each test pins one behaviour Walter describes.

#include <cmath>
#include <cstdio>

#include "../firmware/tortoise/speculatrix.h"

using namespace speculatrix;

static int failures = 0;
static int checks = 0;

#define CHECK(cond)                                                    \
  do {                                                                 \
    ++checks;                                                          \
    if (!(cond)) {                                                     \
      ++failures;                                                      \
      std::printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond);    \
    }                                                                  \
  } while (0)

static bool near(float a, float b) { return std::fabs(a - b) < 1e-4f; }

static Inputs dark(float v = 8.2f) { return Inputs{0.0f, false, v, false}; }
static Inputs lit(float light, float v = 8.2f) { return Inputs{light, false, v, false}; }

// Run `ms` of steady input and return the last output.
static Outputs hold(Tortoise& t, const Inputs& in, int ms, int dt = 10) {
  Outputs o{};
  for (int i = 0; i < ms; i += dt) o = t.step(in, static_cast<float>(dt));
  return o;
}

static void test_dark_scans() {
  Tortoise t(defaultParams());
  Outputs o = hold(t, dark(), 500);
  CHECK(o.mode == Mode::Scan);
  CHECK(near(o.drive, 0.5f));   // drive at half speed
  CHECK(near(o.steer, 1.0f));   // steering rotates continuously
  CHECK(o.pilot);               // pilot lamp lit in the dark
}

static void test_moderate_light_locks() {
  Tortoise t(defaultParams());
  hold(t, dark(), 500);
  Outputs o = hold(t, lit(0.5f), 200);
  CHECK(o.mode == Mode::Lock);
  CHECK(near(o.drive, 1.0f));   // full speed towards the light
  CHECK(near(o.steer, 0.0f));   // scanning stopped
  CHECK(!o.pilot);              // relay two shorts the pilot lamp
}

static void test_intense_light_dazzles() {
  Tortoise t(defaultParams());
  Outputs o = hold(t, lit(0.9f), 200);
  CHECK(o.mode == Mode::Dazzle);
  CHECK(near(o.drive, 1.0f));
  CHECK(near(o.steer, 0.5f));   // scanning restarts at half speed: a swerve
  CHECK(!o.pilot);
}

static void test_flat_battery_is_drawn_to_bright_light() {
  // The same lamp that dazzles a fresh tortoise attracts a tired one.
  Params p = defaultParams();
  Tortoise fresh(p), tired(p);
  CHECK(hold(fresh, lit(0.9f, p.v_full), 200).mode == Mode::Dazzle);
  CHECK(hold(tired, lit(0.9f, p.v_empty), 200).mode == Mode::Lock);
  CHECK(fresh.dazzleThreshold(p.v_full) < fresh.dazzleThreshold(7.5f));
  CHECK(fresh.dazzleThreshold(7.5f) < fresh.dazzleThreshold(p.v_empty));
}

static void test_faint_light_glimpses_then_resumes_scan() {
  Params p = defaultParams();
  Tortoise t(p);
  hold(t, dark(), 1000);
  // A distant lamp swings into view: below lock level, but a sudden rise.
  Outputs o = t.step(lit(0.2f), 10.0f);
  CHECK(o.mode == Mode::Glimpse);
  CHECK(near(o.steer, 0.0f));
  CHECK(!o.pilot);
  // Held steady, the baseline catches up and scanning resumes.
  o = hold(t, lit(0.2f), 3000);
  CHECK(o.mode == Mode::Scan);
}

static void test_contact_oscillates_one_third_two_thirds() {
  Params p = defaultParams();
  Tortoise t(p);
  hold(t, dark(), 200);
  int steer_hard = 0, push_hard = 0;
  const int period = static_cast<int>(p.contact_period_dark_ms);
  for (int ms = 0; ms < period * 4; ms += 10) {
    Outputs o = t.step(Inputs{0.0f, true, 8.2f, false}, 10.0f);
    CHECK(o.mode == Mode::Contact);
    if (near(o.steer, 1.0f) && near(o.drive, 0.5f)) ++steer_hard;
    if (near(o.steer, 0.5f) && near(o.drive, 1.0f)) ++push_hard;
  }
  const float frac = static_cast<float>(steer_hard) / (steer_hard + push_hard);
  CHECK(std::fabs(frac - 1.0f / 3.0f) < 0.02f);
}

static void test_contact_persists_then_releases() {
  Params p = defaultParams();
  Tortoise t(p);
  t.step(Inputs{0.0f, true, 8.2f, false}, 10.0f);
  Outputs o = hold(t, dark(), static_cast<int>(p.contact_hold_ms) - 50);
  CHECK(o.mode == Mode::Contact);
  o = hold(t, dark(), 200);
  CHECK(o.mode == Mode::Scan);
}

static void test_contact_is_hasty_in_light() {
  Params p = defaultParams();
  CHECK(p.contact_period_lit_ms < p.contact_period_dark_ms);
  // Count phase flips over two seconds, dark against lit.
  auto flips = [&](float light) {
    Tortoise t(p);
    int n = 0;
    float last = -1.0f;
    for (int ms = 0; ms < 2000; ms += 10) {
      Outputs o = t.step(Inputs{light, true, 8.2f, false}, 10.0f);
      if (last >= 0.0f && !near(o.steer, last)) ++n;
      last = o.steer;
    }
    return n;
  };
  CHECK(flips(0.5f) > flips(0.0f));
}

static void test_docks_and_leaves_when_charged() {
  Params p = defaultParams();
  Tortoise t(p);
  Outputs o = t.step(Inputs{1.0f, false, 7.0f, true}, 10.0f);
  CHECK(o.mode == Mode::Docked);
  CHECK(near(o.drive, 0.0f) && near(o.steer, 0.0f));
  o = t.step(Inputs{1.0f, false, 7.9f, true}, 10.0f);
  CHECK(o.mode == Mode::Docked);
  // Charged: the hutch lamp dazzles again and the tortoise swerves out.
  o = t.step(Inputs{1.0f, false, 8.2f, true}, 10.0f);
  CHECK(o.mode == Mode::Dazzle);
}

static void test_mixer_preserves_turn_ratio() {
  Wheels w = mix(1.0f, 0.0f, 0.6f);
  CHECK(near(w.left, 1.0f) && near(w.right, 1.0f));
  w = mix(0.5f, 1.0f, 0.6f);  // scan: arc to the left
  CHECK(w.right > w.left);
  CHECK(w.right <= 1.0f && w.left >= -1.0f);
  w = mix(1.0f, 1.0f, 1.0f);  // would be (0, 2): scaled to (0, 1)
  CHECK(near(w.left, 0.0f) && near(w.right, 1.0f));
}

static void test_explorer_runs_after_each_revolution() {
  Explorer ex(4000.0f, 800.0f);
  const Outputs scan{0.5f, 1.0f, true, Mode::Scan};
  int straight = 0;
  for (int ms = 0; ms < 4800; ms += 10) {
    Outputs o = ex.shape(scan, 10.0f);
    if (near(o.steer, 0.0f) && near(o.drive, 1.0f)) ++straight;
    CHECK(o.pilot);  // still scanning, so the pilot lamp stays lit
  }
  CHECK(straight >= 78 && straight <= 82);  // one 800 ms run per revolution
  // Any light cancels the run at once.
  const Outputs lock{1.0f, 0.0f, false, Mode::Lock};
  CHECK(ex.shape(lock, 10.0f).mode == Mode::Lock);
}

int main() {
  test_dark_scans();
  test_moderate_light_locks();
  test_intense_light_dazzles();
  test_flat_battery_is_drawn_to_bright_light();
  test_faint_light_glimpses_then_resumes_scan();
  test_contact_oscillates_one_third_two_thirds();
  test_contact_persists_then_releases();
  test_contact_is_hasty_in_light();
  test_docks_and_leaves_when_charged();
  test_mixer_preserves_turn_ratio();
  test_explorer_runs_after_each_revolution();
  std::printf("%d checks, %d failed\n", checks, failures);
  return failures == 0 ? 0 : 1;
}
