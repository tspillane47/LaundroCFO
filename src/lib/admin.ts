export const ADMIN_EMAIL = "tuckerspillane7@gmail.com";

export function isAdminEmail(email: string | null | undefined): boolean {
  return email === ADMIN_EMAIL;
}
