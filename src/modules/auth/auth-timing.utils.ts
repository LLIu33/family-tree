const DUMMY_PASSWORD = "timing-pad-not-a-real-password";

let dummyHashPromise: Promise<string> | null = null;

export async function getDummyPasswordHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = import("bcrypt").then((bcrypt) =>
      bcrypt.hash(DUMMY_PASSWORD, 10),
    );
  }
  return dummyHashPromise;
}

export async function padLoginTiming(password: string): Promise<void> {
  const bcrypt = await import("bcrypt");
  const dummyHash = await getDummyPasswordHash();
  await bcrypt.compare(password, dummyHash);
}

export async function padRegisterTiming(password: string): Promise<void> {
  const bcrypt = await import("bcrypt");
  await bcrypt.hash(password, 10);
}
