use std::any::TypeId;
use std::marker::PhantomData;

use reqwest::RequestBuilder;
use reqwest::Url;
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde::de::value::UnitDeserializer;

use crate::MailcowClient;
use crate::error::MailcowError;
use crate::error::MailcowResult;

impl MailcowClient {
    #[allow(dead_code)]
    pub(crate) fn get(&self, relative_url: &str) -> MailcowRequest<(), ()> {
        MailcowRequest::new(self.client.get(self.build_url(relative_url.as_ref())))
    }
    #[allow(dead_code)]
    pub(crate) fn post(&self, relative_url: &str) -> MailcowRequest<(), ()> {
        MailcowRequest::new(self.client.post(self.build_url(relative_url.as_ref())))
    }
    #[allow(dead_code)]
    pub(crate) fn put(&self, relative_url: &str) -> MailcowRequest<(), ()> {
        MailcowRequest::new(self.client.put(self.build_url(relative_url.as_ref())))
    }
    #[allow(dead_code)]
    pub(crate) fn delete(&self, relative_url: &str) -> MailcowRequest<(), ()> {
        MailcowRequest::new(self.client.delete(self.build_url(relative_url.as_ref())))
    }
    fn build_url(&self, relative_url: &str) -> Url {
        #[allow(clippy::expect_used)]
        self.base_url
            .join(relative_url)
            .expect("The endpoint url should be valid")
    }
}

pub(crate) struct MailcowRequest<BOD, QUE> {
    inner: RequestBuilder,
    phantoms: PhantomData<(BOD, QUE)>,
}

impl<BOD, QUE> MailcowRequest<BOD, QUE> {
    fn new(inner: RequestBuilder) -> Self {
        Self {
            inner,
            phantoms: PhantomData,
        }
    }
}

impl<BOD> MailcowRequest<BOD, ()> {
    #[allow(dead_code)]
    pub(crate) fn query<QUE>(self, query: QUE) -> MailcowRequest<BOD, QUE>
    where
        QUE: Serialize,
    {
        MailcowRequest::new(self.inner.query(&query))
    }
}

impl<QUE> MailcowRequest<(), QUE> {
    #[allow(dead_code)]
    pub(crate) fn body<BOD>(self, body: BOD) -> MailcowRequest<BOD, QUE>
    where
        BOD: Serialize,
    {
        MailcowRequest::new(self.inner.json(&body))
    }
}

impl<BOD, QUE> MailcowRequest<BOD, QUE> {
    pub(crate) async fn send<RES>(self) -> MailcowResult<RES>
    where
        RES: DeserializeOwned + 'static,
    {
        let response = self.inner.send().await?;

        let status = response.status();
        let txt = response.text().await?;
        if status == 401 {
            return Err(MailcowError::Unauthorized);
        }

        if TypeId::of::<RES>() == TypeId::of::<()>() {
            // check above guarantees that RES is ()
            #[allow(clippy::unwrap_used)]
            return Ok(RES::deserialize(UnitDeserializer::<serde_json::Error>::new()).unwrap());
        }

        match serde_json::from_str(&txt) {
            Ok(data) => Ok(data),
            Err(err) => Err(MailcowError::Deserialize {
                error: err,
                original: txt,
            }),
        }
    }
}
