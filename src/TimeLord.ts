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
	#earliestTimestamp = Number.MAX_VALUE;
  #earliestWallTimeMinusTimestamp = Number.MAX_VALUE;
  #largestWallTimeMinusTimestamp = Number.MIN_VALUE;
  #smallestWallTimeMinusTimestamp = Number.MAX_VALUE;
	
  /**
   * Collect timestamp/wall-time pairs from Chrome DevTools Protocol events so that
   * range of differences of (wallTime - timestamp) can be calculated.
   */
  addTimestampWallTimePair = (({ timestamp, wallTime }: { timestamp: number; wallTime: number; }): void => {
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

  /**
   * Wall times are not always monotonically increasing because of adjustments that may
   * cause seconds to be repeated or be skipped.
   * 
   * Timestamps are guaranteed to be monotonically increasing over time, but do not have
   * a fixed relationship to wall time.
   * 
   * This method converts a timestamp to an approximate walltime, by taking the wall time at the 
   * pair with the earliest observed timestamp, then adding the number of milliseconds that has
   * passed between that earliest timestamp and the parameter passed to this method.
   * @param timestamp A monotonically increasing timestamp to convert to an approximate wall time.
   * @returns A wall time
   */
  getApproximateWallTimeInSecondsFromUnixEpochFromMonotonicallyIncreasingTimestamp = (timestamp: number): number => {
    return this.#earliestWallTimeMinusTimestamp + timestamp;
  };

  get commentOnSkew(): string {
    if (this.#largestWallTimeMinusTimestamp < 0) {
      return "No events were observed.";
    }
    const msSkew = (this.#largestWallTimeMinusTimestamp - this.#smallestWallTimeMinusTimestamp) * 1000;
    return `Ensuring monotonically increasing time may have skewed reported times by as many as ${msSkew * 1000}ms.`;
  }
}