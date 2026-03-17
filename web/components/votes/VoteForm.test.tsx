import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VoteForm } from "./VoteForm";

// ─── Mock useWallet ────────────────────────────────────────────────────────────

const mockTransactionSigner = jest.fn();
const mockUseWallet = jest.fn();

jest.mock("@txnlab/use-wallet-react", () => ({
  useWallet: () => mockUseWallet(),
}));

// ─── Mock contract-client ─────────────────────────────────────────────────────

const mockBuildVoteAtc = jest.fn();

jest.mock("@/lib/contract-client", () => ({
  buildVoteAtc: (...args: unknown[]) => mockBuildVoteAtc(...args),
}));

// ─── Mock algorand (getAlgodClient) ───────────────────────────────────────────

const mockExecute = jest.fn();

jest.mock("@/lib/algorand", () => ({
  getAlgodClient: jest.fn(() => ({})),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const defaultProps = {
  voteId: 1n,
  options: ["Yes", "No", "Abstain"],
  stake: 1_000_000n,
  disabled: false,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("VoteForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWallet.mockReturnValue({
      activeAddress: "VOTER000000000000000000000000000000000000000000000000000",
      transactionSigner: mockTransactionSigner,
    });
  });

  it("renders all option buttons", () => {
    render(<VoteForm {...defaultProps} />);

    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByText("Abstain")).toBeInTheDocument();
  });

  it("allows selecting an option", async () => {
    const user = userEvent.setup();
    render(<VoteForm {...defaultProps} />);

    const yesBtn = screen.getByText("Yes");
    await user.click(yesBtn);

    // After selection, Submit Vote should be enabled
    const submitBtn = screen.getByRole("button", { name: /submit vote/i });
    expect(submitBtn).not.toBeDisabled();
  });

  it("submit button is disabled when no option is selected", () => {
    render(<VoteForm {...defaultProps} />);

    expect(screen.getByRole("button", { name: /submit vote/i })).toBeDisabled();
  });

  it("calls buildVoteAtc with correct params on submit", async () => {
    const user = userEvent.setup();
    const mockAtc = { execute: mockExecute };
    mockBuildVoteAtc.mockResolvedValue(mockAtc);
    mockExecute.mockResolvedValue({});

    render(<VoteForm {...defaultProps} />);

    await user.click(screen.getByText("Yes"));
    await user.click(screen.getByRole("button", { name: /submit vote/i }));

    await waitFor(() => {
      expect(mockBuildVoteAtc).toHaveBeenCalledWith(
        expect.objectContaining({
          voteId: 1n,
          choice: 0n,
          stake: 1_000_000n,
        })
      );
    });
  });

  it("shows error message when transaction fails", async () => {
    const user = userEvent.setup();
    mockBuildVoteAtc.mockRejectedValue(new Error("Rejected by user"));

    render(<VoteForm {...defaultProps} />);

    await user.click(screen.getByText("Yes"));
    await user.click(screen.getByRole("button", { name: /submit vote/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Rejected by user");
    });
  });

  it("disables all controls and shows reason when disabled prop is set", () => {
    render(<VoteForm {...defaultProps} disabled disabledReason="You have already voted." />);

    expect(screen.getByText("You have already voted.")).toBeInTheDocument();
    const options = screen.getAllByRole("button");
    // All option buttons + Submit Vote button should be disabled
    options.forEach((btn) => expect(btn).toBeDisabled());
  });
});
