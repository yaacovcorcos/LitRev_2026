/**
 * Test script to verify AI setup
 * Run with: npx tsx scripts/test-ai-setup.ts
 */

import { getOpenAIProvider } from "../lib/server/ai/providers/openai";
import { prisma } from "../lib/server/prisma";

async function testSetup() {
    console.log("🔍 Testing AI Setup...\n");

    // Test 1: OpenAI API Key
    console.log("1. Checking OpenAI API Key...");
    try {
        const provider = getOpenAIProvider();
        if (provider.isConfigured()) {
            console.log("   ✅ OpenAI API key is configured");
        } else {
            console.log("   ❌ OpenAI API key is missing");
            return;
        }
    } catch (error) {
        console.log("   ❌ Error:", error instanceof Error ? error.message : error);
        return;
    }

    // Test 2: Database Connection
    console.log("\n2. Checking Database Connection...");
    try {
        await prisma.$connect();
        console.log("   ✅ Database connection successful");

        // Check if AI tables exist
        const conversationCount = await prisma.aIConversation.count();
        const usageCount = await prisma.aIUsage.count();
        console.log(`   ✅ AI tables exist (${conversationCount} conversations, ${usageCount} usage records)`);
    } catch (error) {
        console.log("   ❌ Database error:", error instanceof Error ? error.message : error);
        return;
    } finally {
        await prisma.$disconnect();
    }

    // Test 3: OpenAI API Call
    console.log("\n3. Testing OpenAI API Call...");
    try {
        const provider = getOpenAIProvider();
        const response = await provider.chat(
            [{ id: "test", role: "user", content: "Say 'Hello!' in one word.", createdAt: new Date().toISOString() }],
            { maxTokens: 10 }
        );
        console.log("   ✅ OpenAI API working");
        console.log(`   Response: "${response.content}"`);
        console.log(`   Tokens used: ${response.usage.totalTokens}`);
    } catch (error) {
        console.log("   ❌ OpenAI API error:", error instanceof Error ? error.message : error);
        return;
    }

    console.log("\n✅ All checks passed! AI is ready to use.\n");
}

testSetup().catch((error) => {
    console.error("❌ AI setup test failed:", error);
    process.exitCode = 1;
});
