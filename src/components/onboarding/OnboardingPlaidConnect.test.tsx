/** @vitest-environment happy-dom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type LinkConfig = {
  token: string | null;
  onSuccess: (publicToken: string, metadata: unknown) => Promise<void>;
  onExit: () => void;
};

let linkConfig: LinkConfig | null = null;
const openLink = vi.fn();

vi.mock("react-plaid-link", () => ({
  usePlaidLink: (config: LinkConfig) => {
    linkConfig = config;
    return { open: openLink, ready: Boolean(config.token) };
  },
}));

import {
  OnboardingPlaidConnect,
  type OnboardingPlaidResult,
} from "@/components/onboarding/OnboardingPlaidConnect";

const STORE_ID = "store-123";
const METADATA = {
  accounts: [{ id: "acct-1", name: "Checking", mask: "0001", type: "depository", subtype: "checking" }],
};

let container: HTMLDivElement;
let root: Root;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text)
  );
}

async function render(props: {
  result?: OnboardingPlaidResult | null;
  onConnected?: (r: OnboardingPlaidResult) => void;
}) {
  await act(async () => {
    root.render(
      <OnboardingPlaidConnect
        storeId={STORE_ID}
        result={props.result ?? null}
        onConnected={props.onConnected ?? (() => undefined)}
      />
    );
  });
}

/** Walk the real UI: Connect your bank -> trust panel -> Continue with Plaid. */
async function startConnectFlow() {
  await act(async () => {
    buttonByText("Connect your bank")!.click();
  });
  await act(async () => {
    buttonByText("Continue with Plaid")!.click();
  });
  await flush();
}

beforeEach(() => {
  linkConfig = null;
  openLink.mockReset();
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

describe("OnboardingPlaidConnect", () => {
  it("leads with a green recommended connect button and the read-only hint", async () => {
    await render({});

    const button = buttonByText("Connect your bank");
    expect(button).toBeDefined();
    expect(button!.className).toContain("btn-primary");
    expect(container.textContent).toContain("Recommended");
    expect(container.textContent).toContain("Secured by Plaid");
    expect(container.textContent).not.toContain("Your bank connection is secure");
  });

  it("shows the trust step before anything is requested", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await render({});

    await act(async () => {
      buttonByText("Connect your bank")!.click();
    });

    expect(container.textContent).toContain("Your bank connection is secure");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets the user back out of the trust step without connecting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await render({});

    await act(async () => {
      buttonByText("Connect your bank")!.click();
    });
    await act(async () => {
      buttonByText("Not now")!.click();
    });

    expect(container.textContent).not.toContain("Your bank connection is secure");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests a link token for this store and opens Plaid Link", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ link_token: "link-abc" }));
    vi.stubGlobal("fetch", fetchMock);
    await render({});

    await startConnectFlow();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/plaid/create-link-token",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ storeId: STORE_ID }) })
    );
    expect(linkConfig?.token).toBe("link-abc");
    expect(openLink).toHaveBeenCalledTimes(1);
  });

  it("saves the connection, runs one first sync, then reports the result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ link_token: "link-abc" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, institution_name: "EastRise" }))
      .mockResolvedValueOnce(jsonResponse({ added: 42 }));
    vi.stubGlobal("fetch", fetchMock);
    const onConnected = vi.fn();
    await render({ onConnected });
    await startConnectFlow();

    await act(async () => {
      await linkConfig!.onSuccess("public-token", METADATA);
    });

    const [exchangeUrl, exchangeInit] = fetchMock.mock.calls[1];
    expect(exchangeUrl).toBe("/api/plaid/exchange-token");
    expect(JSON.parse(exchangeInit.body)).toEqual({
      storeId: STORE_ID,
      public_token: "public-token",
      accounts: [
        { id: "acct-1", name: "Checking", mask: "0001", type: "depository", subtype: "checking" },
      ],
    });
    const [syncUrl, syncInit] = fetchMock.mock.calls[2];
    expect(syncUrl).toBe("/api/plaid/sync-transactions");
    expect(JSON.parse(syncInit.body)).toEqual({ storeId: STORE_ID });
    expect(onConnected).toHaveBeenCalledWith({ institutionName: "EastRise", transactionsAdded: 42 });
  });

  it("keeps the connection when the first sync fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ link_token: "link-abc" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, institution_name: "EastRise" }))
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, false, 500));
    vi.stubGlobal("fetch", fetchMock);
    const onConnected = vi.fn();
    await render({ onConnected });
    await startConnectFlow();

    await act(async () => {
      await linkConfig!.onSuccess("public-token", METADATA);
    });

    expect(onConnected).toHaveBeenCalledWith({ institutionName: "EastRise", transactionsAdded: null });
  });

  it("does not report a connection when saving it fails, and shows the error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ link_token: "link-abc" }))
      .mockResolvedValueOnce(jsonResponse({ error: "Failed to connect bank account" }, false, 500));
    vi.stubGlobal("fetch", fetchMock);
    const onConnected = vi.fn();
    await render({ onConnected });
    await startConnectFlow();

    await act(async () => {
      await linkConfig!.onSuccess("public-token", METADATA);
    });

    expect(onConnected).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Failed to connect bank account");
    expect(buttonByText("Connect your bank")).toBeDefined();
  });

  it("shows an error and stays usable when the link token request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "Disconnect QuickBooks first" }, false, 409));
    vi.stubGlobal("fetch", fetchMock);
    await render({});

    await startConnectFlow();

    expect(container.textContent).toContain("Disconnect QuickBooks first");
    expect(openLink).not.toHaveBeenCalled();
    expect(buttonByText("Connect your bank")!.disabled).toBe(false);
  });

  it("returns to the start when the user closes Plaid Link", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ link_token: "link-abc" }));
    vi.stubGlobal("fetch", fetchMock);
    await render({});
    await startConnectFlow();

    await act(async () => {
      linkConfig!.onExit();
    });

    expect(linkConfig?.token).toBeNull();
    expect(buttonByText("Connect your bank")!.disabled).toBe(false);
  });

  it("shows the connected state with the transaction count", async () => {
    await render({ result: { institutionName: "EastRise", transactionsAdded: 42 } });

    expect(container.textContent).toContain("EastRise is connected");
    expect(container.textContent).toContain("We pulled in 42 transactions");
    expect(buttonByText("Connect your bank")).toBeUndefined();
  });

  it("explains that transactions are on the way when the first sync did not finish", async () => {
    await render({ result: { institutionName: null, transactionsAdded: null } });

    expect(container.textContent).toContain("Your bank is connected");
    expect(container.textContent).toContain("on their way");
  });
});
