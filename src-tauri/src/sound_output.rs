//! Tells the page when macOS sends the sound to another device, a headset coming or going: an audio context of
//! the webview can stay bound to the old one and play into nothing, so `ui/sound.ts` starts a new one.

use std::ffi::c_void;

use tauri::{AppHandle, Emitter};

/// The event `ui/sound.ts` listens to.
const CHANGED: &str = "sound-output-changed";

#[repr(C)]
struct PropertyAddress {
    selector: u32,
    scope: u32,
    element: u32,
}

const SYSTEM_OBJECT: u32 = 1;
const DEFAULT_OUTPUT_DEVICE: PropertyAddress =
    PropertyAddress { selector: u32::from_be_bytes(*b"dOut"), scope: u32::from_be_bytes(*b"glob"), element: 0 };

type Listener = extern "C" fn(u32, u32, *const PropertyAddress, *mut c_void) -> i32;

#[link(name = "CoreAudio", kind = "framework")]
unsafe extern "C" {
    fn AudioObjectAddPropertyListener(
        object: u32,
        address: *const PropertyAddress,
        listener: Listener,
        data: *mut c_void,
    ) -> i32;
}

pub fn watch(app: &AppHandle) {
    // CoreAudio holds on to the pointer as long as the listener is registered, which is as long as the app runs.
    let data = Box::into_raw(Box::new(app.clone())).cast::<c_void>();
    // SAFETY: the address is copied by CoreAudio, `changed` matches the listener signature of the C API
    let status = unsafe { AudioObjectAddPropertyListener(SYSTEM_OBJECT, &DEFAULT_OUTPUT_DEVICE, changed, data) };
    if status != 0 {
        eprintln!("base: Wechsel des Tonausgangs nicht beobachtbar (CoreAudio {status})");
    }
}

extern "C" fn changed(_object: u32, _count: u32, _addresses: *const PropertyAddress, data: *mut c_void) -> i32 {
    // SAFETY: `data` is the handle `watch` leaked, it is never freed
    let app = unsafe { &*data.cast::<AppHandle>() };
    if let Err(error) = app.emit(CHANGED, ()) {
        eprintln!("base: Wechsel des Tonausgangs nicht gemeldet: {error}");
    }
    0
}
