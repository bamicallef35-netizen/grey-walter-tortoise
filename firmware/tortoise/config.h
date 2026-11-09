// config.h — pins and calibration for the two-wheel replica.
//
// Reference build: Arduino Nano, TB6612FNG motor driver, two N20 gear
// motors, one shrouded LDR, a floating-shell contact and a 2S Li-ion
// pack. Change the pins here to match your wiring; see hardware/BOM.md.

#pragma once

// ── Receptors ──────────────────────────────────────────────────────────
// LDR from 5 V to PIN_LIGHT, 10 kΩ from PIN_LIGHT to GND: brighter reads
// higher. Shroud the LDR in a short black tube so it sees a narrow cone
// straight ahead, as Walter's photocell did.
#define PIN_LIGHT A0

// Pack voltage through a divider into PIN_BATTERY. With 2S Li-ion
// (8.4 V max) a 10 kΩ / 10 kΩ divider halves it.
#define PIN_BATTERY A1
#define BATTERY_DIVIDER 2.0f
#define ADC_REF_V 5.0f

// Shell contact: closes to GND when the shell is pushed off centre.
#define PIN_SHELL 2

// Optional hutch sense: reads HIGH when the charging contacts are live.
// Leave at -1 if the build has no charger.
#define PIN_CHARGING -1

// ── Effectors ──────────────────────────────────────────────────────────
// TB6612FNG: channel A drives the left wheel, channel B the right.
#define PIN_STBY 4
#define PIN_AIN1 7
#define PIN_AIN2 8
#define PIN_PWMA 5
#define PIN_BIN1 9
#define PIN_BIN2 10
#define PIN_PWMB 6

// Flip a wheel if it runs backwards.
#define LEFT_REVERSED 0
#define RIGHT_REVERSED 0

// Pilot lamp on the shell (an LED and resistor). Walter's lamp was what
// let the tortoise recognise itself in a mirror.
#define PIN_PILOT 3

// ── Tuning ─────────────────────────────────────────────────────────────
// Light calibration: set CALIBRATE to 1, open the serial monitor at
// 115200 baud and note the raw reading in your room's dark corner and
// with a lamp 20 cm from the shroud. Put them here, then set CALIBRATE
// back to 0.
#define CALIBRATE 0
#define LIGHT_RAW_DARK 120
#define LIGHT_RAW_BRIGHT 900

// How strongly steering effort turns the body, relative to drive.
#define TURN_GAIN 0.6f

// Replica exploration (see Explorer in speculatrix.h): roughly how long
// one full turn on the spot takes while scanning, and how long the
// straight run that follows lasts. Time a revolution on your floor.
#define REVOLUTION_MS 4200.0f
#define RUN_MS 900.0f

// Overall motor ceiling, 0..255. Walter's tortoises were slow.
#define PWM_MAX 170

// Control tick.
#define TICK_MS 10

// Print one CSV line of telemetry every N ticks (0 disables).
#define TELEMETRY_EVERY 10
