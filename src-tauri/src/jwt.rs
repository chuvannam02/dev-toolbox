use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JwtVerifyResult {
    valid: bool,
    algorithm: String,
    claims: Value,
}

#[tauri::command]
pub fn verify_jwt_hmac(token: String, secret: String) -> Result<JwtVerifyResult, String> {
    if token.trim().is_empty() {
        return Err("JWT cannot be empty".to_string());
    }

    if secret.is_empty() {
        return Err("Secret cannot be empty".to_string());
    }

    let header = decode_header(&token).map_err(|e| format!("Invalid JWT header: {e}"))?;

    let algorithm = header.alg;

    match algorithm {
        Algorithm::HS256 | Algorithm::HS384 | Algorithm::HS512 => {}
        _ => {
            return Err(format!(
                "Algorithm {:?} is not an HMAC algorithm",
                algorithm
            ));
        }
    }

    let mut validation = Validation::new(algorithm);

    // JWT Inspector mode:
    // only verify cryptographic signature.
    //
    // Claims such as exp/nbf/aud are inspected separately
    // in the UI.
    validation.required_spec_claims.clear();
    validation.validate_exp = false;
    validation.validate_nbf = false;
    validation.validate_aud = false;

    let decoded = decode::<Value>(
        &token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|e| format!("Signature verification failed: {e}"))?;

    Ok(JwtVerifyResult {
        valid: true,
        algorithm: format!("{:?}", algorithm),
        claims: decoded.claims,
    })
}
