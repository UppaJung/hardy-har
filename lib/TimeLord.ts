/**
 * Converts timestamps to approximate wall times ensuring they are monotonically increasing.
 * 
 * Per [Chromium Source](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/platform/loader/fetch/resource_load_timing.h)
 * > We want to present a unified timeline to Javascript. Using walltime is
 *    problematic, because the clock may skew while resources load. To prevent
 *    that skew, we record a single reference walltime when root document
 *    navigation begins. All other times are recorded using
 *    monotonicallyIncreasingTime(). When a time needs to be presented to
 *    Javascript, we build a pseudo-walltime using the following equation
 *    (m_requestTime as example):
 *      pseudo time = document wall reference +
 *                        (m_requestTime - document monotonic reference).
 */


export class TimeLord {
//  #earliestWallTime = Number.MAX_VALUE;
	#earliestTimestamp = Number.MAX_VALUE;
  #earliestWallTimeMinusTimestamp = Number.MAX_VALUE;
  #largestWallTimeMinusTimestamp = Number.MIN_VALUE;
  #smallestWallTimeMinusTimestamp = Number.MAX_VALUE;
	
  addTimestampWallTimePair = (({ timestamp, wallTime }: { timestamp: number; wallTime: number; }) => {
    const wallTimeMinusTimestamp = wallTime - timestamp;
    if (timestamp < this.#earliestTimestamp) {
      this.#earliestTimestamp = timestamp;
      this.#earliestWallTimeMinusTimestamp = wallTimeMinusTimestamp;
    }
    if (wallTimeMinusTimestamp > this.#largestWallTimeMinusTimestamp) {
      this.#largestWallTimeMinusTimestamp = wallTimeMinusTimestamp;
    }
    if (wallTimeMinusTimestamp < this.#smallestWallTimeMinusTimestamp) {
      this.#smallestWallTimeMinusTimestamp = wallTimeMinusTimestamp;
    }
  });

  getApproximateWallTimeInSecondsFromUnixEpochFromMonotonicallyIncreasingTimestamp = (timestamp: number) => {
    return this.#earliestWallTimeMinusTimestamp + timestamp;
  };

  get commentOnSkew() {
    const msSkew = (this.#largestWallTimeMinusTimestamp - this.#smallestWallTimeMinusTimestamp) * 1000;
    return `Ensuring monotonically increasing time may have skewed reported times by as many as ${msSkew * 1000}ms.`;
  }
}