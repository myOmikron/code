use proc_macro2::Literal;
use proc_macro2::TokenStream;
use quote::format_ident;
use quote::quote;
use tonic_build::Method;
use tonic_build::Service;

use crate::generator::ServiceGenerator;
use crate::generator::TonicBuildService;

macro_rules! format_literal {
    ($($tokens:tt)*) => {
        proc_macro2::Literal::string(&format!($($tokens)*))
    };
}

impl ServiceGenerator {
    pub fn generate_server(&self, service: &TonicBuildService) -> TokenStream {
        let server_trait = format_ident!("{}Server", service.name());
        let struct_ident = format_ident!("{}Server", service.name());
        let server_trait_mod = format_ident!("{}Server_trait", service.name());
        let server_struct_mod = format_ident!("{}Server_struct", service.name());
        let server_doc = service.comment().join("\n");

        let trait_doc = format_literal!(
            "Generated trait containing gRPC methods that should be implemented for use with {}Server.",
            service.name(),
        );

        let full_name = format_literal!("{}.{}", service.package(), service.identifier());
        let service_suppath = format_literal!("/{}.{}", service.package(), service.identifier());

        let self_param = if self.use_arc_self {
            quote!(self: std::sync::Arc<Self>)
        } else {
            quote!(&self)
        };
        let method_body = if self.generate_default_stubs {
            quote! {
                {
                    Err(cg::GrpcStatus::unimplemented("Not yet implemented"))
                }
            }
        } else {
            quote! {
                ;
            }
        };

        /* Optional keywords / bracket */
        let where_ = (!service.methods().is_empty()).then_some(quote! { where });
        let (bra, ket) = if service.methods().is_empty() {
            (None, None)
        } else {
            (Some(quote! {<}), Some(quote! {>}))
        };

        /* Util iterator */
        let methods = service.methods();
        let client_streaming = iter_map_collect(methods, |m| m.client_streaming());
        let server_streaming = iter_map_collect(methods, |m| m.server_streaming());

        /* Method iterators */

        // Method's name in snake case
        let m_snake: Vec<_> = iter_map_collect(methods, |m| format_ident!("{}", m.name()));

        // Method's name in pascal case
        let m_pascal: Vec<_> = iter_map_collect(methods, |m| format_ident!("{}", m.identifier()));

        // Method's generic future type, example `__F0`
        let m_fut_gen: Vec<_> =
            iter_map_collect(0..service.methods().len(), |i| format_ident!("__F{}", i));

        // Method's generic request type, example `__I0`
        let m_req_gen: Vec<_> =
            iter_map_collect(0..service.methods().len(), |i| format_ident!("__I{}", i));

        // Method's generic response type, example `__O0`
        let m_res_gen: Vec<_> =
            iter_map_collect(0..service.methods().len(), |i| format_ident!("__O{}", i));

        // Method's associated request type, example `DoThingRequest`
        let m_req_at: Vec<_> =
            iter_map_collect(methods, |m| format_ident!("{}Request", m.identifier()));

        // Method's associated response type, example `DoThingResponse`
        let m_res_at: Vec<_> =
            iter_map_collect(methods, |m| format_ident!("{}Response", m.identifier()));

        // Method's raw request and response type, example `proto::DoThingRequest`
        let (m_req_raw, m_res_raw): (Vec<_>, Vec<_>) = methods
            .iter()
            .map(|m| m.request_response_name(&self.proto_path, self.compile_well_known_types))
            .unzip();

        // `cg::BoxedStream<` if the request is streamed
        let m_req_open = iter_map_collect(&client_streaming, |x| {
            x.then_some(quote! { cg::BoxedStream< })
        });

        // `>` if the request is streamed
        let m_req_close = iter_map_collect(&client_streaming, |x| x.then_some(quote! { > }));

        // `cg::BoxedStream<` if the response is streamed
        let m_res_open = iter_map_collect(&server_streaming, |x| {
            x.then_some(quote! { cg::BoxedStream< })
        });

        // `>` if the response is streamed
        let m_res_close = iter_map_collect(&server_streaming, |x| x.then_some(quote! { > }));

        // Method's doc comments, example `["does a thing", "", "here be dragons"]`
        let m_doc: Vec<Vec<_>> = iter_map_collect(methods, |m| {
            m.comment().iter().map(|c| Literal::string(c)).collect()
        });

        // Method's dispatch implementation, example `dispatch_unary`
        let m_dispatch: Vec<_> = iter_map_collect(methods, |m| {
            match (m.client_streaming(), m.server_streaming()) {
                (false, false) => quote! { dispatch_unary },
                (false, true) => quote! { dispatch_server_streaming },
                (true, false) => quote! { dispatch_client_streaming },
                (true, true) => quote! { dispatch_streaming },
            }
        });

        // Is the method deprecated, example `false`
        let m_deprecated: Vec<_> = iter_map_collect(methods, |m| {
            if m.deprecated() {
                quote! { true }
            } else {
                quote! { false }
            }
        });

        quote! {
            pub use #server_struct_mod::#struct_ident;

            #[allow(non_snake_case)]
            mod #server_struct_mod {
                pub use service_bootstrap::grpc::server::codegen as cg;

                #[doc = #server_doc]
                pub struct #struct_ident #bra #(#m_req_gen, #m_fut_gen,)* #ket
                {#(
                    pub #m_snake: fn(cg::GrpcRequest<#m_req_open #m_req_gen #m_req_close>) -> #m_fut_gen,
                )*}

                impl #bra #(#m_req_gen, #m_fut_gen, #m_res_gen,)* #ket super::#server_trait_mod::#server_trait
                for #struct_ident #bra #(#m_req_gen, #m_fut_gen,)* #ket
                #where_ #(
                    #m_fut_gen: std::future::Future<Output = Result<cg::GrpcResponse<#m_res_open #m_res_gen #m_res_close>, cg::GrpcStatus>> + Send + 'static,
                    #m_req_gen: TryFrom<#m_req_raw, Error: Into<cg::BoxedError>> + Send + Sync + 'static,
                    #m_res_gen: Into<#m_res_raw> + Send + Sync + 'static,
                )*
                {#(
                    type #m_req_at = #m_req_gen;
                    type #m_res_at = #m_res_gen;

                    async fn #m_snake(#self_param, request: cg::GrpcRequest<#m_req_open Self::#m_req_at #m_req_close>)
                        -> std::result::Result<cg::GrpcResponse<#m_res_open Self::#m_res_at #m_res_close>, cg::GrpcStatus>
                    {
                        (self.#m_snake)(request).await
                    }
                )*}

