import { deflateRawSync, inflateRawSync } from "node:zlib";

/** Opaque continuation tokens for the AI connector: compressed JSON. They hold only Drive IDs and counters. */
export function packCursor(state: object): string {
  return deflateRawSync(Buffer.from(JSON.stringify(state))).toString("base64url");
}

export function unpackCursor<T>(token: string, kind: string): T {
  try {
    const state = JSON.parse(inflateRawSync(Buffer.from(token, "base64url")).toString("utf8"));
    if (state.k !== kind) throw new Error();
    return state as T;
  } catch {
    throw new Error("That continue_token isn't valid. Start again without it.");
  }
}
