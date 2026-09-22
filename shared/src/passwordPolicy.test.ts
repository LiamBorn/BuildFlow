/**
 * The password policy, which is shared for a reason: the meter someone watches while typing
 * and the check the server enforces are the same two functions, so they cannot drift into
 * disagreeing. That is the property most worth pinning here — a meter that says "Strong"
 * about a password the signup route will reject is worse than no meter.
 */
import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH, passwordProblem, passwordStrength } from "./passwordPolicy";

describe("what the policy refuses", () => {
  it("wants a length before anything else", () => {
    expect(passwordProblem("short")).toMatch(/at least 8/);
    expect(passwordProblem("")).toMatch(/at least 8/);
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    // Long enough and unremarkable: nothing to say about it.
    expect(passwordProblem("quiet-harbour-41")).toBeNull();
  });

  it("refuses the passwords that are in every breach list", () => {
    expect(passwordProblem("password")).toMatch(/too common/i);
    expect(passwordProblem("12345678")).toMatch(/too common/i);
    expect(passwordProblem("buildflow")).toMatch(/too common/i);
    expect(passwordProblem("PASSWORD123"), "case is not a disguise").toMatch(/too common/i);
  });

  /**
   * The punctuation rule: the blocklist is checked again with everything non-alphanumeric
   * removed, so punctuation ADDED to a common password does not get it through.
   */
  it("sees through punctuation sprinkled into a common password", () => {
    expect(passwordProblem("p-a-s-s-w-o-r-d")).toMatch(/too common/i);
    expect(passwordProblem("admin.123")).toMatch(/too common/i);
    expect(passwordProblem("password!!!")).toMatch(/too common/i);
  });

  /**
   * Substitution, which stripping cannot undo on its own: "P@ssword" strips to "pssword",
   * not "password", because the @ stands in for the a rather than being extra. Closed by
   * folding the confusable characters on BOTH the candidate and the list before comparing.
   * All three of these were accepted until 2026-09-22.
   */
  it("sees through letter-for-symbol substitution", () => {
    expect(passwordProblem("P@ssword"), "@ for a").toMatch(/too common/i);
    expect(passwordProblem("Dr@gon123"), "@ for a").toMatch(/too common/i);
    expect(passwordProblem("M0nkey123"), "0 for o").toMatch(/too common/i);
    expect(passwordProblem("passw0rd"), "the hand-listed forms still work").toMatch(/too common/i);
    expect(passwordProblem("5unshine"), "5 for s").toMatch(/too common/i);
    expect(passwordProblem("l3tmein1"), "3 for e").toMatch(/too common/i);
  });

  /** The ambiguous ones fold both ways, so it does not matter which direction the swap went. */
  it("does not care which way round an i / l / 1 swap was made", () => {
    expect(passwordProblem("1etmein1")).toMatch(/too common/i);
    expect(passwordProblem("letmeinl")).toMatch(/too common/i);
    expect(passwordProblem("!etmein1")).toMatch(/too common/i);
  });

  /**
   * The risk folding introduces is the opposite one: refusing a password that is fine. The
   * comparison is a whole-string match against forty terrible passwords, so a collision
   * needs the WHOLE candidate to fold onto one of them — but it is worth holding down,
   * because a signup form that rejects good passwords is its own kind of broken.
   */
  it("still accepts passwords that merely contain the same letters", () => {
    for (const good of [
      "quiet-harbour-41",
      "Quiet-Harbour-4141",
      "asphalt-yard-north",
      "concrete-pour-tuesday",
      "my-password-is-long",
      "dragonfly-season-9",
      "monkeybars-and-swings",
      "Tr0ubador&3",
      "sunshine-on-the-yard",
      "footballs-in-a-crate"
    ]) {
      expect(passwordProblem(good), `"${good}" is not a common password`).toBeNull();
    }
  });

  it("refuses a password built out of the person's own address", () => {
    expect(passwordProblem("dana-and-more", "dana@asphaltco.com")).toMatch(/email address/i);
    expect(passwordProblem("xxDANAxx-2026", "dana@asphaltco.com"), "case again").toMatch(/email address/i);
    // The rest of the address is not the rule — only the part before the @.
    expect(passwordProblem("asphaltco-yard", "dana@asphaltco.com")).toBeNull();
  });

  it("ignores a local part too short to mean anything", () => {
    // "ab" appears inside half the words in English; a 2-character local part is not a signal.
    expect(passwordProblem("absolutely-fine", "ab@asphaltco.com")).toBeNull();
    expect(passwordProblem("ann-is-here-ok", "ann@asphaltco.com"), "three is the threshold").toMatch(/email address/i);
  });

  it("does not look for an address when it was not given one", () => {
    expect(passwordProblem("quiet-harbour-41")).toBeNull();
    expect(passwordProblem("quiet-harbour-41", "")).toBeNull();
    expect(passwordProblem("quiet-harbour-41", "   ")).toBeNull();
  });
});

