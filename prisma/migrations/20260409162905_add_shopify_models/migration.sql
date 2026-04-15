-- CreateTable
CREATE TABLE "ShopifyOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shopifyId" BIGINT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "email" TEXT,
    "customerName" TEXT NOT NULL,
    "phone" TEXT,
    "totalPrice" REAL NOT NULL,
    "subtotalPrice" REAL NOT NULL,
    "totalTax" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "financialStatus" TEXT NOT NULL,
    "fulfillmentStatus" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "processedAt" DATETIME,
    "cancelledAt" DATETIME,
    "closedAt" DATETIME,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingCountry" TEXT,
    "billingZip" TEXT,
    "shippingCity" TEXT,
    "shippingState" TEXT,
    "shippingCountry" TEXT,
    "shippingZip" TEXT,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "tags" TEXT,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShopifyLineItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shopifyId" BIGINT NOT NULL,
    "orderId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "variantTitle" TEXT,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "totalDiscount" REAL NOT NULL DEFAULT 0,
    "vendor" TEXT,
    "productId" BIGINT,
    CONSTRAINT "ShopifyLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopifyOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'running',
    "ordersAdded" INTEGER NOT NULL DEFAULT 0,
    "ordersUpdated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyOrder_shopifyId_key" ON "ShopifyOrder"("shopifyId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyLineItem_shopifyId_key" ON "ShopifyLineItem"("shopifyId");
