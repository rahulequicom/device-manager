export function newPasswordError(password: string, confirmation: string) {
  if (!/^[0-9]{6}$/.test(password)) return "Choose a password containing exactly six digits.";
  if (password !== confirmation) return "Passwords do not match.";
  return null;
}
