import { describe, expect, it } from "vitest";
import { selectCandidateRoutes } from "./allCardIndex";
import type { ImageSignature } from "./types";
import type { RuntimeRoute } from "./allCardIndex";

const zeroHash = "0000000000000000";

const signature: ImageSignature = {
  differenceHash: zeroHash,
  averageHash: zeroHash,
  artworkHash: zeroHash,
  detailVector: new Array(18 * 24).fill(0),
  artworkVector: new Array(20 * 14).fill(0),
  artworkEdgeVector: new Array(32 * 24).fill(0),
  spatialColorVector: new Array(12 * 9 * 3).fill(0),
  titleVector: new Array(40 * 8).fill(0),
  setSymbolVector: new Array(16 * 16).fill(0),
  footerVector: new Array(40 * 8).fill(0),
  stampVector: new Array(20 * 20).fill(0),
  chromaVector: new Array(13).fill(0),
  edgeVector: new Array(24 * 34).fill(0),
  colorVector: new Array(12).fill(0),
  dominantColor: 0,
};

function route(position: number, hash: string): RuntimeRoute {
  return [
    0,
    position,
    hash,
    hash,
    new Uint8Array(13),
    new Uint8Array(90),
    new Uint8Array(88),
    new Uint8Array(80),
    hash,
    new Uint8Array(192),
  ];
}

describe("global card routing", () => {
  it("keeps the strongest route when the shortlist is bounded", () => {
    const exact = route(1, zeroHash);
    const unrelated = route(2, "ffffffffffffffff");

    expect(selectCandidateRoutes(signature, [unrelated, exact], 1)).toEqual([exact]);
  });
});
