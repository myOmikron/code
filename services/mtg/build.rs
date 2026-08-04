fn main() -> Result<(), Box<dyn std::error::Error>> {
    service_bootstrap_build::Config::new().compile_protos(
        &["../../proto/mail/v1/mail.proto".to_string()],
        &["../../proto"],
    )?;
    Ok(())
}
