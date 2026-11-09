CXX ?= g++
CXXFLAGS ?= -std=c++11 -Wall -Wextra -Werror -O2
FW := firmware/tortoise

.PHONY: test sketch parity all clean

all: test sketch parity

# Unit tests for the behavioural model.
test: build/test_speculatrix
	./build/test_speculatrix

build/test_speculatrix: test/test_speculatrix.cpp $(FW)/speculatrix.cpp $(FW)/speculatrix.h
	@mkdir -p build
	$(CXX) $(CXXFLAGS) -o $@ test/test_speculatrix.cpp $(FW)/speculatrix.cpp

# Compile the sketch against a stub Arduino API (syntax and types only).
sketch:
	$(CXX) $(CXXFLAGS) -Itest/arduino_stub -include Arduino.h \
	  -x c++ -fsyntax-only $(FW)/tortoise.ino

# Check that the browser simulator's controller matches the C++ model.
parity: build/parity_trace
	node test/parity.js

build/parity_trace: test/parity_trace.cpp $(FW)/speculatrix.cpp $(FW)/speculatrix.h
	@mkdir -p build
	$(CXX) $(CXXFLAGS) -o $@ test/parity_trace.cpp $(FW)/speculatrix.cpp

clean:
	rm -rf build