                impl #bra #(#m_req_gen, #m_fut_gen, #m_res_gen,)* #ket cg::GrpcService
                for #struct_ident #bra #(#m_req_gen, #m_fut_gen,)* #ket
                #where_ #(
                    #m_fut_gen: std::future::Future<Output = Result<cg::GrpcResponse<#m_res_open #m_res_gen #m_res_close>, cg::GrpcStatus>> + Send + 'static,
                    #m_req_gen: TryFrom<#m_req_raw, Error: Into<cg::BoxedError>> + Send + Sync + 'static,
                    #m_res_gen: Into<#m_res_raw> + Send + Sync + 'static,
                )*
                {
                    const FULL_NAME: &str = #full_name;
                    fn into_router(self) -> cg::GalvynRouter {
                        super::#server_trait_mod::#server_trait::into_subrouter(
                            std::sync::Arc::new(self),
                            Default::default()
                        )
                    }
                }
            }

            #[allow(non_snake_case)]
            mod #server_trait_mod {
                pub use service_bootstrap::grpc::server::codegen as cg;

                #[doc = #trait_doc]
                pub trait #server_trait: std::marker::Send + std::marker::Sync + 'static {
                    #(
                        type #m_req_at: TryFrom<#m_req_raw, Error: Into<cg::BoxedError>> + Send + Sync + 'static;
                        type #m_res_at: Into<#m_res_raw> + Send + Sync + 'static;

                        #( #[doc = #m_doc] )*
                        fn #m_snake(#self_param, request: cg::GrpcRequest<#m_req_open Self::#m_req_at #m_req_close>)
                            -> impl std::future::Future<Output = std::result::Result<cg::GrpcResponse<#m_res_open Self::#m_res_at #m_res_close>, cg::GrpcStatus>> + Send
                        #method_body
                    )*

                    /// Converts `self` into a `GalvynRouter` which serves the methods.
                    ///
                    /// It does not handle "404"s.
                    fn into_router(self) -> cg::GalvynRouter
                    where
                        Self: Sized
                    {
                        #![allow(unused)]

                        let this = std::sync::Arc::new(self);
                        cg::GalvynRouter::new()
                            .nest(
                                #service_suppath,
                                this.into_subrouter(Default::default())
                            )
                    }

                    #[doc(hidden)]
                    fn into_subrouter(self: std::sync::Arc<Self>, config: cg::DispatchConfig) -> cg::GalvynRouter
                    where
                        Self: Sized
                    {
                        cg::GalvynRouter::new()
                            #(
                                .handler({
                                    struct Handler<__T>(std::marker::PhantomData<__T>);
                                    impl<__T: #server_trait> cg::GalvynHandler for Handler<__T> {
                                        fn meta(&self) -> cg::HandlerMeta {
                                            cg::HandlerMeta {
                                                method: cg::Method::POST,
                                                path: concat!("/", stringify!(#m_pascal)),
                                                deprecated: #m_deprecated,
                                                doc: &[#(#m_doc,)*],
                                                ident: stringify!(#m_snake),
                                                request_parts: vec![],
                                                request_body: Some(cg::RequestBodyMetadata {
                                                    body: |_| (cg::MIME_APPLICATION_GRPC.clone(), None),
                                                }),
                                                response_modifier: None,
                                                response_parts: vec![],
                                                response_body: Some(cg::ResponseBodyMetadata {
                                                    body: |_| vec![(
                                                        cg::StatusCode::OK,
                                                        Some((cg::MIME_APPLICATION_GRPC.clone(), None))
                                                    )],
                                                }),
                                            }
                                        }

                                        fn method_router(&self) -> cg::MethodRouter {
                                            cg::any(
                                                move |
                                                    state: cg::Extension<(
                                                        std::sync::Arc<__T>,
                                                        cg::DispatchConfig,
                                                    )>,
                                                    request: cg::AxumRequest,
                                                | {
                                                    let (inner, config) = state.0;
                                                    Box::pin(
                                                        cg::Dispatcher::<
                                                            __T::#m_req_at, __T::#m_res_at,
                                                            #m_req_raw, #m_res_raw,
                                                        >::new(config)
                                                            .#m_dispatch(
                                                                request,
                                                                move |request| async move {
                                                                    let inner = inner.clone();
                                                                    inner.#m_snake(request).await
                                                                },
                                                            )
                                                    )
                                                }
                                            )
                                        }
                                    }
                                    Handler(std::marker::PhantomData::<Self>)
                                })
                            )*
                            .layer(cg::Extension((self, config)))
                    }
                }
            }
        }
    }
}

/// `ITER.into_iter().map(MAP).collect()
fn iter_map_collect<T, U>(iter: impl IntoIterator<Item = T>, map: impl FnMut(T) -> U) -> Vec<U> {
    iter.into_iter().map(map).collect()
}
