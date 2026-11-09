// Minimal Arduino API stub so tortoise.ino compiles on the host in CI.
// It checks that the sketch is well-formed C++; it does not emulate a board.
#pragma once
#include <stdint.h>

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define A0 14
#define A1 15
#define F(s) (s)

inline int analogRead(int) { return 512; }
inline void analogWrite(int, int) {}
inline int digitalRead(int) { return HIGH; }
inline void digitalWrite(int, int) {}
inline void pinMode(int, int) {}
inline unsigned long millis() {
  static unsigned long t = 0;
  return t += 10;
}

struct SerialStub {
  void begin(long) {}
  template <typename T> void print(T) {}
  template <typename T> void print(T, int) {}
  template <typename T> void println(T) {}
  void println() {}
};
static SerialStub Serial;
