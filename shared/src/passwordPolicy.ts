/* One password policy for the signup form and the signup route, so the meter
   the person watches while typing and the check the server enforces can never
   disagree. Deliberately small: length, a short blocklist of the passwords
   that show up in every breach corpus, and "not your own email". */

export const PASSWORD_MIN_LENGTH = 8;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "p@ssw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "letmein1",
  "welcome1",
  "iloveyou",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "monkey123",
  "dragon123",
  "abc12345",
  "111111111",
  "000000000",
  "admin123",
  "adminadmin",
  "changeme",
  "trustno1",
  "superman",
  "buildflow",
  "buildflow1",
  "construction",
  "contractor",
  "asphalt1",
  "concrete1",
  "1q2w3e4r",
  "zaq12wsx",
  "!@#$%^&*",
  "qwerty12",
  "master123",
  "shadow123",
  "michael1"
]);

/**
 * Fold the characters people swap for one another, so a substituted spelling of a listed
 * password lands on the same string the listed one does.
 *
 * Stripping punctuation — which is what this used to rely on alone — only removes
 * characters, so it catches punctuation ADDED to a common password ("p-a-s-s-w-o-r-d") and
 * never a SUBSTITUTION: "P@ssword" strips to "pssword", because the @ stands in for the a
 * rather than being extra. The list worked around that by naming a handful of substituted
 * forms by hand, which caught those exact strings and left "P@ssword", "Dr@gon123" and
 * "M0nkey123" accepted.
 *
 * The ambiguous ones are folded in BOTH directions — i, l, 1, ! and | all become "i" — so it
 * does not matter which way round the swap was made. Mapping happens BEFORE stripping,
 * because stripping would delete the @ first and there would be nothing left to map.
 */
function foldConfusables(value: string): string {
  return value
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/0/g, "o")
    .replace(/[1!|l]/g, "i")
    .replace(/3/g, "e")
    .replace(/[$5]/g, "s")
    .replace(/7/g, "t")
    .replace(/[^a-z0-9]/g, "");
}

/* The same folding applied to the list, so the two can be compared. Entries that fold down
   to almost nothing are left out: "!@#$%^&*" becomes "ias", and a three-character target is
   one an unrelated password could collide with. Those are still caught exactly, above. */
const COMMON_FOLDED = new Set([...COMMON_PASSWORDS].map(foldConfusables).filter((f) => f.length >= 6));

/**
 * Why a password is not acceptable, or null when it is. Messages are written
 * for the person typing, and the same string is what the server returns.
 */
export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  const lowered = password.toLowerCase();
  if (
    COMMON_PASSWORDS.has(lowered) ||
    COMMON_PASSWORDS.has(lowered.replace(/[^a-z0-9]/g, "")) ||
    COMMON_FOLDED.has(foldConfusables(password))
  ) {
    return "That password is too common. Pick something harder to guess.";
  }
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  if (local.length >= 3 && lowered.includes(local)) return "Don't use your email address in your password.";
  return null;
}

export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string; problem: string | null };

/** 0–4 strength for the meter. Any policy problem pins the score at 0 or 1. */
export function passwordStrength(password: string, email = ""): PasswordStrength {
  const problem = passwordProblem(password, email);
  if (password.length === 0) return { score: 0, label: "", problem };
  if (problem) return { score: password.length >= 4 ? 1 : 0, label: "Too weak", problem };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  let score = 1;
  if (password.length >= 12) score += 1;
  if (classes >= 3) score += 1;
  if (password.length >= 16 || (password.length >= 14 && classes === 4)) score += 1;
  const bounded = Math.min(4, score) as PasswordStrength["score"];
  return { score: bounded, label: ["Too weak", "Weak", "Fair", "Strong", "Very strong"][bounded], problem: null };
}
