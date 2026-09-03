//! Asks the device itself why WebGPU is not usable.
//!
//! "The model returns NaN on WebGPU" is a symptom with at least three causes, and they need
//! different fixes: the browser's WebGPU may be broken outright, it may compute single precision
//! fine but half precision wrongly, or both may be fine and the fault lies in the inference
//! library's own shaders. Guessing between them from a phone that only says "unbrauchbar" is
//! hopeless, so this runs two tiny compute shaders whose answers are known in advance.
//!
//! There is a reason to suspect half precision in particular. Brave 1.93 added WebGPU
//! fingerprinting defences that are on by default on Android: it empties the adapter descriptor
//! and adds noise to the reported feature list. A feature list that does not describe the device
//! is exactly how a library ends up emitting half-precision shaders for hardware that cannot
//! run them properly, and half precision overflows into infinities long before single does.

/**
 * What the device says about itself, and what it actually computed
 */
export type GpuReport = {
    /** Vendor and architecture, or why they could not be had */
    adapter: string;
    /** Features the adapter advertises */
    features: string[];
    /** Whether a known single-precision computation came back right */
    f32: string;
    /** The same in half precision, or why it was not tried */
    f16: string;
};

const COUNT = 64;

/**
 * Buffer usage and map flags, from the WebGPU specification.
 *
 * Spelled out here because this project's TypeScript lib declares WebGPU's interfaces but not the
 * constant namespaces that carry these values, and one small table beats taking on a dependency
 * for five numbers.
 */
const USAGE = { STORAGE: 0x0080, COPY_SRC: 0x0004, COPY_DST: 0x0008, MAP_READ: 0x0001 };
const MAP_READ = 0x0001;

/**
 * Runs one compute shader over a known input and returns what came back.
 *
 * @param device
 * @param shader WGSL computing out[i] from f32(i)
 * @returns the values
 */
async function run(device: GPUDevice, shader: string): Promise<Float32Array> {
    const module = device.createShaderModule({ code: shader });
    const output = device.createBuffer({
        size: COUNT * 4,
        usage: USAGE.STORAGE | USAGE.COPY_SRC,
    });
    const staging = device.createBuffer({ size: COUNT * 4, usage: USAGE.COPY_DST | USAGE.MAP_READ });

    const pipeline = device.createComputePipeline({
        layout: "auto",
        compute: { module, entryPoint: "main" },
    });
    const group = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: output } }],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(1);
    pass.end();
    encoder.copyBufferToBuffer(output, 0, staging, 0, COUNT * 4);
    device.queue.submit([encoder.finish()]);

    await staging.mapAsync(MAP_READ);
    const values = new Float32Array(staging.getMappedRange().slice(0));
    staging.unmap();
    output.destroy();
    staging.destroy();
    return values;
}

/**
 * Checks values against what the same arithmetic gives here.
 *
 * The shaders exercise `exp` and `sqrt` rather than plain multiplication on purpose: a driver
 * that gets addition wrong is unheard of, while transcendental functions are where mobile
 * drivers and half precision actually come apart.
 *
 * @param values what the device computed
 * @param half whether to allow half precision's much looser tolerance
 * @returns an empty string when right, otherwise what was wrong
 */
function check(values: Float32Array, half: boolean): string {
    let worst = 0;
    for (let index = 0; index < COUNT; index += 1) {
        const expected = Math.sqrt(index) + Math.exp(index / 16);
        if (!Number.isFinite(values[index])) return `Wert ${index} ist ${values[index]}`;
        worst = Math.max(worst, Math.abs(values[index] - expected) / Math.max(expected, 1));
    }
    const tolerance = half ? 0.02 : 1e-4;
    return worst <= tolerance ? "" : `Abweichung ${worst.toExponential(1)}`;
}

const F32_SHADER = `
@group(0) @binding(0) var<storage, read_write> out: array<f32>;
@compute @workgroup_size(${COUNT})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = f32(id.x);
  out[id.x] = sqrt(x) + exp(x / 16.0);
}`;

const F16_SHADER = `
enable f16;
@group(0) @binding(0) var<storage, read_write> out: array<f32>;
@compute @workgroup_size(${COUNT})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = f16(f32(id.x));
  out[id.x] = f32(sqrt(x) + exp(x / f16(16.0)));
}`;

/**
 * Reports what this device's WebGPU is and whether it can be trusted.
 *
 * @returns the report, or null when there is no WebGPU at all
 */
export async function probeWebGpu(): Promise<GpuReport | null> {
    if (!navigator.gpu) return null;
    const report: GpuReport = { adapter: "", features: [], f32: "", f16: "" };
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return { ...report, adapter: "kein Adapter", f32: "nicht geprüft", f16: "nicht geprüft" };

        const info = adapter.info as GPUAdapterInfo | undefined;
        report.adapter =
            [info?.vendor, info?.architecture, info?.device, info?.description].filter(Boolean).join(" ") || "leer";
        report.features = [...adapter.features].sort();

        const wantsHalf = adapter.features.has("shader-f16");
        const device = await adapter.requestDevice(wantsHalf ? { requiredFeatures: ["shader-f16"] } : {});

        report.f32 = check(await run(device, F32_SHADER), false) || "ok";
        if (!wantsHalf) {
            report.f16 = "nicht angeboten";
        } else {
            try {
                report.f16 = check(await run(device, F16_SHADER), true) || "ok";
            } catch (error) {
                report.f16 = error instanceof Error ? error.message : String(error);
            }
        }
        device.destroy();
    } catch (error) {
        report.f32 = report.f32 || (error instanceof Error ? error.message : String(error));
    }
    return report;
}
