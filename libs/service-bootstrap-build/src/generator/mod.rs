mod server;

use std::cell::RefCell;

use proc_macro2::TokenStream;
use prost_build::Method;
use prost_build::Service;
use quote::quote;
use syn::__private::ToTokens;
use tonic_build::CodeGenBuilder;

/// Service generator that is compatible with prost-build
#[derive(Debug)]
pub struct ServiceGenerator {
    pub build_client: bool,
    pub build_server: bool,
    pub build_transport: bool,
    pub use_arc_self: bool,
    pub generate_default_stubs: bool,
    pub proto_path: String,
    pub compile_well_known_types: bool,
}

impl prost_build::ServiceGenerator for ServiceGenerator {
    fn generate(&mut self, service: Service, buf: &mut String) {
        let tonic_service = TonicBuildService::new(service);

        let mut tokens = TokenStream::new();

        if self.build_client {
            let client_code = CodeGenBuilder::new()
                .emit_package(true)
                .build_transport(self.build_transport)
                .compile_well_known_types(self.compile_well_known_types)
                .use_arc_self(self.use_arc_self)
                .generate_default_stubs(self.generate_default_stubs)
                .generate_client(&tonic_service, &self.proto_path);
            tokens.extend(client_code);
        }

        if self.build_server {
            tokens.extend(self.generate_server(&tonic_service));
        }

        let formatted = prettyplease::unparse(&syn::parse2(tokens).unwrap());
        buf.push_str(&formatted);
    }
}

/// Extended list of Non-path Rust types allowed for request/response types.
/// Needed for compiling well known types as request/responses.
pub const EXTENDED_NON_PATH_TYPE_ALLOWLIST: &[&str] =
    &["()", "bool", "i32", "i64", "u32", "u64", "f32", "f64"];

/// List of Non-path Rust types allowed for request/response types.
pub const DEFAULT_NON_PATH_TYPE_ALLOWLIST: &[&str] = &["()"];

thread_local! {
    /// Chosen allowlist, which would be [`EXTENDED_NON_PATH_TYPE_ALLOWLIST`] if
    /// [`Builder::with_extended_rust_types`] was called.
    pub static NON_PATH_TYPE_ALLOWLIST: RefCell<&'static [&'static str]> = const {
        RefCell::new(DEFAULT_NON_PATH_TYPE_ALLOWLIST)
    };
}

/// Newtype wrapper for prost to add tonic-specific extensions
pub struct TonicBuildService {
    prost_service: Service,
    methods: Vec<TonicBuildMethod>,
}

impl TonicBuildService {
    fn new(mut prost_service: Service) -> Self {
        Self {
            // The tonic_build::Service trait specifies that methods are borrowed, so they have to reified up front.
            methods: prost_service
                .methods
                .drain(..)
                .map(|prost_method| TonicBuildMethod { prost_method })
                .collect(),
            prost_service,
        }
    }
}

/// Newtype wrapper for prost to add tonic-specific extensions
pub struct TonicBuildMethod {
    prost_method: Method,
}

impl tonic_build::Service for TonicBuildService {
    type Method = TonicBuildMethod;
    type Comment = String;

    fn name(&self) -> &str {
        &self.prost_service.name
    }

    fn package(&self) -> &str {
        &self.prost_service.package
    }

    fn identifier(&self) -> &str {
        &self.prost_service.proto_name
    }

    fn methods(&self) -> &[Self::Method] {
        &self.methods
    }

    fn comment(&self) -> &[Self::Comment] {
        &self.prost_service.comments.leading
    }
}

impl tonic_build::Method for TonicBuildMethod {
    type Comment = String;

    fn name(&self) -> &str {
        &self.prost_method.name
    }

    fn identifier(&self) -> &str {
        &self.prost_method.proto_name
    }

    fn client_streaming(&self) -> bool {
        self.prost_method.client_streaming
    }

    fn server_streaming(&self) -> bool {
        self.prost_method.server_streaming
    }

