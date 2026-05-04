import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { VoteDetail, type VoteMetadata } from "./VoteDetail";
import type { VoteState } from "@/lib/algorand";

// ─── Mock useWallet ────────────────────────────────────────────────────────────

jest.mock("@txnlab/use-wallet-react", () => ({
  useWallet: () => ({ activeAddress: null }),
}));

// ─── Mock algorand lib ────────────────────────────────────────────────────────

const mockGetVoteState = jest.fn<Promise<VoteState | null>, [bigint]>();
const mockGetUserState = jest.fn();
const mockFetchAppConfig = jest.fn().mockResolvedValue({ platformOwner: "PLATFORM0000000000000000000000000000000000000000000000000" });

jest.mock("@/lib/algorand", () => ({
  fetchVoteState: (...args: Parameters<typeof mockGetVoteState>) => mockGetVoteState(...args),
  fetchUserVoteState: (...args: Parameters<typeof mockGetUserState>) => mockGetUserState(...args),
  fetchAppConfig: (...args: unknown[]) => mockFetchAppConfig(...args),
  MICRO_ALGO: 1_000_000,
  VOTE_TX_FEE: 2000n,
  USER_VOTE_BOX_MBR: 25_700n,
}));

// ─── Mock VoteForm ────────────────────────────────────────────────────────────

jest.mock("./VoteForm", () => ({
  VoteForm: ({ disabled, disabledReason }: { disabled: boolean; disabledReason?: string }) => (
    <div data-testid="vote-form" data-disabled={String(disabled)}>
      {disabledReason}
    </div>
  ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const now = BigInt(Math.floor(Date.now() / 1000));

const voteStateActive: VoteState = {
  creator: "CREATOR0000000000000000000000000000000000000000000000000",
  endAt: now + 3600n,
  stake: 1_000_000n, // 1 ALGO
  withdrawDeadline: now + 7200n,
  optionCount: 2n,
  counts: [5n, 3n, 0n, 0n, 0n, 0n, 0n, 0n],
};

const voteStateEnded: VoteState = {
  creator: "CREATOR0000000000000000000000000000000000000000000000000",
  endAt: now - 3600n,
  stake: 1_000_000n,
  withdrawDeadline: now + 3600n,
  optionCount: 2n,
  counts: [5n, 3n, 0n, 0n, 0n, 0n, 0n, 0n],
};

const metadata: VoteMetadata = {
  voteId: "1",
  slug: "test-vote",
  title: "Test Vote",
  description: "A test poll",
  optionLabels: ["Yes", "No"],
  appId: "123",
  creatorWallet: voteStateActive.creator,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("VoteDetail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows skeleton while loading, then displays stake in ALGO", async () => {
    mockGetVoteState.mockResolvedValue(voteStateActive);

    render(<VoteDetail metadata={metadata} />);

    // Skeletons visible before data arrives — shadcn Skeleton uses data-slot="skeleton"
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);

    // Wait for stake info to appear
    await waitFor(() => {
      // StatCard renders value and sub-label in separate elements
      expect(screen.getByText("1.0257 ALGO")).toBeInTheDocument();
      expect(screen.getByText("refundable (stake + storage)")).toBeInTheDocument();
    });
  });

  it("displays the withdraw deadline warning only when the user has voted", async () => {
    mockGetVoteState.mockResolvedValue(voteStateEnded);

    const mockModule = jest.requireMock("@txnlab/use-wallet-react");
    mockModule.useWallet = () => ({
      activeAddress: "VOTER000000000000000000000000000000000000000000000000000",
    });

    mockGetUserState.mockResolvedValue({
      voted: true,
      choice: 0n,
      stakeLocked: 1_000_000n,
      withdrawn: false,
    });

    render(<VoteDetail metadata={metadata} />);

    await waitFor(() => {
      expect(screen.getByText(/your refund goes to/i)).toBeInTheDocument();
    });
  });

  it("hides the withdraw deadline warning when the user has not voted", async () => {
    mockGetVoteState.mockResolvedValue(voteStateEnded);
    // default: no activeAddress, no userState

    render(<VoteDetail metadata={metadata} />);

    await waitFor(() => {
      expect(screen.queryByText(/your stake goes to/i)).not.toBeInTheDocument();
    });
  });

  it("passes disabled=true to VoteForm when user has already voted", async () => {
    mockGetVoteState.mockResolvedValue(voteStateActive);

    // Simulate active wallet with a vote cast
    const mockModule = jest.requireMock("@txnlab/use-wallet-react");
    mockModule.useWallet = () => ({
      activeAddress: "VOTER000000000000000000000000000000000000000000000000000",
    });

    mockGetUserState.mockResolvedValue({
      voted: true,
      choice: 0n,
      stakeLocked: 1_000_000n,
      withdrawn: false,
    });

    render(<VoteDetail metadata={metadata} />);

    await waitFor(() => {
      const form = screen.getByTestId("vote-form");
      expect(form).toHaveAttribute("data-disabled", "true");
    });
  });

  it("shows unavailable message when on-chain data is missing", async () => {
    mockGetVoteState.mockResolvedValue(null);

    render(<VoteDetail metadata={metadata} />);

    await waitFor(() => {
      expect(screen.getByText(/on-chain data unavailable/i)).toBeInTheDocument();
    });
  });
});
