//! Tiny functions simplifying `o2o` attributes

/// [`o2o` helpers](super) for `Option<_>`
pub mod opt {
    /// `Option<T> -> Option<U>` using `TryFrom`
    pub fn try_from<T, U>(value: Option<T>) -> Result<Option<U>, U::Error>
    where
        U: TryFrom<T>,
    {
        value.map(U::try_from).transpose()
    }

    /// `Option<T> -> Option<U>` using `Into`
    pub fn into<T, U>(value: Option<T>) -> Option<U>
    where
        T: Into<U>,
    {
        value.map(T::into)
    }

    /// `Option<T> -> Option<U>` using custom closure
    pub fn try_map<T, U, E>(
        value: Option<T>,
        map: impl FnMut(T) -> Result<U, E>,
    ) -> Result<Option<U>, E> {
        value.map(map).transpose()
    }

    /// `Option<T> -> Option<U>` using custom closure
    pub fn map<T, U>(value: Option<T>, map: impl FnMut(T) -> U) -> Option<U> {
        value.map(map)
    }
}

/// [`o2o` helpers](super) for `Option<Vec<_>>`
pub mod opt_vec {
    /// `Option<Vec<T>> -> Option<Vec<U>>` using `TryFrom`
    pub fn try_from<T, U>(value: Option<Vec<T>>) -> Result<Option<Vec<U>>, U::Error>
    where
        U: TryFrom<T>,
    {
        value.map(super::vec::try_from).transpose()
    }

    /// `Option<Vec<T>> -> Option<Vec<U>>` using `Into`
    pub fn into<T, U>(value: Option<Vec<T>>) -> Option<Vec<U>>
    where
        T: Into<U>,
    {
        value.map(super::vec::into)
    }

    /// `Option<Vec<T>> -> Option<Vec<U>>` using custom closure
    pub fn try_map<T, U, E>(
        value: Option<Vec<T>>,
        map: impl FnMut(T) -> Result<U, E>,
    ) -> Result<Option<Vec<U>>, E> {
        value.map(|x| super::vec::try_map(x, map)).transpose()
    }

    /// `Option<Vec<T>> -> Option<Vec<U>>` using custom closure
    pub fn map<T, U>(value: Option<Vec<T>>, map: impl FnMut(T) -> U) -> Option<Vec<U>> {
        value.map(|x| super::vec::map(x, map))
    }
}

/// [`o2o` helpers](super) for `Vec<_>`
pub mod vec {
    /// `Vec<T> -> Vec<U>` using `TryFrom`
    pub fn try_from<T, U>(value: Vec<T>) -> Result<Vec<U>, U::Error>
    where
        U: TryFrom<T>,
    {
        value.into_iter().map(U::try_from).collect()
    }

    /// `Vec<T> -> Vec<U>` using `Into`
    pub fn into<T, U>(value: Vec<T>) -> Vec<U>
    where
        T: Into<U>,
    {
        value.into_iter().map(T::into).collect()
    }

    /// `Vec<T> -> Vec<U>` using custom closure
    pub fn try_map<T, U, E>(
        value: Vec<T>,
        map: impl FnMut(T) -> Result<U, E>,
    ) -> Result<Vec<U>, E> {
        value.into_iter().map(map).collect()
    }

    /// `Vec<T> -> Vec<U>` using custom closure
    pub fn map<T, U>(value: Vec<T>, map: impl FnMut(T) -> U) -> Vec<U> {
        value.into_iter().map(map).collect()
    }
}
