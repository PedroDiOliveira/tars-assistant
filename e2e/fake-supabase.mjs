/**
 * Supabase FALSO para os testes E2E do modo live: o suficiente de Auth (GoTrue) e PostgREST para o app real rodar
 * de ponta a ponta sem um projeto Supabase, usando as MIGRAÇÕES REAIS sobre o PGlite (Postgres em WASM).
 *
 *   Auth      POST /auth/v1/token (password|refresh_token) · GET/PUT /auth/v1/user · POST /auth/v1/logout
 *             POST /auth/v1/recover · POST /auth/v1/verify
 *   PostgREST POST /rest/v1/rpc/<função>   (apply_command, get_snapshot, ping)
 *
 * O que NÃO é falso: o banco (mesmo SQL, RLS e funções de produção), o JWT HS256 (assinado e verificado) e o app.
 * Serve para provar a integração (cookies, proxy, Server Actions, atualização otimista); não substitui um teste
 * contra o Supabase de verdade, que continua listado como pendência no README.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const ROOT = fileURLToPath(new URL("../supabase/", import.meta.url));
const JWT_SECRET = "segredo-de-teste-do-supabase-falso";
const TOKEN_TTL_S = 3600;

const b64url = (input) => Buffer.from(input).toString("base64url");

function signJwt(payload) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

/** Devolve as claims se a assinatura e a validade estiverem corretas; senão lança com o motivo. */
function verifyJwt(token) {
  const [head, body, sig] = (token ?? "").split(".");
  if (!head || !body || !sig) throw new Error("JWT malformado");
  const expected = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  if (sig !== expected) throw new Error("assinatura inválida");
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  if (claims.exp * 1000 < Date.now()) throw new Error("JWT expired");
  return claims;
}

