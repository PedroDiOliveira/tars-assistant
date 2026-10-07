import { describe, expect, it } from "vitest";
import { userFromClaims, type ClaimsClient } from "./auth-claims";

const client = (result: Awaited<ReturnType<ClaimsClient["auth"]["getClaims"]>>): ClaimsClient => ({
  auth: { getClaims: async () => result },
});

describe("userFromClaims", () => {
  it("devolve o id (sub) e o e-mail do JWT verificado", async () => {
    expect(await userFromClaims(client({ data: { claims: { sub: "u-1", email: "pedro@tars.example" } }, error: null })))
      .toEqual({ id: "u-1", email: "pedro@tars.example" });
  });

  it("e-mail ausente vira null", async () => {
    expect(await userFromClaims(client({ data: { claims: { sub: "u-1" } }, error: null }))).toEqual({ id: "u-1", email: null });
  });

  it("sem sessão, com erro de verificação, ou sub inválido: nunca há usuário", async () => {
    expect(await userFromClaims(client({ data: null, error: null }))).toBeNull();
    expect(await userFromClaims(client({ data: null, error: new Error("jwt expired") }))).toBeNull();
    // mesmo que venha dado junto com o erro, o erro vence
    expect(await userFromClaims(client({ data: { claims: { sub: "u-1" } }, error: new Error("invalid signature") }))).toBeNull();
    expect(await userFromClaims(client({ data: { claims: {} }, error: null }))).toBeNull();
    expect(await userFromClaims(client({ data: { claims: { sub: "" } }, error: null }))).toBeNull();
    expect(await userFromClaims(client({ data: { claims: { sub: 42 as unknown as string } }, error: null }))).toBeNull();
  });
});
