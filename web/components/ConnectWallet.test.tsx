import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectWallet } from "./ConnectWallet";

// ─── Mock useWallet ────────────────────────────────────────────────────────────

const mockDisconnect = jest.fn();
const mockConnect = jest.fn();

const mockWallets = [
  {
    id: "pera",
    metadata: { name: "Pera" },
    connect: mockConnect,
    disconnect: mockDisconnect,
  },
  {
    id: "defly",
    metadata: { name: "Defly" },
    connect: mockConnect,
    disconnect: mockDisconnect,
  },
];

const mockUseWallet = jest.fn();

jest.mock("@txnlab/use-wallet-react", () => ({
  useWallet: () => mockUseWallet(),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ConnectWallet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows connect buttons for each wallet when not connected", async () => {
    mockUseWallet.mockReturnValue({
      wallets: mockWallets,
      activeAddress: null,
      activeWallet: null,
    });

    const user = userEvent.setup();
    render(<ConnectWallet />);

    // Component shows a single "Connect Wallet" button that opens a modal
    await user.click(screen.getByText("Connect Wallet"));

    expect(screen.getByText("Pera")).toBeInTheDocument();
    expect(screen.getByText("Defly")).toBeInTheDocument();
  });

  it("shows truncated address and Disconnect button when connected", () => {
    const address = "ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12";
    mockUseWallet.mockReturnValue({
      wallets: mockWallets,
      activeAddress: address,
      activeWallet: { disconnect: mockDisconnect },
    });

    render(<ConnectWallet />);

    // slice(0,6) = "ABCDEF", slice(-4) = "EF12"
    expect(screen.getByText(/ABCDEF…EF12/)).toBeInTheDocument();
    expect(screen.getByText("Disconnect")).toBeInTheDocument();
    expect(screen.queryByText("Connect Pera")).not.toBeInTheDocument();
  });

  it("calls disconnect() when Disconnect button is clicked", async () => {
    const address = "ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12";
    mockUseWallet.mockReturnValue({
      wallets: mockWallets,
      activeAddress: address,
      activeWallet: { disconnect: mockDisconnect },
    });

    const user = userEvent.setup();
    render(<ConnectWallet />);

    await user.click(screen.getByText("Disconnect"));

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