    fn comment(&self) -> &[Self::Comment] {
        &self.prost_method.comments.leading
    }

    fn request_response_name(
        &self,
        proto_path: &str,
        compile_well_known_types: bool,
    ) -> (TokenStream, TokenStream) {
        let request = if is_google_type(&self.prost_method.input_type) && !compile_well_known_types
        {
            // For well-known types, map to absolute paths that will work with super::
            match self.prost_method.input_type.as_str() {
                ".google.protobuf.Empty" => quote!(()),
                ".google.protobuf.Any" => quote!(::prost_types::Any),
                ".google.protobuf.StringValue" => quote!(::prost::alloc::string::String),
                _ => {
                    // For other google types, assume they're in prost_types
                    let type_name = self
                        .prost_method
                        .input_type
                        .trim_start_matches(".google.protobuf.")
                        .to_string();
                    syn::parse_str::<syn::Path>(&format!("::prost_types::{type_name}"))
                        .unwrap()
                        .to_token_stream()
                }
            }
        } else if is_non_path_type(&self.prost_method.input_type) {
            self.prost_method.input_type.parse::<TokenStream>().unwrap()
        } else {
            // Check if this is an extern type that starts with :: or crate::
            if self.prost_method.input_type.starts_with("::")
                || self.prost_method.input_type.starts_with("crate::")
            {
                // This is an extern type, use it directly
                self.prost_method.input_type.parse::<TokenStream>().unwrap()
            } else {
                // Replace dots with double colons for the type name
                let rust_type = self.prost_method.input_type.replace('.', "::");
                // Remove leading :: if present
                let rust_type = rust_type.trim_start_matches("::");
                syn::parse_str::<syn::Path>(&format!("{proto_path}::{rust_type}"))
                    .unwrap()
                    .to_token_stream()
            }
        };

        let response =
            if is_google_type(&self.prost_method.output_type) && !compile_well_known_types {
                // For well-known types, map to absolute paths that will work with super::
                match self.prost_method.output_type.as_str() {
                    ".google.protobuf.Empty" => quote!(()),
                    ".google.protobuf.Any" => quote!(::prost_types::Any),
                    ".google.protobuf.StringValue" => quote!(::prost::alloc::string::String),
                    _ => {
                        // For other google types, assume they're in prost_types
                        let type_name = self
                            .prost_method
                            .output_type
                            .trim_start_matches(".google.protobuf.")
                            .to_string();
                        syn::parse_str::<syn::Path>(&format!("::prost_types::{type_name}"))
                            .unwrap()
                            .to_token_stream()
                    }
                }
            } else if is_non_path_type(&self.prost_method.output_type) {
                self.prost_method
                    .output_type
                    .parse::<TokenStream>()
                    .unwrap()
            } else {
                // Check if this is an extern type that starts with :: or crate::
                if self.prost_method.output_type.starts_with("::")
                    || self.prost_method.output_type.starts_with("crate::")
                {
                    // This is an extern type, use it directly
                    self.prost_method
                        .output_type
                        .parse::<TokenStream>()
                        .unwrap()
                } else {
                    // Replace dots with double colons for the type name
                    let rust_type = self.prost_method.output_type.replace('.', "::");
                    // Remove leading :: if present
                    let rust_type = rust_type.trim_start_matches("::");
                    syn::parse_str::<syn::Path>(&format!("{proto_path}::{rust_type}"))
                        .unwrap()
                        .to_token_stream()
                }
            };

        (request, response)
    }

    // Not used by server generator
    fn codec_path(&self) -> &str {
        "tonic_prost::ProstCodec"
    }

    fn deprecated(&self) -> bool {
        self.prost_method.options.deprecated()
    }
}

fn is_non_path_type(ty: &str) -> bool {
    NON_PATH_TYPE_ALLOWLIST.with(|allowlist| {
        allowlist
            .borrow()
            .iter()
            .any(|allowlist_type| ty.ends_with(allowlist_type))
    })
}

fn is_google_type(ty: &str) -> bool {
    ty.starts_with(".google.protobuf")
}
