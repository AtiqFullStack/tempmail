export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/;
export function normalizeUsername(value: string): string {
  const name = value.toLowerCase();
  if (!USERNAME_PATTERN.test(name))
    throw new Error(
      "Use 1–64 letters, numbers, dots, underscores, + or hyphens; start and end with a letter or number.",
    );
  return name;
}
export function validateRecipient(value: string, domain: string): string {
  const parts = value.split("@");
  if (parts.length !== 2 || parts[1].toLowerCase() !== domain.toLowerCase())
    throw new Error("Unsupported recipient");
  return `${normalizeUsername(parts[0])}@${domain.toLowerCase()}`;
}
export const validId = (id: string) => /^[a-f0-9]{24}$/i.test(id);
