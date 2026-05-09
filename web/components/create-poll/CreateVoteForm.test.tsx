import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateVoteForm } from "./CreateVoteForm";

// ─── Mock useWallet ────────────────────────────────────────────────────────────

const mockSignData = jest.fn();
const mockTransactionSigner = jest.fn();
const mockUseWallet = jest.fn();

jest.mock("@txnlab/use-wallet-react", () => ({
  useWallet: () => mockUseWallet(),
  ScopeType: { AUTH: 1 },
}));

// ─── Mock contract-client ─────────────────────────────────────────────────────

const mockBuildCreateVoteAtc = jest.fn();
jest.mock("@/lib/contract-client", () => ({
  buildCreateVoteAtc: (...args: unknown[]) => mockBuildCreateVoteAtc(...args),
}));

// ─── Mock algorand ────────────────────────────────────────────────────────────

const mockFetchAppConfig = jest.fn();

jest.mock("@/lib/algorand", () => ({
  getAlgodClient: jest.fn(() => ({})),
  fetchAppConfig: (...args: unknown[]) => mockFetchAppConfig(...args),
  MICRO_ALGO: 1_000_000,
  VOTE_BOX_MBR: 57_300n,
  CREATE_VOTE_TX_FEE: 2_000n,
}));

// ─── Mock signatures ──────────────────────────────────────────────────────────

jest.mock("@/lib/signatures", () => ({
  buildCreationMessage: jest.fn(
    () => "ProofVote: create metadata for appId=123456789 voteId=1 slug=test"
  ),
}));

// ─── Mock next/navigation (already set up in jest.setup.ts) ──────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/title/i), "My Test Vote");
  // Slug is auto-generated from title; no editable slug field
  // Options already have 2 placeholders; fill them
  const optionInputs = screen.getAllByPlaceholderText(/option \d/i);
  await user.type(optionInputs[0], "Yes");
  await user.type(optionInputs[1], "No");

  // Set a valid end time
  const endInput = screen.getByLabelText("End");
  await user.clear(endInput);
  await user.type(endInput, "2030-01-02T10:00");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CreateVoteForm", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockUseWallet.mockReturnValue({
      activeAddress: "CREATOR0000000000000000000000000000000000000000000000000",
      transactionSigner: mockTransactionSigner,
      signData: mockSignData,
    });
    mockFetchAppConfig.mockResolvedValue({
      platformOwner: "PLATFORM0000000000000000000000000000000000000000000000000",
      defaultStake: 1_000_000n,
      defaultWithdrawWindow: 604_800n,
    });
  });

  it("shows error when title is empty", async () => {
    const user = userEvent.setup();
    render(<CreateVoteForm />);

    // Submit without filling anything
    await user.click(screen.getByRole("button", { name: /create vote/i }));

    await waitFor(() => {
      expect(screen.getByText("Title is required")).toBeInTheDocument();
    });
  });

  it("shows error when fewer than 2 options are provided", async () => {
    const user = userEvent.setup();
    render(<CreateVoteForm />);

    await user.type(screen.getByLabelText(/title/i), "Test");
    // Slug is auto-generated from title; no editable slug field
    // Leave both option fields empty → validation fails

    await user.click(screen.getByRole("button", { name: /create vote/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 2 options/i)).toBeInTheDocument();
    });
  });

  it("shows error when endAt is missing", async () => {
    const user = userEvent.setup();
    render(<CreateVoteForm />);

    await user.type(screen.getByLabelText(/title/i), "Test");

    const optionInputs = screen.getAllByPlaceholderText(/option \d/i);
    await user.type(optionInputs[0], "Yes");
    await user.type(optionInputs[1], "No");

    // Leave endAt empty and submit — expects the required validation error
    await user.click(screen.getByRole("button", { name: /create vote/i }));

    await waitFor(() => {
      expect(screen.getByText("End time is required")).toBeInTheDocument();
    });
  });

  it("calls buildCreateVoteAtc and navigates on successful submission", async () => {
    const user = userEvent.setup();
    const mockExecute = jest.fn().mockResolvedValue({
      methodResults: [{ returnValue: 1n }],
    });
    mockBuildCreateVoteAtc.mockResolvedValue({ execute: mockExecute });
    mockSignData.mockResolvedValue({ signature: new Uint8Array(64) });

    // Slug check returns 404 (slug not taken), then POST succeeds
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ voteId: "1" }),
      });

    render(<CreateVoteForm />);
    await fillValidForm(user);

    await user.click(screen.getByRole("button", { name: /create vote/i }));

    await waitFor(() => {
      expect(mockBuildCreateVoteAtc).toHaveBeenCalled();
      expect(mockSignData).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/votes",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("shows submit error when API returns an error", async () => {
    const user = userEvent.setup();
    mockBuildCreateVoteAtc.mockResolvedValue({
      execute: jest.fn().mockResolvedValue({ methodResults: [{ returnValue: 1n }] }),
    });
    mockSignData.mockResolvedValue({ signature: new Uint8Array(64) });

    // Slug check returns 404 (not taken), then POST fails
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Duplicate slug" }),
      });

    render(<CreateVoteForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create vote/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Coś poszło nie tak, spróbuj jeszcze raz.");
    });
  });
});
