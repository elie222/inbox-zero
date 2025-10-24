import {
  migrateUsersToDigestDefaults,
  getMigrationStatus,
} from "./migrate-digest-defaults";

async function testMigration() {
  console.log("Testing digest migration...");

  try {
    // Get current status
    console.log("Getting migration status...");
    const status = await getMigrationStatus();
    console.log("Current status:", status);

    // Run dry run
    console.log("Running dry run...");
    const dryRunStats = await migrateUsersToDigestDefaults();
    console.log("Dry run results:", dryRunStats);
  } catch (error) {
    console.error("Migration test failed:", error);
  }
}

// Run the test
testMigration()
  .then(() => {
    console.log("Test completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
  });
