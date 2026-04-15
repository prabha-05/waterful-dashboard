-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "month" TEXT NOT NULL,
    "duplicate" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "flavour" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "billingCity" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "billingState" TEXT NOT NULL,
    "total" REAL NOT NULL,
    "status" TEXT NOT NULL
);
