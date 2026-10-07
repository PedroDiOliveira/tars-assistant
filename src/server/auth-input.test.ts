import { describe, expect, it } from "vitest";
import { parseEmail, parseLogin, parseNewPassword, resetErrorMessage, signInErrorMessage } from "./auth-input";

const form = (values: { [key: string]: string | undefined }) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) if (v !== undefined) f.set(k, v);
  return f;
};

describe("parseLogin", () => {
  it("normaliza o e-mail (aparado, minúsculo) e preserva a senha como digitada", () => {
    expect(parseLogin(form({ email: "  Pedro@Tars.Example ", password: " Se nh@ " }))).toEqual({
      ok: true, email: "pedro@tars.example", password: " Se nh@ ",
    });
  });
  it("recusa e-mail inválido, vazio e senha vazia, com a mesma mensagem", () => {
    for (const values of [{ email: "x", password: "a" }, { email: "", password: "a" }, { email: "a@b.co", password: "" }, {}]) {
      expect(parseLogin(form(values))).toEqual({ ok: false, error: "Informe e-mail e senha." });
    }
  });
  it("não aceita campo que não seja texto (arquivo)", () => {
    const f = new FormData();
    f.set("email", new Blob(["x"]), "a.txt");
    f.set("password", "x");
    expect(parseLogin(f)).toMatchObject({ ok: false });
  });
  it("limita o tamanho da senha na entrada", () => {
    expect(parseLogin(form({ email: "a@b.co", password: "x".repeat(1025) }))).toMatchObject({ ok: false });
  });
});

describe("parseEmail", () => {
  it("válido e inválido", () => {
    expect(parseEmail(form({ email: "A@B.co" }))).toEqual({ ok: true, email: "a@b.co" });
    expect(parseEmail(form({ email: "nao-e-email" }))).toEqual({ ok: false, error: "Informe um e-mail válido." });
  });
});

describe("parseNewPassword", () => {
  const valid = { password: "uma-senha-longa", confirm: "uma-senha-longa", token_hash: "abcdef1234567890" };
  it("aceita senha forte, confirmação igual e token plausível", () => {
    expect(parseNewPassword(form(valid))).toEqual({ ok: true, password: "uma-senha-longa", tokenHash: "abcdef1234567890" });
  });
  it("exige 10+ caracteres e no máximo 72 (limite do bcrypt)", () => {
    expect(parseNewPassword(form({ ...valid, password: "curta", confirm: "curta" }))).toEqual({ ok: false, error: "A senha precisa ter pelo menos 10 caracteres." });
    const long = "x".repeat(73);
    expect(parseNewPassword(form({ ...valid, password: long, confirm: long }))).toEqual({ ok: false, error: "A senha pode ter no máximo 72 caracteres." });
    const edge = "x".repeat(72);
    expect(parseNewPassword(form({ ...valid, password: edge, confirm: edge }))).toMatchObject({ ok: true });
  });
  it("confirmação diferente", () => {
    expect(parseNewPassword(form({ ...valid, confirm: "outra-senha-longa" }))).toEqual({ ok: false, error: "As senhas não são iguais." });
  });
  it("token ausente ou com caracteres estranhos", () => {
    for (const token_hash of ["", "curto", "a b c d e f g h", "../../etc/passwd", "x".repeat(201)]) {
      expect(parseNewPassword(form({ ...valid, token_hash })), token_hash).toEqual({ ok: false, error: "Este link de redefinição não é válido. Peça um novo." });
    }
  });
});

describe("mensagens de erro de autenticação", () => {
  it("e-mail inexistente e senha errada são indistinguíveis (anti-enumeração)", () => {
    const unknownUser = signInErrorMessage({ status: 400, code: "invalid_credentials", message: "Invalid login credentials" });
    const wrongPassword = signInErrorMessage({ status: 400, code: "invalid_credentials", message: "Invalid login credentials" });
    expect(unknownUser).toBe(wrongPassword);
    expect(unknownUser).toBe("E-mail ou senha incorretos.");
    expect(signInErrorMessage({ status: 400, code: "email_not_confirmed" })).toBe("E-mail ou senha incorretos.");
  });
  it("limite de tentativas, rede e servidor indisponível", () => {
    expect(signInErrorMessage({ status: 429 })).toMatch(/Muitas tentativas/);
    expect(signInErrorMessage({ code: "over_request_rate_limit", status: 400 })).toMatch(/Muitas tentativas/);
    expect(signInErrorMessage({})).toMatch(/Sem conexão/);
    expect(signInErrorMessage({ status: 503 })).toMatch(/indisponível/);
  });
  it("redefinição: senha igual à atual, fraca, link vencido, rede", () => {
    expect(resetErrorMessage({ code: "same_password", status: 422 })).toBe("Escolha uma senha diferente da atual.");
    expect(resetErrorMessage({ code: "weak_password", status: 422 })).toMatch(/fraca/);
    expect(resetErrorMessage({ status: 403, code: "otp_expired" })).toMatch(/expirou ou já foi usado/);
    expect(resetErrorMessage({})).toMatch(/Sem conexão/);
    expect(resetErrorMessage({ status: 429 })).toMatch(/Muitas tentativas/);
  });
});
