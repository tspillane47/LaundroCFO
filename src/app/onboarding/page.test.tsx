/** @vitest-environment happy-dom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("add=true"),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-1", email: "owner@example.com" } },
      }),
    },
    from() {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve);
      return builder;
    },
  }),
}));

vi.mock("@/lib/useAccessStatus", () => ({
  useAccessStatus: () => ({
    plan: "starter",
    maxStores: 3,
    storeCount: 0,
    isReadOnly: false,
    reason: "trialing",
    trialEndsAt: null,
    currentPeriodEnd: null,
    loading: false,
    refresh: async () => undefined,
  }),
  invalidateAccessStatusCache: () => undefined,
}));

vi.mock("@/lib/onboarding", () => ({
  completeOnboarding: vi.fn(),
  fetchOnboardingProfile: vi.fn(),
  invalidateOnboardingStatusCache: vi.fn(),
  isOnboardingAlreadySavedForPath: () => false,
  isOnboardingComplete: vi.fn(async () => false),
  JOIN_STORE_SETTINGS_HINT: "Ask the owner to add you.",
}));

vi.mock("@/components/onboarding/OnboardingPlaidConnect", () => ({
  OnboardingPlaidConnect: ({
    onConnected,
    result,
  }: {
    onConnected: (result: {
      institutionName: string | null;
      transactionsAdded: number | null;
    }) => void;
    result: { institutionName: string | null } | null;
  }) =>
    result ? (
      <div>EastRise is connected</div>
    ) : (
      <button
        type="button"
        onClick={() => onConnected({ institutionName: "EastRise", transactionsAdded: 4 })}
      >
        Connect your bank
      </button>
    ),
}));

import OnboardingPage from "@/app/onboarding/page";
import { ToastProvider } from "@/components/ui/ToastProvider";

let container: HTMLDivElement;
let root: Root;

function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text)
  );
}

async function clickButton(text: string) {
  const button = buttonByText(text);
  if (!button) throw new Error(`No button containing "${text}"`);
  await act(async () => {
    button.click();
  });
}

async function waitForText(text: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error(`Timed out waiting for "${text}". Saw: ${container.textContent?.slice(0, 400)}`);
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function renderWizard() {
  await act(async () => {
    root.render(
      <ToastProvider>
        <OnboardingPage />
      </ToastProvider>
    );
  });
  await waitForText("Tell us about your store");
}

async function createStoreAndOpenBankStep() {
  const input = container.querySelector("#onboarding-storename") as HTMLInputElement;
  await act(async () => {
    setNativeValue(input, "Main Street Laundry");
  });
  await clickButton("Next →");
  await waitForText("The fastest way to see your real numbers");
}

beforeEach(() => {
  window.scrollTo = () => undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/stores")) {
        return { ok: true, status: 200, json: async () => ({ id: "store-1" }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    })
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("onboarding step order", () => {
  it("shows the bank step before occupancy, and Back returns to the previous step", async () => {
    await renderWizard();
    await createStoreAndOpenBankStep();

    const text = container.textContent ?? "";
    expect(text).toContain("Connect your bank");
    expect(text).toContain("Step 3 of 4");
    expect(text).not.toContain("Do you own or lease your location?");
    expect(text.indexOf("Financials")).toBeLessThan(text.indexOf("Occupancy"));
    expect(buttonByText("Skip for now")).toBeDefined();
    expect(buttonByText("I'll add this later")).toBeUndefined();

    await clickButton("Next →");
    await waitForText("Do you own or lease your location?");

    expect(container.textContent).toContain("Step 4 of 4");
    expect(container.textContent).not.toContain("The fastest way to see your real numbers");
    expect(buttonByText("I'll add this later")).toBeDefined();
    expect(buttonByText("Continue →")).toBeDefined();

    await clickButton("← Back");
    await waitForText("The fastest way to see your real numbers");
    expect(container.textContent).toContain("Step 3 of 4");
    expect(container.textContent).not.toContain("Do you own or lease your location?");

    await clickButton("← Back");
    await waitForText("Tell us about your store");
    expect(container.textContent).not.toContain("Connect your bank");
  });

  it("reaches the completion screen when occupancy is skipped", async () => {
    await renderWizard();
    await createStoreAndOpenBankStep();
    await clickButton("Skip for now");
    await waitForText("Do you own or lease your location?");

    await clickButton("I'll add this later");
    await waitForText("Store added!");

    expect(container.textContent).toContain(
      "Your new store is in your portfolio — add more data anytime to unlock its full valuation."
    );
    expect(container.textContent).not.toContain("Do you own or lease your location?");
  });

  it("hides bank skip after a connection and still mentions the bank on completion", async () => {
    await renderWizard();
    await createStoreAndOpenBankStep();

    expect(buttonByText("Skip for now")).toBeDefined();
    await clickButton("Connect your bank");
    expect(container.textContent).toContain("EastRise is connected");
    expect(buttonByText("Skip for now")).toBeUndefined();
    expect(buttonByText("Can't connect a bank right now?")).toBeUndefined();

    await clickButton("Next →");
    await waitForText("Do you own or lease your location?");
    await clickButton("I'll add this later");
    await waitForText("Your bank is connected");

    expect(container.textContent).toContain(
      "Your bank is connected. Next, sort your transactions into categories and your real numbers will show up on your dashboard."
    );
  });
});
