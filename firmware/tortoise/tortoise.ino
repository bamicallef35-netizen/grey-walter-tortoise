// tortoise.ino — Machina speculatrix on a two-wheel chassis.
//
// The behaviour lives in speculatrix.{h,cpp}; this file only reads the
// sensors, runs the model each tick and drives the motors and the pilot
// lamp. Walter's steering column scanned the photocell around the body.
// Here the photocell is fixed to the body and the body itself turns, so
// "steering" becomes the difference between the two wheels.

#include "config.h"
#include "speculatrix.h"

using speculatrix::Inputs;
using speculatrix::Outputs;
using speculatrix::Tortoise;
using speculatrix::Wheels;

static Tortoise tortoise(speculatrix::defaultParams());
static speculatrix::Explorer explorer(REVOLUTION_MS, RUN_MS);
static unsigned long last_tick_ms = 0;
static unsigned long ticks = 0;

static int readLightRaw() {
  long sum = 0;
  for (int i = 0; i < 4; ++i) sum += analogRead(PIN_LIGHT);
  return static_cast<int>(sum / 4);
}

static float normaliseLight(int raw) {
  float x = static_cast<float>(raw - LIGHT_RAW_DARK) /
            static_cast<float>(LIGHT_RAW_BRIGHT - LIGHT_RAW_DARK);
  if (x < 0.0f) x = 0.0f;
  if (x > 1.0f) x = 1.0f;
  return x;
}

static float readBatteryV() {
  return analogRead(PIN_BATTERY) * (ADC_REF_V / 1023.0f) * BATTERY_DIVIDER;
}

static bool readCharging() {
#if PIN_CHARGING >= 0
  return digitalRead(PIN_CHARGING) == HIGH;
#else
  return false;
#endif
}

static void driveWheel(int in1, int in2, int pwm, float cmd, bool reversed) {
  if (reversed) cmd = -cmd;
  int duty = static_cast<int>((cmd < 0 ? -cmd : cmd) * PWM_MAX);
  if (duty > 255) duty = 255;
  digitalWrite(in1, cmd > 0.0f ? HIGH : LOW);
  digitalWrite(in2, cmd < 0.0f ? HIGH : LOW);
  analogWrite(pwm, duty);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_SHELL, INPUT_PULLUP);
#if PIN_CHARGING >= 0
  pinMode(PIN_CHARGING, INPUT);
#endif
  const int outs[] = {PIN_STBY, PIN_AIN1, PIN_AIN2, PIN_PWMA,
                      PIN_BIN1, PIN_BIN2, PIN_PWMB, PIN_PILOT};
  for (int pin : outs) pinMode(pin, OUTPUT);
  digitalWrite(PIN_STBY, HIGH);
#if TELEMETRY_EVERY > 0 && !CALIBRATE
  Serial.println(F("ms,mode,light,battery_v,dazzle_at,left,right,pilot"));
#endif
  last_tick_ms = millis();
}

void loop() {
  const unsigned long now = millis();
  if (now - last_tick_ms < TICK_MS) return;
  const float dt = static_cast<float>(now - last_tick_ms);
  last_tick_ms = now;

  const int raw = readLightRaw();
#if CALIBRATE
  digitalWrite(PIN_STBY, LOW);
  if (ticks++ % 20 == 0) {
    Serial.print(F("light_raw="));
    Serial.print(raw);
    Serial.print(F(" battery_v="));
    Serial.print(readBatteryV(), 2);
    Serial.print(F(" shell="));
    Serial.println(digitalRead(PIN_SHELL) == LOW ? F("closed") : F("open"));
  }
  return;
#endif

  Inputs in;
  in.light = normaliseLight(raw);
  in.contact = digitalRead(PIN_SHELL) == LOW;
  in.battery_v = readBatteryV();
  in.charging = readCharging();

  const Outputs out = explorer.shape(tortoise.step(in, dt), dt);
  const Wheels w = speculatrix::mix(out.drive, out.steer, TURN_GAIN);

  driveWheel(PIN_AIN1, PIN_AIN2, PIN_PWMA, w.left, LEFT_REVERSED);
  driveWheel(PIN_BIN1, PIN_BIN2, PIN_PWMB, w.right, RIGHT_REVERSED);
  digitalWrite(PIN_PILOT, out.pilot ? HIGH : LOW);

#if TELEMETRY_EVERY > 0
  if (ticks++ % TELEMETRY_EVERY == 0) {
    Serial.print(now);
    Serial.print(',');
    Serial.print(speculatrix::modeName(out.mode));
    Serial.print(',');
    Serial.print(in.light, 3);
    Serial.print(',');
    Serial.print(in.battery_v, 2);
    Serial.print(',');
    Serial.print(tortoise.dazzleThreshold(in.battery_v), 3);
    Serial.print(',');
    Serial.print(w.left, 2);
    Serial.print(',');
    Serial.print(w.right, 2);
    Serial.print(',');
    Serial.println(out.pilot ? 1 : 0);
  }
#endif
}
