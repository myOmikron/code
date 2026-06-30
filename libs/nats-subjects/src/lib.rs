//! Central NATS subject and stream constants.
//!

pub use types::SUBJECT_PATTERN_ANY;
pub use types::SubjectPattern;

mod types;

pub mod example {
    use crate::SubjectPattern;

    /// JetStream stream name for example subjects.
    pub const STREAM: &str = "EXAMPLE";
    /// Subject pattern covering all example subjects.
    pub const SUBJECTS: SubjectPattern = SubjectPattern::from_static("example.>");

    pub mod some_module {
        use async_nats::Subject;

        /// Example handler
        pub const HANDLER: Subject = Subject::from_static("example.some-module.handler");
    }
}

/// Central store for any kind of dead-letter appearing in any other program
pub mod dlq {
    use crate::SubjectPattern;

    /// Subject pattern for any message sent to the DLQ
    pub const SUBJECTS: SubjectPattern = SubjectPattern::from_static("dlq.>");
}
