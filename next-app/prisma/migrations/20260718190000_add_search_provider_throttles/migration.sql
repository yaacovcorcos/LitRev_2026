CREATE TABLE "SearchProviderThrottle" (
    "providerKey" TEXT NOT NULL,
    "nextAvailableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchProviderThrottle_pkey" PRIMARY KEY ("providerKey")
);
