import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedOrigins,
  privateIPv4,
  validateTransport,
} from "../src/network.js";
import { checkOrigin } from "../src/access.js";
import type { Request } from "express";

test("LAN accepts only RFC1918 IPv4 addresses", () => {
  for (const host of [
    "10.176.182.19",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.2",
  ])
    assert.ok(privateIPv4(host));
  for (const host of [
    "8.8.8.8",
    "172.15.0.1",
    "172.32.0.1",
    "192.169.0.1",
    "10.999.1.2",
    "example.com",
    "0.0.0.0",
  ])
    assert.equal(privateIPv4(host), false);
});
test("production HTTP requires explicit mode and private origins", () => {
  const env = {
    NODE_ENV: "production",
    COOKIE_SECURE: "false",
    APP_ORIGIN: "http://10.176.182.19:8080",
    APP_ORIGINS: "http://localhost:8080",
  };
  assert.throws(() => validateTransport(env));
  assert.throws(() => validateTransport({ ...env, LOCAL_HTTP: "true" }));
  assert.doesNotThrow(() => validateTransport({ ...env, LAN_HTTP: "true" }));
  assert.throws(() =>
    validateTransport({
      ...env,
      LAN_HTTP: "true",
      APP_ORIGINS: "http://8.8.8.8:8080",
    }),
  );
  assert.doesNotThrow(() =>
    validateTransport({
      NODE_ENV: "production",
      COOKIE_SECURE: "false",
      LOCAL_HTTP: "true",
      APP_ORIGIN: "http://localhost:8080",
    }),
  );
  assert.doesNotThrow(() =>
    validateTransport({
      NODE_ENV: "production",
      APP_ORIGIN: "https://pmo.example.test",
    }),
  );
  assert.throws(() =>
    validateTransport({
      NODE_ENV: "production",
      COOKIE_SECURE: "false",
      APP_ORIGIN: "https://pmo.example.test",
    }),
  );
});
test("origins stay exact, including port, and reject wildcard/path/userinfo", () => {
  assert.deepEqual(
    allowedOrigins({
      APP_ORIGIN: "http://localhost:8080",
      APP_ORIGINS: " http://10.0.0.2:8080, http://localhost:8080 ",
    }),
    ["http://localhost:8080", "http://10.0.0.2:8080"],
  );
  for (const origin of [
    "*",
    "http://10.0.0.2:8080/path",
    "http://user@10.0.0.2:8080",
    "http://10.0.0.2:8080/",
  ])
    assert.throws(() => validateTransport({ APP_ORIGIN: origin }));
});
test("all API mutations enforce the shared exact origin allowlist", () => {
  const original = process.env.APP_ORIGIN,
    additional = process.env.APP_ORIGINS;
  process.env.APP_ORIGIN = "http://localhost:8080";
  process.env.APP_ORIGINS = "http://10.176.182.19:8080";
  const request = (origin?: string) => ({ headers: { origin } }) as Request;
  try {
    assert.doesNotThrow(() =>
      checkOrigin(request("http://10.176.182.19:8080")),
    );
    assert.doesNotThrow(() => checkOrigin(request("http://localhost:8080")));
    for (const origin of [
      undefined,
      "null",
      "http://10.176.182.19:8081",
      "http://10.176.182.19:8080.evil.test",
      "https://evil.example",
    ])
      assert.throws(() => checkOrigin(request(origin)));
  } finally {
    if (original === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = original;
    if (additional === undefined) delete process.env.APP_ORIGINS;
    else process.env.APP_ORIGINS = additional;
  }
});
