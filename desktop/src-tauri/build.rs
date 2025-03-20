fn main() {
    println!(
        "cargo:rustc-env=OUT_DIR={}",
        std::env::var("OUT_DIR").unwrap()
    );

    // Ensure recompilation if migrations change
    println!("cargo:rerun-if-changed=src/db/migrations");

    tauri_build::build()
}
