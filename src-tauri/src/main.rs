// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Import modules
pub mod commands;
pub mod db;
pub mod services;

fn main() {
    // Initialize the database modules
    anchoring_lib::run()
}
