import { redirect } from "next/navigation";

export default async function PeriodRedirect({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const qs =
    sp.from && sp.to ? `?mode=range&from=${sp.from}&to=${sp.to}` : "?mode=range";
  redirect(`/dashboard/sales/summary${qs}`);
}
