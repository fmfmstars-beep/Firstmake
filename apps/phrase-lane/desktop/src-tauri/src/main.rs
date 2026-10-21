#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::sync::Mutex;
use rand::RngCore;
use sha2::{Digest,Sha256};
use serde_json::{json,Value};

// Fixed STAGING destination. A release must be reviewed before changing this URL.
const ORIGIN:&str="https://phrase-lane-billing-sandbox.fmfm-stars.workers.dev";
#[derive(Default)] struct Session { device:String, verifier:String, token:String }
struct App { session:Mutex<Session>, client:reqwest::Client }
fn secret()->String { let mut bytes=[0u8;32]; rand::thread_rng().fill_bytes(&mut bytes); bytes.iter().map(|b|format!("{b:02x}")).collect() }
fn digest(value:&str)->String { Sha256::digest(value.as_bytes()).iter().map(|b|format!("{b:02x}")).collect() }
async fn response(r:reqwest::Response)->Result<Value,String>{
 let status=r.status(); let data:Value=r.json().await.map_err(|_|"Unreadable service response.")?;
 if !status.is_success(){return Err(data["error"].as_str().unwrap_or("The service is unavailable.").to_owned());} Ok(data)
}
#[tauri::command]
async fn start_connection(state:tauri::State<'_,App>)->Result<Value,String>{
 let verifier=secret();
 let r=state.client.post(format!("{ORIGIN}/api/desktop/start")).json(&json!({"challenge":digest(&verifier)})).send().await.map_err(|_|"Could not reach the service.")?;
 let data=response(r).await?;let device=data["device_code"].as_str().ok_or("Missing device code.")?.to_owned();
 *state.session.lock().map_err(|_|"Session unavailable.")?=Session{device,verifier,token:String::new()};
 // Device credential and proof never cross into the WebView.
 Ok(json!({"user_code":data["user_code"],"expires_in":data["expires_in"]}))
}
#[tauri::command]
async fn poll_connection(state:tauri::State<'_,App>)->Result<Value,String>{
 let (device,verifier)={let s=state.session.lock().map_err(|_|"Session unavailable.")?;(s.device.clone(),s.verifier.clone())};
 if device.is_empty(){return Err("Start a connection first.".into());}
 let r=state.client.post(format!("{ORIGIN}/api/desktop/token")).json(&json!({"device_code":device,"verifier":verifier})).send().await.map_err(|_|"Could not check connection.")?;
 let data=response(r).await?;
 if let Some(token)=data["access_token"].as_str(){let mut s=state.session.lock().map_err(|_|"Session unavailable.")?;if s.device!=device{return Err("Connection was replaced. Start again.".into());}s.token=token.to_owned();s.verifier.clear();s.device.clear();return Ok(json!({"connected":true,"expires_in":900}));}
 Ok(json!({"connected":false}))
}
#[tauri::command]
async fn translate(text:String,direction:String,request_id:String,state:tauri::State<'_,App>)->Result<Value,String>{
 if text.trim().is_empty()||text.chars().count()>1000||!["en-ja","ja-en"].contains(&direction.as_str())||request_id.len()>100{return Err("Enter 1–1,000 characters and a valid direction.".into());}
 let token=state.session.lock().map_err(|_|"Session unavailable.")?.token.clone();if token.is_empty(){return Err("Connect in your browser first.".into());}
 let r=state.client.post(format!("{ORIGIN}/api/translate/text")).bearer_auth(token).json(&json!({"text":text,"direction":direction,"purpose":"general","request_id":request_id})).send().await.map_err(|_|"Translation failed. You can retry the same request.")?;
 response(r).await
}
#[tauri::command]
async fn disconnect(state:tauri::State<'_,App>)->Result<(),String>{
 let token={let mut s=state.session.lock().map_err(|_|"Session unavailable.")?;let token=s.token.clone();*s=Session::default();token};
 if !token.is_empty(){let _=state.client.post(format!("{ORIGIN}/api/desktop/logout")).bearer_auth(token).send().await;}
 Ok(())
}
#[tauri::command]
fn open_connection_page()->Result<(),String>{
 #[cfg(target_os="windows")]
 {std::process::Command::new("rundll32.exe").arg("url.dll,FileProtocolHandler").arg(format!("{ORIGIN}/desktop-link")).spawn().map_err(|_|"Could not open the default browser.")?;Ok(())}
 #[cfg(not(target_os="windows"))]
 {Err("This preview targets Windows.".into())}
}
fn main(){
 let client=reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(std::time::Duration::from_secs(20)).build().expect("HTTP client setup failed");
 tauri::Builder::default().manage(App{session:Mutex::new(Session::default()),client})
 .invoke_handler(tauri::generate_handler![start_connection,poll_connection,translate,disconnect,open_connection_page])
 .run(tauri::generate_context!()).expect("Application failed to start");
}
