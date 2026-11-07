// ===========================================================================
// MongoDB first-run initialization.
//
// This runs ONCE, automatically, the first time the mongo container starts
// with an empty data volume. It uses the root user (created by the official
// image from MONGO_INITDB_ROOT_*) to create a LIMITED application user that
// the app and the Python scripts use for everything else.
//
// The events collection, its $jsonSchema validator, and its indexes are
// created by the app at startup (server/db.js) and re-created by
// scripts/reset_db.py --all, so they are intentionally NOT defined here —
// there is a single source of truth in db/events.schema.json.
// ===========================================================================

const dbName = process.env.MONGO_DB || "datawall";
const appUser = process.env.MONGO_APP_USERNAME || "datawall_app";
const appPass = process.env.MONGO_APP_PASSWORD || "change-me-app-password";

const appDb = db.getSiblingDB(dbName);

// Create the application user with read/write ONLY on the app database.
// If it already exists (re-run), ignore the error so this stays idempotent.
try {
  appDb.createUser({
    user: appUser,
    pwd: appPass,
    // readWrite  -> insert/find/delete events, create the collection + indexes.
    // dbAdmin     -> apply/update the $jsonSchema validator (collMod) and, for
    //                scripts/reset_db.py --all, drop + recreate the database.
    // Both are scoped to THIS database only — never cluster-wide or root.
    roles: [
      { role: "readWrite", db: dbName },
      { role: "dbAdmin", db: dbName },
    ],
  });
  print(`[mongo-init] created app user '${appUser}' on db '${dbName}'`);
} catch (e) {
  print(`[mongo-init] app user '${appUser}' already exists or could not be created: ${e}`);
}
