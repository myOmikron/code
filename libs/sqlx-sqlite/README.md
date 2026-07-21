# Please ignore this crate

This crate is a workaround for an issue with the dependency resolver.

## The issue

`matrix-sdk` depends on `rusqlite` and `galvyn` depends on `sqlx-sqlite`.

Both depend on `libsqlite3-sys` but different versions of it.

This is not allowed because it links to a system library.

We actually never compile `sqlx-sqlite` because it is disabled through feature flags.

However, `cargo` is not smart enough to understand that.

## The fix

The workspace's `Cargo.toml` "patches" (i.e., replaces) the actual sqlx-sqlite crate with this one.

The dependency resolver sees that this patch does not depend on `libsqlite3-sys` and is satisfied.

Since we don't actually use sqlite this crate does nothing; it actually doesn't even compile.