export async function startFakeSupabase({ port = 54399 } = {}) {
  const pg = new PGlite();
  await pg.exec(readFileSync(`${ROOT}tests/supabase-stub.sql`, "utf8"));
  for (const file of readdirSync(`${ROOT}migrations`).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(`${ROOT}migrations/${file}`, "utf8"));
  }

  // O PGlite tem uma única conexão e o papel/JWT são estado da sessão: cada requisição roda inteira, uma por vez.
  let queue = Promise.resolve();
  const exclusive = (job) => {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  };

  const url = `http://127.0.0.1:${port}`;
  const users = new Map(); // email -> { id, password }
  const refreshTokens = new Map(); // refresh_token -> userId
  const recoveries = new Map(); // token_hash -> email
  const mails = []; // e-mails "enviados"
  const state = { restDown: false, latencyMs: 0 };

  const userJson = (user, email) => ({
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: new Date().toISOString(),
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_anonymous: false,
  });

  function sessionFor(email) {
    const user = users.get(email);
    const now = Math.floor(Date.now() / 1000);
    const accessToken = signJwt({
      iss: `${url}/auth/v1`,
      aud: "authenticated",
      sub: user.id,
      email,
      phone: "",
      role: "authenticated",
      aal: "aal1",
      amr: [{ method: "password", timestamp: now }],
      session_id: randomUUID(),
      is_anonymous: false,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      iat: now,
      exp: now + TOKEN_TTL_S,
    });
    const refreshToken = randomBytes(9).toString("base64url");
    refreshTokens.set(refreshToken, email);
    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: TOKEN_TTL_S,
      expires_at: now + TOKEN_TTL_S,
      refresh_token: refreshToken,
      user: userJson(user, email),
    };
  }

  const authError = (res, status, errorCode, msg) =>
    send(res, status, { code: status, error_code: errorCode, msg });

  function send(res, status, body) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  }

  async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    return text ? JSON.parse(text) : {};
  }

  const bearer = (req) => (req.headers.authorization ?? "").replace(/^Bearer /i, "");

  async function handleAuth(req, res, path, query) {
    if (path === "/auth/v1/token" && req.method === "POST") {
      const body = await readBody(req);
      const grant = query.get("grant_type");
      if (grant === "password") {
        const email = String(body.email ?? "").toLowerCase();
        const user = users.get(email);
        if (!user || user.password !== body.password) {
          return authError(res, 400, "invalid_credentials", "Invalid login credentials");
        }
        return send(res, 200, sessionFor(email));
      }
      if (grant === "refresh_token") {
        const email = refreshTokens.get(body.refresh_token);
        if (!email) return authError(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
        refreshTokens.delete(body.refresh_token);
        return send(res, 200, sessionFor(email));
      }
      return authError(res, 400, "unsupported_grant_type", "grant_type não suportado");
    }

    if (path === "/auth/v1/user") {
      let claims;
      try {
        claims = verifyJwt(bearer(req));
      } catch (error) {
        return authError(res, 401, "bad_jwt", error.message);
      }
      const email = claims.email;
      const user = users.get(email);
      if (!user) return authError(res, 403, "user_not_found", "User from sub claim in JWT does not exist");
      if (req.method === "GET") return send(res, 200, userJson(user, email));
      if (req.method === "PUT") {
        const body = await readBody(req);
        if (body.password !== undefined) {
          if (body.password === user.password) return authError(res, 422, "same_password", "New password should be different from the old password.");
          user.password = body.password;
        }
        return send(res, 200, userJson(user, email));
      }
    }

    if (path === "/auth/v1/logout" && req.method === "POST") return send(res, 204);

    if (path === "/auth/v1/recover" && req.method === "POST") {
      const body = await readBody(req);
      const email = String(body.email ?? "").toLowerCase();
      // Igual ao GoTrue: responde 200 mesmo se o e-mail não existe (não revela quais contas existem).
      if (users.has(email)) {
        const tokenHash = randomBytes(16).toString("hex");
        recoveries.set(tokenHash, email);
        mails.push({ to: email, tokenHash });
      }
      return send(res, 200, {});
    }

    if (path === "/auth/v1/verify" && req.method === "POST") {
      const body = await readBody(req);
      const email = recoveries.get(body.token_hash);
      if (body.type !== "recovery" || !email) return authError(res, 403, "otp_expired", "Email link is invalid or has expired");
      recoveries.delete(body.token_hash); // uso único
      return send(res, 200, sessionFor(email));
    }
    return send(res, 404, { msg: `rota de auth não implementada no falso: ${req.method} ${path}` });
  }

  async function handleRest(req, res, path) {
    if (state.restDown) return req.socket.destroy(); // rede caiu: a conexão simplesmente morre
    const fn = path.replace("/rest/v1/rpc/", "");
    const body = await readBody(req);
    const token = bearer(req);

    let sub = null;
    // `apikey` sozinho (a chave publishable) é o papel anon; com Bearer de usuário, authenticated.
    if (token && token !== req.headers.apikey) {
      try {
        sub = verifyJwt(token).sub;
      } catch (error) {
        return send(res, 401, { code: "PGRST301", message: error.message, details: null, hint: null });
      }
    }

    return exclusive(async () => {
      try {
        let rows;
        if (sub) {
          await pg.exec("set role authenticated");
          await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [sub]);
        } else {
          await pg.exec("set role anon");
        }
        try {
          // Funções expostas pelo app (lista fechada). Argumentos nomeados, como o PostgREST faz.
          const EXPOSED = ["apply_command", "get_snapshot", "ping", "ai_reserve", "ai_record"];
          if (!EXPOSED.includes(fn)) {
            return send(res, 404, { code: "PGRST202", message: `função ${fn} não existe`, details: null, hint: null });
          }
          const keys = Object.keys(body ?? {}).filter((k) => /^p_[a-z_]+$/.test(k));
          const isJson = (v) => typeof v === "object" && v !== null;
          const call = keys.map((k, i) => `${k} := $${i + 1}${isJson(body[k]) ? "::jsonb" : ""}`).join(", ");
          const params = keys.map((k) => (isJson(body[k]) ? JSON.stringify(body[k]) : body[k]));
          rows = (await pg.query(`select public.${fn}(${call}) as r`, params)).rows;
        } finally {
          await pg.exec("reset role");
          await pg.query("select set_config('request.jwt.claim.sub', '', false)");
        }
        return send(res, 200, rows[0].r);
      } catch (error) {
        return send(res, 400, { code: error.code ?? "XX000", message: error.message, details: null, hint: null });
      }
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (state.latencyMs) await new Promise((r) => setTimeout(r, state.latencyMs));
      const parsed = new URL(req.url, url);
      if (parsed.pathname.startsWith("/auth/v1/")) return await handleAuth(req, res, parsed.pathname, parsed.searchParams);
      if (parsed.pathname.startsWith("/rest/v1/rpc/")) return await handleRest(req, res, parsed.pathname);
      return send(res, 404, { message: "não implementado no falso" });
    } catch (error) {
      return send(res, 500, { message: String(error?.message ?? error) });
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

  return {
    url,
    pg,
    mails,
    /** Cria o usuário como o painel do Supabase faz (auth.users); o gatilho semeia perfil e catálogos. */
    async createUser(email, password) {
      const id = randomUUID();
      await exclusive(() => pg.query("insert into auth.users (id, email) values ($1, $2)", [id, email.toLowerCase()]));
      users.set(email.toLowerCase(), { id, password });
      return id;
    },
    /** Consulta como administrador (ignora o RLS), para conferir o que REALMENTE foi gravado. */
    admin: (sql, params = []) => exclusive(async () => (await pg.query(sql, params)).rows),
    /** Simula a rede/Supabase fora do ar: as chamadas de dados morrem sem resposta. */
    setRestDown(down) {
      state.restDown = down;
    },
    setLatency(ms) {
      state.latencyMs = ms;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
      server.closeAllConnections?.();
      await pg.close();
    },
  };
}

// Execução direta (`node e2e/fake-supabase.mjs`): sobe e fica de pé, para exploração manual.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fake = await startFakeSupabase();
  await fake.createUser("pedro@tars.example", "senha-forte-123");
  console.log(`Supabase falso em ${fake.url}  (pedro@tars.example / senha-forte-123)`);
}
