import { redirect } from "next/navigation";

export default async function SpecificDayRedirect({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const qs = sp.date ? `?mode=day&date=${sp.date}` : "?mode=day";
  redirect(`/dashboard/sales/summary${qs}`);
}
