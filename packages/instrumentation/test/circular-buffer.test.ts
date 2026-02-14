import { describe, expect, it } from "vitest";

import { CircularBuffer } from "../src/circular-buffer";

describe("CircularBuffer", () => {
  it("drops oldest entries when full", () => {
    const buffer = new CircularBuffer<number>(3);

    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    buffer.push(4);

    expect(buffer.toArray()).toEqual([2, 3, 4]);
  });
});
