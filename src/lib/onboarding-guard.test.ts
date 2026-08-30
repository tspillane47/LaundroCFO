import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Faithful copy of OnboardingGuard's redirect decision in layout.tsx.
 * Step 0 cannot import the unexported Guard; these tests lock today's matrix
 * and fail if layout.tsx drifts (source assertions below).
 */
const ONBOARDING_EXEMPT_PATHS = [
  "/terms",
  "/privacy",
  "/",
  "/about",
  "/pricing",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/auth/confirm",
  "/auth/auth-code-error",
  "/onboarding",
];

type GuardAction = "allow" | "/portfolio" | "/onboarding";

function isOnboardingGuardExempt(pathname: string): boolean {
  return (
    ONBOARDING_EXEMPT_PATHS.includes(pathname) ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/auth/confirm") ||
    pathname.startsWith("/auth/auth-code-error")
  );
}

function resolveOnboardingGuardAction({
  hasUser,
  complete,
  pathname,
  addStore,
}: {
  hasUser: boolean;
  complete: boolean;
  pathname: string;
  addStore?: boolean;
}): GuardAction {
  const isExempt = isOnboardingGuardExempt(pathname);
  const isAddingStore = pathname === "/onboarding" && addStore === true;

  if (!hasUser) return "allow";

  if (complete) {
    if (pathname === "/onboarding" && !isAddingStore) return "/portfolio";
    return "allow";
  }

  if (!isExempt) return "/onboarding";
  return "allow";
}

const layoutSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/layout.tsx"),
  "utf8"
);

describe("OnboardingGuard redirect matrix (current HEAD)", () => {
  it("allows the tree when there is no signed-in user", () => {
    expect(
      resolveOnboardingGuardAction({
        hasUser: false,
        complete: false,
        pathname: "/dashboard",
      })
    ).toBe("allow");
  });

  it("redirects incomplete users off protected pages to /onboarding", () => {
    expect(
      resolveOnboardingGuardAction({
        hasUser: true,
        complete: false,
        pathname: "/dashboard",
      })
    ).toBe("/onboarding");
  });

  it("allows incomplete users to stay on /onboarding", () => {
    expect(
      resolveOnboardingGuardAction({
        hasUser: true,
        complete: false,
        pathname: "/onboarding",
      })
    ).toBe("allow");
  });

  it("allows incomplete users to stay on exempt auth pages", () => {
    expect(
      resolveOnboardingGuardAction({
        hasUser: true,
        complete: false,
        pathname: "/login",
      })
    ).toBe("allow");
  });

  it("redirects complete users away from /onboarding without ?add=true", () => {
    expect(
      resolveOnboardingGuardAction({
        hasUser: true,
        complete: true,
        pathname: "/onboarding",
      })
    ).toBe("/portfolio");
  });

  it("allows complete users on /onboarding?add=true (add-store and switch=own)", () => {
    expect(
      resolveOnboardingGuardAction({
        hasUser: true,
        complete: true,
        pathname: "/onboarding",
        addStore: true,
      })
    ).toBe("allow");
  });

  it("allows complete users on /portfolio", () => {
    expect(
      resolveOnboardingGuardAction({
        hasUser: true,
        complete: true,
        pathname: "/portfolio",
      })
    ).toBe("allow");
  });

  it("treats join-path completion the same as own-path for /onboarding without ?add", () => {
    expect(
      resolveOnboardingGuardAction({
        hasUser: true,
        complete: true,
        pathname: "/onboarding",
      })
    ).toBe("/portfolio");
  });
});

describe("OnboardingGuard source lock in layout.tsx", () => {
  it("still computes isAddingStore from pathname + add=true", () => {
    expect(layoutSource).toContain(
      'const isAddingStore = pathname === "/onboarding" && searchParams.get("add") === "true"'
    );
  });

  it("still redirects complete users on /onboarding only when not adding a store", () => {
    expect(layoutSource).toContain("if (pathname === \"/onboarding\" && !isAddingStore)");
    expect(layoutSource).toContain('replaceFullDocument("/portfolio")');
  });

  it("still redirects incomplete users off non-exempt paths to /onboarding", () => {
    expect(layoutSource).toContain("if (!isExempt)");
    expect(layoutSource).toContain('router.replace("/onboarding")');
  });

  it("still allows the tree when getUser returns no user", () => {
    expect(layoutSource).toContain("if (!user) {\n        setChecked(true);\n        return;");
  });

  it("still lists /onboarding among exempt paths", () => {
    expect(layoutSource).toContain('"/onboarding"');
    expect(layoutSource).toContain("onboardingExemptPaths.includes(pathname)");
  });
});

describe("Next.js prefetch/middleware redirect cache guards", () => {
  const logoSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../components/ui/Logo.tsx"),
    "utf8"
  );
  const middlewareSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../middleware.ts"),
    "utf8"
  );
  const onboardingSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../app/onboarding/page.tsx"),
    "utf8"
  );

  it("Logo does not prefetch /portfolio (onboarding header would cache a stale middleware redirect)", () => {
    expect(logoSource).toContain('href="/portfolio"');
    expect(logoSource).toContain("prefetch={false}");
  });

  it("middleware opts auth redirects out of the Next.js prefetch cache", () => {
    expect(middlewareSource).toContain("x-middleware-cache");
    expect(middlewareSource).toContain("no-cache");
    expect(middlewareSource).toContain("function redirectNoCache");
  });

  it("onboarding completion navigates with a full document replace, not router.replace", () => {
    expect(onboardingSource).toContain("replaceFullDocument(destination)");
    expect(onboardingSource).toContain('replaceFullDocument("/portfolio")');
    expect(onboardingSource).not.toContain('router.replace("/portfolio")');
    expect(onboardingSource).not.toContain("router.replace(destination)");
  });
});
