import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";

// algosdk requires TextEncoder/TextDecoder — polyfill for jsdom environment
Object.assign(global, { TextEncoder, TextDecoder });

// Mock next/navigation globally so components that use useRouter etc. don't crash in tests
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
