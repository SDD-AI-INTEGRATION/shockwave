import { isIP } from "node:net";

type Environment = Record<string, string | undefined>;
export function privateIPv4(host: string) {
  if (isIP(host) !== 4) return false;
  const [first, second] = host.split(".").map(Number);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}
export function allowedOrigins(env: Environment = process.env) {
  return [
    ...new Set(
      [
        env.APP_ORIGIN || "http://localhost:3000",
        ...(env.APP_ORIGINS || "").split(","),
      ]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}
export function validateTransport(env: Environment = process.env) {
  const origins = allowedOrigins(env);
  const urls = origins.map((origin) => {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error("Origin aplikasi harus berupa URL lengkap.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== origin ||
      url.username ||
      url.password
    )
      throw new Error(
        "Origin harus berupa http(s)://host[:port], tanpa path atau wildcard.",
      );
    return url;
  });
  if (env.NODE_ENV !== "production") return;
  const http = urls.filter((url) => url.protocol === "http:");
  if (!http.length) {
    if (env.COOKIE_SECURE === "false")
      throw new Error("HTTPS memerlukan cookie Secure.");
    return;
  }
  const loopback = (url: URL) =>
    url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const local = env.LOCAL_HTTP === "true" && urls.every(loopback);
  const lan =
    env.LAN_HTTP === "true" &&
    urls.every((url) => loopback(url) || privateIPv4(url.hostname));
  if (env.COOKIE_SECURE !== "false" || (!local && !lan))
    throw new Error(
      "HTTP production hanya diizinkan dengan LOCAL_HTTP untuk localhost atau LAN_HTTP untuk IP privat yang eksplisit. Gunakan HTTPS untuk server lainnya.",
    );
}
