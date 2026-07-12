-- PostgreSQL truncates the original generated name at 63 bytes. Rename that
-- physical index to the explicit Prisma map name so migration/schema drift is zero.
ALTER INDEX "AgentRun_memoryExtractionStatus_memoryExtractionLeaseExpiresAt_"
RENAME TO "AgentRun_memoryExtractionStatus_leaseExpiry_idx";
