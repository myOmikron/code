fn main() -> Result<(), Box<dyn std::error::Error>> {
    service_bootstrap_build::Config::new()
        .bytes(["."])
        .compile_protos(
            &["../../proto/common/dlq.proto".to_string()],
            &["../../proto"],
        )?;
    Ok(())
}
