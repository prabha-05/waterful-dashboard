import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function main() {
  await prisma.salesOrder.deleteMany();

  const csvPath = path.join(__dirname, "..", "Sales.csv");
  const raw = fs.readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());

  const dataLines = lines.slice(1);
  const batch: { month: string; duplicate: number; orderId: number; date: Date; flavour: string; qty: number; customerName: string; mobile: string; billingCity: string; pincode: string; billingState: string; total: number; status: string }[] = [];

  for (const line of dataLines) {
    const cols = line.split(",");
    if (cols.length < 13) continue;

    const total = parseFloat(cols[11]) || 0;
    const qty = parseInt(cols[5]) || 0;
    const dateStr = cols[3]?.trim();
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) date.setTime(0);

    batch.push({
      month: cols[0]?.trim() || "",
      duplicate: parseInt(cols[1]) || 1,
      orderId: parseInt(cols[2]) || 0,
      date,
      flavour: cols[4]?.trim() || "",
      qty,
      customerName: cols[6]?.trim() || "",
      mobile: cols[7]?.trim() || "",
      billingCity: cols[8]?.trim() || "",
      pincode: cols[9]?.trim() || "",
      billingState: cols[10]?.trim() || "",
      total,
      status: cols[12]?.trim() || "Unknown",
    });
  }

  const chunkSize = 1000;
  for (let i = 0; i < batch.length; i += chunkSize) {
    const chunk = batch.slice(i, i + chunkSize);
    await prisma.salesOrder.createMany({ data: chunk });
    console.log(`Inserted ${Math.min(i + chunkSize, batch.length)} / ${batch.length}`);
  }

  console.log(`Done! Total rows inserted: ${batch.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
