// parity_trace.cpp — run the C++ model over a scripted input sequence.
//
// test/parity.js feeds the same sequence to the JS port and compares the
// two traces line by line. Each stdin line is one control tick:
//
//   light contact battery_v charging dt_ms
//
// and each stdout line is the model's answer:
//
//   mode drive steer pilot
//
// With argv[1] == "explorer" the outputs pass through Explorer first,
// with the same revolution and run times the simulator uses.

#include <cstdio>
#include <cstring>

#include "../firmware/tortoise/speculatrix.h"

int main(int argc, char** argv) {
  using namespace speculatrix;
  const bool use_explorer = argc > 1 && std::strcmp(argv[1], "explorer") == 0;

  Tortoise tortoise(defaultParams());
  Explorer explorer(4200.0f, 900.0f);

  float light = 0.0f, battery = 0.0f, dt = 0.0f;
  int contact = 0, charging = 0;
  while (std::scanf("%f %d %f %d %f", &light, &contact, &battery, &charging, &dt) == 5) {
    Inputs in{light, contact != 0, battery, charging != 0};
    Outputs o = tortoise.step(in, dt);
    if (use_explorer) o = explorer.shape(o, dt);
    std::printf("%s %.4f %.4f %d\n", modeName(o.mode), static_cast<double>(o.drive),
                static_cast<double>(o.steer), o.pilot ? 1 : 0);
  }
  return 0;
}
