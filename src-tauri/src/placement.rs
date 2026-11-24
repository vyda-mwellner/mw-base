//! Where the window opens: in the bottom right corner of the main screen, clear of the Dock and the menu bar.

use tauri::{PhysicalPosition, PhysicalSize, Runtime, WebviewWindow};

/// To the right and bottom edge of the free area, in logical pixels.
const MARGIN: f64 = 30.0;

pub fn bottom_right<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let Some(monitor) = window.primary_monitor()? else { return Ok(()) };
    let area = monitor.work_area();
    window.set_position(corner(area.position, area.size, window.outer_size()?, monitor.scale_factor()))
}

/// A window taller or wider than the free area keeps its top left corner inside it.
fn corner(
    origin: PhysicalPosition<i32>,
    area: PhysicalSize<u32>,
    window: PhysicalSize<u32>,
    scale: f64,
) -> PhysicalPosition<i32> {
    let margin = (MARGIN * scale).round() as i32;
    let along = |start: i32, free: u32, size: u32| (start + free as i32 - size as i32 - margin).max(start);
    PhysicalPosition::new(along(origin.x, area.width, window.width), along(origin.y, area.height, window.height))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_margin_to_the_bottom_right_of_the_free_area_in_physical_pixels() {
        let at =
            corner(PhysicalPosition::new(0, 50), PhysicalSize::new(3456, 2100), PhysicalSize::new(1400, 1856), 2.0);
        assert_eq!(at, PhysicalPosition::new(3456 - 1400 - 60, 50 + 2100 - 1856 - 60));
    }

    #[test]
    fn stays_inside_a_screen_too_small_for_the_window() {
        let at =
            corner(PhysicalPosition::new(-1920, 25), PhysicalSize::new(1280, 775), PhysicalSize::new(700, 928), 1.0);
        assert_eq!(at, PhysicalPosition::new(-1920 + 1280 - 700 - 30, 25));
    }
}
