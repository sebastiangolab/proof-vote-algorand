import algosdk from "algosdk";
import { generateVoteBoxName, generateUserVoteBoxName, decodeVoteState, decodeUserVoteState } from ".";

// ─── generateVoteBoxName ──────────────────────────────────────────────────────

describe("generateVoteBoxName", () => {
  it("starts with 0x76 ('v') prefix", () => {
    const name = generateVoteBoxName(1n);
    expect(name[0]).toBe(0x76);
  });

  it("is exactly 9 bytes", () => {
    const name = generateVoteBoxName(42n);
    expect(name.length).toBe(9);
  });

  it("encodes voteId as big-endian uint64", () => {
    // voteId = 1 should produce bytes: [0x76, 0,0,0,0, 0,0,0,1]
    const name = generateVoteBoxName(1n);
    expect(Array.from(name)).toEqual([0x76, 0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("encodes large voteId correctly", () => {
    // voteId = 256 = 0x0100
    const name = generateVoteBoxName(256n);
    expect(Array.from(name)).toEqual([0x76, 0, 0, 0, 0, 0, 0, 1, 0]);
  });

  it("encodes voteId = 0 as all zero bytes after prefix", () => {
    const name = generateVoteBoxName(0n);
    expect(Array.from(name)).toEqual([0x76, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

// ─── generateUserVoteBoxName ──────────────────────────────────────────────────

describe("generateUserVoteBoxName", () => {
  const account = algosdk.generateAccount();
  const address = account.addr.toString();

  it("is exactly 41 bytes", () => {
    const name = generateUserVoteBoxName(1n, address);
    expect(name.length).toBe(41);
  });

  it("starts with 0x75 ('u') prefix", () => {
    const name = generateUserVoteBoxName(1n, address);
    expect(name[0]).toBe(0x75);
  });

  it("encodes voteId in bytes 1-8 as big-endian uint64", () => {
    const name = generateUserVoteBoxName(1n, address);
    const voteIdBytes = Array.from(name.slice(1, 9));
    expect(voteIdBytes).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("places the 32-byte public key at offset 9", () => {
    const name = generateUserVoteBoxName(1n, address);
    const pubKeyInBox = name.slice(9, 41);
    const { publicKey } = algosdk.decodeAddress(address);
    expect(pubKeyInBox).toEqual(publicKey);
  });
});

// ─── decodeVoteState ─────────────────────────────────────────────────────────

describe("decodeVoteState", () => {
  function buildVoteStateBytes(params: {
    creator: Uint8Array;
    endAt: bigint;
    stake: bigint;
    withdrawDeadline: bigint;
    optionCount: bigint;
    counts: bigint[];
  }): Uint8Array {
    const buf = new Uint8Array(128);
    const view = new DataView(buf.buffer);

    // offset 0: creator (32 bytes)
    buf.set(params.creator, 0);
    // offsets 32, 40, 48, 56, 64
    view.setBigUint64(32, params.endAt);
    view.setBigUint64(40, params.stake);
    view.setBigUint64(48, params.withdrawDeadline);
    view.setBigUint64(56, params.optionCount);
    // offset 64: counts[0..7]
    for (let i = 0; i < 8; i++) {
      view.setBigUint64(64 + i * 8, params.counts[i] ?? 0n);
    }
    return buf;
  }

  const creatorAccount = algosdk.generateAccount();
  const creatorPubKey = algosdk.decodeAddress(creatorAccount.addr.toString()).publicKey;

  const sampleBytes = buildVoteStateBytes({
    creator: creatorPubKey,
    endAt: 1_700_003_600n,
    stake: 1_000_000n,
    withdrawDeadline: 1_700_007_200n,
    optionCount: 3n,
    counts: [10n, 20n, 5n, 0n, 0n, 0n, 0n, 0n],
  });

  it("throws if bytes length is not 128", () => {
    expect(() => decodeVoteState(new Uint8Array(100))).toThrow("128");
  });

  it("decodes creator address from offset 0", () => {
    const state = decodeVoteState(sampleBytes);
    expect(state.creator).toBe(creatorAccount.addr.toString());
  });

  it("decodes endAt from offset 32", () => {
    const state = decodeVoteState(sampleBytes);
    expect(state.endAt).toBe(1_700_003_600n);
  });

  it("decodes stake from offset 40", () => {
    const state = decodeVoteState(sampleBytes);
    expect(state.stake).toBe(1_000_000n);
  });

  it("decodes withdrawDeadline from offset 48", () => {
    const state = decodeVoteState(sampleBytes);
    expect(state.withdrawDeadline).toBe(1_700_007_200n);
  });

  it("decodes optionCount from offset 56", () => {
    const state = decodeVoteState(sampleBytes);
    expect(state.optionCount).toBe(3n);
  });

  it("decodes counts array from offset 64", () => {
    const state = decodeVoteState(sampleBytes);
    expect(state.counts).toEqual([10n, 20n, 5n, 0n, 0n, 0n, 0n, 0n]);
  });
});

// ─── decodeUserVoteState ─────────────────────────────────────────────────────────

describe("decodeUserVoteState", () => {
  function buildUserStateBytes(params: {
    voted: boolean;
    choice: bigint;
    stakeLocked: bigint;
    withdrawn: boolean;
  }): Uint8Array {
    const buf = new Uint8Array(17);
    const view = new DataView(buf.buffer);
    // offset 0: ARC-4 packed bools — voted=bit7 (0x80), withdrawn=bit6 (0x40)
    buf[0] = (params.voted ? 0x80 : 0) | (params.withdrawn ? 0x40 : 0);
    // offset 1: choice (8 bytes)
    view.setBigUint64(1, params.choice);
    // offset 9: stakeLocked (8 bytes)
    view.setBigUint64(9, params.stakeLocked);
    return buf;
  }

  it("throws if bytes length is not 17", () => {
    expect(() => decodeUserVoteState(new Uint8Array(10))).toThrow("17");
  });

  it("decodes voted=true when bit 7 of byte 0 is set", () => {
    const bytes = buildUserStateBytes({
      voted: true,
      choice: 0n,
      stakeLocked: 0n,
      withdrawn: false,
    });
    expect(decodeUserVoteState(bytes).voted).toBe(true);
  });

  it("decodes voted=false when bit 7 of byte 0 is clear", () => {
    const bytes = buildUserStateBytes({
      voted: false,
      choice: 0n,
      stakeLocked: 0n,
      withdrawn: false,
    });
    expect(decodeUserVoteState(bytes).voted).toBe(false);
  });

  it("decodes choice from offset 1", () => {
    const bytes = buildUserStateBytes({
      voted: true,
      choice: 2n,
      stakeLocked: 0n,
      withdrawn: false,
    });
    expect(decodeUserVoteState(bytes).choice).toBe(2n);
  });

  it("decodes stakeLocked from offset 9", () => {
    const bytes = buildUserStateBytes({
      voted: true,
      choice: 0n,
      stakeLocked: 1_026_100n,
      withdrawn: false,
    });
    expect(decodeUserVoteState(bytes).stakeLocked).toBe(1_026_100n);
  });

  it("decodes withdrawn=true when bit 6 of byte 0 is set", () => {
    const bytes = buildUserStateBytes({
      voted: true,
      choice: 0n,
      stakeLocked: 0n,
      withdrawn: true,
    });
    expect(decodeUserVoteState(bytes).withdrawn).toBe(true);
  });

  it("decodes withdrawn=false when bit 6 of byte 0 is clear", () => {
    const bytes = buildUserStateBytes({
      voted: true,
      choice: 0n,
      stakeLocked: 0n,
      withdrawn: false,
    });
    expect(decodeUserVoteState(bytes).withdrawn).toBe(false);
  });

  it("voted and withdrawn are ARC-4 packed in byte 0 and decode independently", () => {
    // voted=bit7, withdrawn=bit6 — setting one must not affect the other
    const bytes = buildUserStateBytes({
      voted: true,
      choice: 1n,
      stakeLocked: 500_000n,
      withdrawn: false,
    });
    const state = decodeUserVoteState(bytes);
    expect(state.voted).toBe(true);
    expect(state.withdrawn).toBe(false);
  });
});
