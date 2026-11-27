export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "pm" | "viewer";
  must_change_password?: boolean;
};
export type Project = {
  id: string;
  code: string;
  name: string;
  customer: string;
  description: string;
  status: "planning" | "active" | "at_risk" | "completed";
  progress: number;
  start_date: string;
  end_date: string;
  manager_name: string;
  manager_id: string;
  pillar?: string;
  sub_pillar?: string;
  revenue_forecast?: number | string;
  revenue_actual?: number | string;
};
export async function api(path: string, options?: RequestInit) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const result = await response
    .json()
    .catch(() => ({
      message: "Layanan belum tersedia. Periksa koneksi backend.",
    }));
  if (!response.ok)
    throw Object.assign(new Error(result.message || "Permintaan gagal."), {
      status: response.status,
    });
  return result;
}
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const iso = (value: string) => value.slice(0, 10);
export const money = (value: unknown) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
export const weekCount = (p: Project) =>
  Math.max(
    1,
    Math.min(
      260,
      Math.ceil(
        (new Date(iso(p.end_date)).getTime() -
          new Date(iso(p.start_date)).getTime()) /
          604800000,
      ) + 1,
    ),
  );
export const labelDate = (value: string) =>
  value
    ? new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(value))
    : "—";