describe("the strength meter", () => {
  it("says nothing at all about an empty box", () => {
    const empty = passwordStrength("");
    expect(empty.score).toBe(0);
    expect(empty.label, "an empty field should not be scolded before anything is typed").toBe("");
  });

  it("climbs with length and variety", () => {
    // Nothing the policy objects to, so the score is earned by shape alone. A hyphen counts
    // as a fourth character class, which is easy to miscount when reading these.
    expect(passwordStrength("Tr0ubador&3").score, "11 chars, 4 classes — too short for the length bonus").toBe(2);
    expect(passwordStrength("QuietHarbour4").score, "13 chars, 3 classes").toBe(3);
    expect(passwordStrength("Quietharbour412").score, "15 chars, still only 3 classes").toBe(3);
    expect(passwordStrength("Quiet-Harbour41").score, "15 chars and 4 classes clears the last step").toBe(4);
    expect(passwordStrength("quiet-harbour-41").score, "16 chars clears it on length alone").toBe(4);
  });

  it("labels each score, and the top of the scale is reachable", () => {
    expect(passwordStrength("Quiet-Harbour41").label).toBe("Very strong");
    expect(passwordStrength("QuietHarbour4").label).toBe("Strong");
    expect(passwordStrength("Tr0ubador&3").label).toBe("Fair");
  });

  it("pins anything the policy objects to at the bottom, whatever its shape", () => {
    // Long enough, several character classes, and still refused — the meter must not flatter it.
    const dressedUp = passwordStrength("admin.123");
    expect(dressedUp.problem).toMatch(/too common/i);
    expect(dressedUp.score).toBeLessThanOrEqual(1);
    expect(dressedUp.label).toBe("Too weak");
  });
});

describe("the meter and the gate never disagree", () => {
  /**
   * The whole reason this module is shared. If these two ever answered differently, the form
   * would encourage a password the signup route then refuses — or, worse, discourage one it
   * would have accepted.
   */
  it("reports exactly the problem the gate would give, for every kind of input", () => {
    const emails = ["", "dana@asphaltco.com"];
    const candidates = [
      "",
      "a",
      "short",
      "password",
      "P@ssword",
      "12345678",
      "dana-and-more",
      "quiet-harbour-41",
      "Quiet-Harbour-4141",
      "        ",
      "🧱🧱🧱🧱🧱🧱🧱🧱"
    ];
    for (const email of emails) {
      for (const candidate of candidates) {
        expect(passwordStrength(candidate, email).problem, `"${candidate}" with "${email}"`).toBe(passwordProblem(candidate, email));
      }
    }
  });

  it("never reports a score above the bottom while a problem stands", () => {
    for (const bad of ["short", "password", "admin.123", "dana-and-more"]) {
      const s = passwordStrength(bad, "dana@asphaltco.com");
      expect(s.problem, `"${bad}" should be refused`).not.toBeNull();
      expect(s.score, `"${bad}" must not be flattered`).toBeLessThanOrEqual(1);
    }
  });
});
