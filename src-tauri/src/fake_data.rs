// src-tauri/src/fake_data.rs
//
// Module sinh dữ liệu giả (fake data) theo cột do người dùng khai báo.
// Gắn vào app Tauri hiện có: thêm `mod fake_data;` trong lib.rs/main.rs
// và đăng ký `fake_data::generate_fake_data` trong `tauri::generate_handler![]`.
//
// Cargo.toml cần thêm (phần [dependencies] của src-tauri):
//   fake = { version = "2.9", features = ["chrono"] }
//   rand = "0.8"
//   uuid = { version = "1", features = ["v4"] }
//   chrono = "0.4"
//   serde = { version = "1", features = ["derive"] }
//   serde_json = "1"

use fake::faker::address::en::{BuildingNumber, CityName, CountryName, StreetName};
use fake::faker::chrono::en::{Date, DateTime};
use fake::faker::internet::en::{SafeEmail, Username};
use fake::faker::lorem::en::{Sentence, Word};
use fake::faker::name::en::Name;
use fake::faker::phone_number::en::PhoneNumber;
use fake::Fake;
use rand::Rng;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use uuid::Uuid;

/// Một cột do người dùng khai báo trên giao diện: tên cột + "kind" sinh dữ liệu.
/// "kind" là loại chung (generic), không phải kiểu SQL cụ thể — phía React sẽ
/// map kiểu SQL của từng loại database (VD: Oracle NUMBER, MySQL INT...) về
/// một trong các "kind" bên dưới trước khi gửi sang Rust.
#[derive(Debug, Deserialize)]
pub struct ColumnDef {
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Deserialize)]
pub struct GenerateFakeDataArgs {
    /// Loại database người dùng chọn (Oracle, MySQL, PostgreSQL, SQL Server, SQLite...).
    /// Hiện chưa ảnh hưởng tới cách sinh giá trị (giá trị sinh ra là JSON thuần),
    /// nhưng được giữ lại để sau này format riêng theo từng DB (VD: ép NUMBER thành
    /// chuỗi cho Oracle, định dạng ngày theo dialect...).
    pub db_type: String,
    pub columns: Vec<ColumnDef>,
    pub record_count: u32,
}

const MAX_RECORDS: u32 = 1_000_000;

/// `row_index` (0-based) chỉ được dùng cho các kind cần biết thứ tự bản ghi,
/// ví dụ "sequence" (ID tự tăng). Các kind khác bỏ qua tham số này.
fn generate_value(kind: &str, row_index: u32) -> Value {
    let mut rng = rand::thread_rng();
    match kind {
        // Số chung
        "int" => json!(rng.gen_range(1..1_000_000)),
        "small_int" => json!(rng.gen_range(1..1_000)),
        "float" => {
            let v: f64 = rng.gen_range(0.0..100_000.0);
            json!((v * 100.0).round() / 100.0)
        }
        "boolean" => json!(rng.gen_bool(0.5)),

        // Số có ngữ nghĩa -> sinh trong khoảng hợp lý thay vì random toàn dải
        "sequence" => json!(row_index + 1), // ID tự tăng: 1, 2, 3...
        "age" => json!(rng.gen_range(1..=90)), // Tuổi: 1-90
        "price" => {
            let v: f64 = rng.gen_range(1.0..10_000.0);
            json!((v * 100.0).round() / 100.0) // Tiền: 2 chữ số thập phân
        }

        // Định danh
        "uuid" => json!(Uuid::new_v4().to_string()),

        // Chuỗi có ngữ nghĩa
        "name" => json!(Name().fake::<String>()),
        "email" => json!(SafeEmail().fake::<String>()),
        "username" => json!(Username().fake::<String>()),
        "phone" => json!(PhoneNumber().fake::<String>()),
        "city" => json!(CityName().fake::<String>()),
        "street" => json!(StreetName().fake::<String>()),
        "country" => json!(CountryName().fake::<String>()),
        "full_address" => {
            // Số nhà + tên đường + thành phố, thay vì 1 từ Latin ngẫu nhiên
            let building: String = BuildingNumber().fake();
            let street: String = StreetName().fake();
            let city: String = CityName().fake();
            json!(format!("{} {}, {}", building, street, city))
        }
        "word" => json!(Word().fake::<String>()),
        "text" => json!(Sentence(5..15).fake::<String>()),

        // Thời gian
        "date" => json!(Date().fake::<String>()),
        "datetime" => json!(DateTime().fake::<String>()),

        // Mặc định: chuỗi ngẫu nhiên ngắn (fallback cho kind lạ/không xác định)
        _ => json!(Word().fake::<String>()),
    }
}

#[tauri::command]
pub fn generate_fake_data(args: GenerateFakeDataArgs) -> Result<Vec<Value>, String> {
    if args.columns.is_empty() {
        return Err("Cần khai báo ít nhất 1 cột".to_string());
    }
    if args.record_count == 0 {
        return Err("Số bản ghi phải lớn hơn 0".to_string());
    }
    if args.record_count > MAX_RECORDS {
        return Err(format!("Số bản ghi tối đa hỗ trợ là {}", MAX_RECORDS));
    }

    // Validate tên cột không trùng / không rỗng
    let mut seen = std::collections::HashSet::new();
    for col in &args.columns {
        let name = col.name.trim();
        if name.is_empty() {
            return Err("Tên cột không được để trống".to_string());
        }
        if !seen.insert(name.to_string()) {
            return Err(format!("Tên cột bị trùng: {}", name));
        }
    }

    let rows: Vec<Value> = (0..args.record_count)
        .map(|row_index| {
            let mut obj = Map::new();
            for col in &args.columns {
                obj.insert(col.name.clone(), generate_value(&col.kind, row_index));
            }
            Value::Object(obj)
        })
        .collect();

    Ok(rows)
}