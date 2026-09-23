# @inboxzero/mail-expo

Expo adapters for the shared mail engine: a serialized `SqliteDriver`, a native
file `BlobStore`, and host runtime helpers. App authentication, navigation, and
product policy stay in the mobile app.

Portable entry points do not import Node, Electron, Next, or React DOM. The
SQLite driver contract still has to pass on real iOS and Android SQLite; a
JavaScript substitute is not that gate.
