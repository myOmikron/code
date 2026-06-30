use std::io;
use std::path::Path;

pub(crate) mod builder;
pub(crate) mod generator;

// Re-export core build functionality from tonic-build
pub use prost_build::Config;
pub use prost_types::FileDescriptorSet;
pub use tonic_build::Attributes as TonicAttributes;
pub use tonic_build::Method as TonicMethod;
pub use tonic_build::Service as TonicService;
pub use tonic_build::manual;

// Re-export prost types that users might need
pub use crate::builder::Builder;

/// Configure `tonic-prost-build` code generation.
///
/// Use [`compile_protos`] instead if you don't need to tweak anything.
pub fn configure() -> Builder {
    Builder::default()
}

/// Simple `.proto` compiling. Use [`configure`] instead if you need more options.
///
/// The include directory will be the parent folder of the specified path.
/// The package name will be the filename without the extension.
pub fn compile_protos(proto: impl AsRef<Path>) -> io::Result<()> {
    let proto_path: &Path = proto.as_ref();

    // directory the main .proto file resides in
    let proto_dir = proto_path
        .parent()
        .expect("proto file should reside in a directory");

    configure().compile_protos(&[proto_path], &[proto_dir])
}

/// Simple file descriptor set compiling. Use [`configure`] instead if you need more options.
pub fn compile_fds(fds: FileDescriptorSet) -> io::Result<()> {
    configure().compile_fds(fds)
}
