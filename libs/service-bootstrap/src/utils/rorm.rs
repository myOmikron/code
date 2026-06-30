//! Utilities for the `rorm` crate.

use galvyn::rorm::fields::types::MaxStr;
use tracing::warn;

/// Truncates a string to fit into a database column.
///
/// `string_usage` is used to log an error if the truncation is required.
pub fn truncate_string<const MAX_LEN: usize>(
    string: String,
    string_usage: &'static str,
) -> MaxStr<MAX_LEN> {
    const ELLIPSIS: &str = "...";
    let len_after_trunc: usize = MAX_LEN - ELLIPSIS.len();

    MaxStr::new(string).unwrap_or_else(|error| {
        let mut string = error.string;
        let display_string = if string.len() > 4096 {
            // so that zoho tickets are still able to be created (max length 64 KiB)
            warn!(
                tpig.create_ticket = false,
                "Full string not fitting into Zoho: {string}"
            );
            "<string way too long for log>"
        } else {
            &string
        };
        warn!(
            string = display_string,
            impact = format!("Historical data will be partially lost for this item. {string_usage} should NOT be any kind of ID or number, since it'll be cut off and inserted into the DB as wrong value. If the above shown string is something resembling an ID or number, please prioritize giving this to Dev."),
            "{string_usage} is larger than the database allows - please report to dev"
        );
        for i in 0..4 {
            let index = len_after_trunc - i;
            if string.is_char_boundary(index) {
                string.truncate(index);
                return MaxStr::new(string).unwrap_or_else(|_| unreachable!());
            }
        }
        unreachable!()
    })
}

/// Implements [`FieldType`] and [`FieldEq`] for an enum.
///
/// The enum's variants must all be unit types.
///
/// The database will store the enum's variants as plain text.
///
/// The decoder argument needs to be a unique identifier.
/// It is recommended to use `<Enum>Decoder`.
///
/// ```rust
/// use service_bootstrap::custom_db_enum;
/// #[derive(Clone, Copy)]
/// pub enum MyEnum {
///     Foo,
///     Bar
/// }
/// custom_db_enum! {
///     enum: MyEnum,
///     variants: [Foo, Bar],
///     decoder: MyEnumDecoder,
/// }
/// ```
#[macro_export]
macro_rules! custom_db_enum {
    (enum: $Enum:ident, variants: [$($Variant:ident),+$(,)?], decoder: $Decoder:ident,) => {
        impl $Enum {
            pub fn as_str(self) -> &'static str {
                match self {
                    $(Self::$Variant => stringify!($Variant),)+
                }
            }
            fn from_str(string: &str) -> Option<Self> {
                Some(match string {
                    $(stringify!($Variant) => Self::$Variant,)+
                    _ => return None,
                })
            }
        }

        impl ::galvyn::rorm::fields::traits::FieldType for $Enum {
            type Columns = ::galvyn::rorm::fields::traits::Array<1>;
            const NULL: ::galvyn::rorm::fields::traits::FieldColumns<Self, ::galvyn::rorm::db::sql::value::NullType>
                = [::galvyn::rorm::db::sql::value::NullType::String];

            fn into_values<'a>(self) -> ::galvyn::rorm::fields::traits::FieldColumns<Self, ::galvyn::rorm::conditions::Value<'a>> {
                [::galvyn::rorm::conditions::Value::String(::std::borrow::Cow::Borrowed(self.as_str()))]
            }

            fn as_values(&self) -> ::galvyn::rorm::fields::traits::FieldColumns<Self, ::galvyn::rorm::conditions::Value<'_>> {
                [::galvyn::rorm::conditions::Value::String(::std::borrow::Cow::Borrowed(self.as_str()))]
            }

            type Decoder = $Decoder;
            type GetNames = <::galvyn::rorm::fields::types::MaxStr<255> as ::galvyn::rorm::fields::traits::FieldType>::GetNames;
            type GetAnnotations = <::galvyn::rorm::fields::types::MaxStr<255> as ::galvyn::rorm::fields::traits::FieldType>::GetAnnotations;
            type Check = ::galvyn::rorm::fields::utils::check::string_check;
        }

        ::galvyn::rorm::new_converting_decoder!(
            #[doc = concat!("Decoder for [`", stringify!($Enum), "`]")]
            pub $Decoder, |value: String| -> $Enum {
                $Enum::from_str(value.as_str()).ok_or(concat!("Invalid ", stringify!($Enum)))
            }
        );

        impl<'rhs> ::galvyn::rorm::fields::traits::FieldEq<'rhs, Self> for $Enum {
            type EqCond<I: ::galvyn::rorm::fields::proxy::FieldProxyImpl>
                = ::galvyn::rorm::conditions::Binary<
                    ::galvyn::rorm::conditions::Column<I>,
                    ::galvyn::rorm::conditions::Value<'rhs>,
                >;
            fn field_equals<I: ::galvyn::rorm::fields::proxy::FieldProxyImpl>(
                field: ::galvyn::rorm::fields::proxy::FieldProxy<I>,
                value: Self
            ) -> Self::EqCond<I> {
                ::galvyn::rorm::conditions::Binary {
                    operator: ::galvyn::rorm::conditions::BinaryOperator::Equals,
                    fst_arg: ::galvyn::rorm::conditions::Column(field),
                    snd_arg: ::galvyn::rorm::conditions::Value::String(::std::borrow::Cow::Borrowed(value.as_str())),
                }
            }

            type NeCond<I: ::galvyn::rorm::fields::proxy::FieldProxyImpl>
                = ::galvyn::rorm::conditions::Binary<
                    ::galvyn::rorm::conditions::Column<I>,
                    ::galvyn::rorm::conditions::Value<'rhs>,
                >;
            fn field_not_equals<I: ::galvyn::rorm::fields::proxy::FieldProxyImpl>(
                field: ::galvyn::rorm::fields::proxy::FieldProxy<I>,
                value: Self
            ) -> Self::NeCond<I> {
                ::galvyn::rorm::conditions::Binary {
                    operator: ::galvyn::rorm::conditions::BinaryOperator::NotEquals,
                    fst_arg: ::galvyn::rorm::conditions::Column(field),
                    snd_arg: ::galvyn::rorm::conditions::Value::String(::std::borrow::Cow::Borrowed(value.as_str())),
                }
            }
        }
    };
}
