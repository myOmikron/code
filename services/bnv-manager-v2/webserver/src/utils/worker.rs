//! The `Worker` trait and supporting structure are designed to streamline the creation
//! and management of asynchronous workers. This code provides functionality for
//! defining worker behavior, spawning workers, and managing their lifecycle via a handle.

use std::marker::PhantomData;

use tokio::task::JoinError;

/// The `Worker` trait provides a blueprint for creating and managing asynchronous workers.
/// Each worker must implement the `run` method, defining the worker's processing logic.
///
/// The trait includes a default `spawn` method for creating and running an instance
/// of the worker asynchronously within a Tokio runtime. The `spawn` method returns a
/// `WorkerHandle`, which can be used to manage the lifecycle of the spawned worker.
pub trait Worker: Sized {
    /// Spawn a new worker
    fn spawn(self) -> WorkerHandle<Self> {
        WorkerHandle {
            join_handle: tokio::spawn(self.run()),
            worker: PhantomData,
        }
    }

    /// Entrypoint for the worker
    fn run(self) -> impl Future<Output = ()> + Send + 'static;
}

/// A handle for managing and interacting with a worker task.
///
/// The `WorkerHandle<T>` struct provides a way to handle an asynchronous task
/// (or worker) which performs background operations. It wraps a Tokio `JoinHandle`
/// and uses a `PhantomData<T>` to associate the handle with a generic worker type.
pub struct WorkerHandle<T> {
    join_handle: tokio::task::JoinHandle<()>,
    worker: PhantomData<T>,
}
impl<T> WorkerHandle<T> {
    /// Await the completion of the background job
    pub async fn join(self) -> Result<(), JoinError> {
        self.join_handle.await
    }

    /// Abort the worker
    pub fn abort(&self) {
        self.join_handle.abort();
    }
}
