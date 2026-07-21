import { describe, expect, it } from "vitest";
import { hammingDistance, selectCardBounds, signatureSimilarity } from "./imageHash";
import type { ImageSignature } from "./types";

const signature: ImageSignature = {
  differenceHash: "ffffffffffffffff",
  averageHash: "0000000000000000",
  artworkHash: "1234567890abcdef",
  detailVector: Array.from({ length: 18 * 24 }, (_, index) => ((index * 37) % 101) / 100),
  artworkVector: Array.from({ length: 20 * 14 }, (_, index) => ((index * 31) % 89) / 88),
  artworkEdgeVector: Array.from({ length: 32 * 24 }, (_, index) => ((index * 17) % 71) / 70),
  spatialColorVector: Array.from({ length: 12 * 9 * 3 }, (_, index) => ((index * 29) % 97) / 96),
  titleVector: Array.from({ length: 40 * 8 }, (_, index) => ((index * 19) % 83) / 82),
  setSymbolVector: Array.from({ length: 16 * 16 }, (_, index) => ((index * 13) % 67) / 66),
  footerVector: Array.from({ length: 40 * 8 }, (_, index) => ((index * 11) % 61) / 60),
  stampVector: Array.from({ length: 20 * 20 }, (_, index) => ((index * 7) % 53) / 52),
  chromaVector: [...new Array(12).fill(1 / 12), 0.5],
  edgeVector: Array.from({ length: 24 * 34 }, (_, index) => ((index * 23) % 79) / 78),
  colorVector: new Array(12).fill(0.25),
  dominantColor: 0,
};

describe("perceptual image matching", () => {
  it("counts differing bits", () => {
    expect(hammingDistance("0", "f")).toBe(4);
    expect(hammingDistance("ff", "fe")).toBe(1);
  });

  it("returns a perfect score for equal signatures", () => {
    expect(signatureSimilarity(signature, signature)).toBeCloseTo(1, 10);
  });

  it("penalizes visually different hashes", () => {
    expect(
      signatureSimilarity(signature, {
        ...signature,
        differenceHash: "0000000000000000",
        averageHash: "ffffffffffffffff",
        artworkHash: "fedcba0987654321",
        detailVector: Array.from({ length: 18 * 24 }, (_, index) => ((index * 53 + 17) % 97) / 96),
        artworkVector: Array.from({ length: 20 * 14 }, (_, index) => ((index * 47 + 11) % 83) / 82),
        artworkEdgeVector: Array.from({ length: 32 * 24 }, (_, index) => ((index * 59 + 3) % 101) / 100),
        spatialColorVector: Array.from({ length: 12 * 9 * 3 }, (_, index) => ((index * 43 + 5) % 91) / 90),
        titleVector: Array.from({ length: 40 * 8 }, (_, index) => ((index * 37 + 9) % 79) / 78),
        setSymbolVector: Array.from({ length: 16 * 16 }, (_, index) => ((index * 31 + 7) % 73) / 72),
        footerVector: Array.from({ length: 40 * 8 }, (_, index) => ((index * 23 + 3) % 59) / 58),
        stampVector: Array.from({ length: 20 * 20 }, (_, index) => ((index * 17 + 5) % 61) / 60),
        chromaVector: [...new Array(12).fill(0).map((_, index) => index / 66), 0.1],
        edgeVector: Array.from({ length: 24 * 34 }, (_, index) => ((index * 41 + 7) % 73) / 72),
      }),
    ).toBeLessThan(0.6);
  });
});

describe("card edge detection", () => {
  it("finds an off-center card-sized rectangle", () => {
    const vertical = new Array<number>(200).fill(1);
    const horizontal = new Array<number>(280).fill(1);
    vertical[22] = 90;
    vertical[122] = 90;
    horizontal[14] = 90;
    horizontal[154] = 90;

    const bounds = selectCardBounds(vertical, horizontal);

    expect(bounds).not.toBeNull();
    expect(bounds?.x).toBeLessThan(30);
    expect(bounds?.y).toBeLessThan(25);
    expect(bounds?.width).toBeCloseTo(100, -1);
    expect(bounds?.height).toBeCloseTo(140, -1);
  });

  it("rejects an image without distinct borders", () => {
    expect(selectCardBounds(new Array(200).fill(2), new Array(280).fill(2))).toBeNull();
  });
});
