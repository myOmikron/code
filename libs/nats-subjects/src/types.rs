use async_nats::Subject;

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct SubjectPattern {
    pattern: Subject,
}

pub const SUBJECT_PATTERN_ANY: SubjectPattern = SubjectPattern::from_static(">");

impl SubjectPattern {
    pub const fn from_static(str: &'static str) -> SubjectPattern {
        SubjectPattern {
            pattern: Subject::from_static(str),
        }
    }

    #[inline]
    pub fn as_str(&self) -> &str {
        self.pattern.as_str()
    }
}

impl From<Subject> for SubjectPattern {
    fn from(value: Subject) -> Self {
        SubjectPattern { pattern: value }
    }
}
