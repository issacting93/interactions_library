//! The "TAPE 08 / Patch" hardware look, ported from `shared/look/tape08-tokens.css` and
//! `library/tools/patch/components/knob/knob.js`. Draw with hairlines, fill only for "active," colour as
//! signal, monospace readouts — see the `tape08-design-language` skill for the full handbook.

#![allow(dead_code)] // the full token set is kept for completeness even where this pass doesn't use every colour yet

use bevy_egui::egui;
use egui::{Color32, CornerRadius, FontFamily, Sense, Shape, Stroke, Ui, Vec2};

// ---------- palette (exact values from shared/look/tape08-tokens.css) ----------

pub fn ground() -> Color32 { Color32::from_rgb(0x16, 0x16, 0x18) }
pub fn panel() -> Color32 { Color32::from_rgb(0x1D, 0x1D, 0x20) }
pub fn bar() -> Color32 { Color32::from_rgb(0x1B, 0x1B, 0x1E) }
pub fn well() -> Color32 { Color32::from_rgb(0x12, 0x12, 0x14) }
pub fn lane_sel() -> Color32 { Color32::from_rgb(0x23, 0x23, 0x27) }

pub fn ink() -> Color32 { Color32::from_rgb(0xEC, 0xE8, 0xDE) }
pub fn ink2() -> Color32 { Color32::from_rgb(0x8C, 0x89, 0x81) }
pub fn ink_off() -> Color32 { Color32::from_rgb(0x2E, 0x2D, 0x2A) }

pub fn accent() -> Color32 { Color32::from_rgb(0xE8, 0xB0, 0x4A) }
pub fn rec() -> Color32 { Color32::from_rgb(0xFF, 0x4D, 0x5E) }

/// Hairline role, as ink at one of the 5 documented opacity steps (1 grids ... 5 fader tracks).
pub fn line(role: u8) -> Color32 {
    let a = [18u8, 26, 36, 41, 56][(role.clamp(1, 5) - 1) as usize];
    Color32::from_rgba_unmultiplied(0xEC, 0xE8, 0xDE, a)
}

/// `egui::Visuals` built from the token set above. Call once per frame from `ui::panels` —
/// cheap, and avoids needing a separate startup-ordering system against `bevy_egui`'s context.
pub fn visuals() -> egui::Visuals {
    let mut v = egui::Visuals::dark();
    v.override_text_color = Some(ink());
    v.panel_fill = ground();
    v.window_fill = panel();
    v.window_stroke = Stroke::new(1.0, line(2));
    v.extreme_bg_color = well();
    v.faint_bg_color = panel();
    v.code_bg_color = well();
    v.hyperlink_color = accent();
    v.warn_fg_color = Color32::from_rgb(0xE8, 0xB0, 0x4A);
    v.error_fg_color = rec();
    v.selection.bg_fill = accent().linear_multiply(0.35);
    v.selection.stroke = Stroke::new(1.0, accent());

    v.widgets.noninteractive.bg_fill = panel();
    v.widgets.noninteractive.weak_bg_fill = ground();
    v.widgets.noninteractive.bg_stroke = Stroke::new(1.0, line(1));
    v.widgets.noninteractive.fg_stroke = Stroke::new(1.0, ink2());
    v.widgets.noninteractive.corner_radius = CornerRadius::same(5);

    v.widgets.inactive.bg_fill = well();
    v.widgets.inactive.weak_bg_fill = ground();
    v.widgets.inactive.bg_stroke = Stroke::new(1.0, line(4));
    v.widgets.inactive.fg_stroke = Stroke::new(1.0, ink());
    v.widgets.inactive.corner_radius = CornerRadius::same(10);

    v.widgets.hovered.bg_fill = lane_sel();
    v.widgets.hovered.weak_bg_fill = lane_sel();
    v.widgets.hovered.bg_stroke = Stroke::new(1.0, accent());
    v.widgets.hovered.fg_stroke = Stroke::new(1.0, ink());
    v.widgets.hovered.corner_radius = CornerRadius::same(10);

    v.widgets.active.bg_fill = accent();
    v.widgets.active.weak_bg_fill = accent().linear_multiply(0.5);
    v.widgets.active.bg_stroke = Stroke::new(1.0, accent());
    v.widgets.active.fg_stroke = Stroke::new(1.2, ground());
    v.widgets.active.corner_radius = CornerRadius::same(10);

    v.widgets.open.bg_fill = well();
    v.widgets.open.weak_bg_fill = ground();
    v.widgets.open.bg_stroke = Stroke::new(1.0, line(3));
    v.widgets.open.fg_stroke = Stroke::new(1.0, ink());
    v.widgets.open.corner_radius = CornerRadius::same(10);

    v.menu_corner_radius = CornerRadius::same(10);
    v.window_corner_radius = CornerRadius::same(22);
    v
}

/// Push every text style onto the monospace family. The real TAPE 08 faces (Martian Mono / IBM
/// Plex Mono) aren't bundled here — see the "not ported yet" note in the skill/README — this
/// pass stays on egui's built-in monospace font, which is still a real move away from the
/// proportional default and reads closer to the hardware-instrument convention.
pub fn apply_style(ctx: &egui::Context) {
    let mut style = (*ctx.style_of(egui::Theme::Dark)).clone();
    for font_id in style.text_styles.values_mut() { font_id.family = FontFamily::Monospace; }
    ctx.set_style_of(egui::Theme::Dark, style);
}

// ---------- the Patch rotary knob ----------
// Geometry from library/tools/patch/components/knob/knob.js + the tape08-design-language skill:
// a 270° sweep starting at 7 o'clock (210° clockwise from 12), track at ink/16% 1.5px, a
// coloured value arc at ~2px, an ink tick at 12 o'clock, an ink-stroked face filled with ground,
// and an ink pointer from centre to the value angle. Drag vertically to change the value — 160px
// of drag covers the full range, 600px with Shift held, matching knob.js's `set(drag.v + (drag.y
// - e.clientY) / (e.shiftKey ? 600 : 160))`.

const SWEEP_START_DEG: f32 = 210.0;
const SWEEP_DEG: f32 = 270.0;

/// A point on the dial at `angle_deg` clockwise from 12 o'clock, `radius` out from `center`.
fn dial_point(center: egui::Pos2, radius: f32, angle_deg: f32) -> egui::Pos2 {
    let a = angle_deg.to_radians();
    center + Vec2::new(a.sin(), -a.cos()) * radius
}

fn arc_points(center: egui::Pos2, radius: f32, from_deg: f32, to_deg: f32, segments: usize) -> Vec<egui::Pos2> {
    (0..=segments).map(|i| dial_point(center, radius, from_deg + (to_deg - from_deg) * (i as f32 / segments as f32))).collect()
}

/// Just the rotary dial and its drag interaction — no label, no value readout. `size` is the
/// box's side length in points (knob.js's `mini` variant is ~30, `full` is ~46; callers pick).
/// Factored out so `knob()` and `param_control()` paint the identical dial rather than two
/// near-copies drifting apart.
fn knob_dial(ui: &mut Ui, value: &mut f32, lo: f32, hi: f32, color: Color32, size: f32) -> egui::Response {
    let (rect, mut resp) = ui.allocate_exact_size(Vec2::splat(size), Sense::click_and_drag());

    if resp.dragged() {
        let dy = resp.drag_delta().y;
        let span = if ui.input(|i| i.modifiers.shift) { 600.0 } else { 160.0 };
        let next = (*value - dy / span * (hi - lo)).clamp(lo, hi);
        if next != *value { *value = next; resp.mark_changed(); }
    }

    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        let center = rect.center();
        let radius = rect.width() * 0.5 - 1.0;
        let t = if hi > lo { ((*value - lo) / (hi - lo)).clamp(0.0, 1.0) } else { 0.0 };
        let end_deg = SWEEP_START_DEG + SWEEP_DEG;

        painter.add(Shape::line(arc_points(center, radius, SWEEP_START_DEG, end_deg, 24), Stroke::new(1.5, line(4))));
        painter.add(Shape::line(arc_points(center, radius, SWEEP_START_DEG, SWEEP_START_DEG + SWEEP_DEG * t, 24), Stroke::new(2.0, color)));
        painter.line_segment([dial_point(center, radius * 0.82, 0.0), dial_point(center, radius * 0.98, 0.0)], Stroke::new(1.0, ink2()));

        let face_r = radius * 0.46;
        painter.circle_filled(center, face_r, ground());
        painter.circle_stroke(center, face_r, Stroke::new(1.2, ink()));
        let value_deg = SWEEP_START_DEG + SWEEP_DEG * t;
        painter.line_segment([center, dial_point(center, radius * 0.8, value_deg)], Stroke::new(1.4, ink()));

        if resp.hovered() || resp.dragged() {
            painter.circle_stroke(center, radius + 1.0, Stroke::new(1.0, accent()));
        }
    }
    resp
}

/// A bare Patch-style rotary control: the dial plus a label/value readout beside it. Returns a
/// `Response` with `.changed()`/`.dragged()` set correctly, same contract as `egui::Slider`.
/// Kept as a reusable primitive (`#[allow(dead_code)]` at the module level covers it if nothing
/// currently calls it directly) — `param_control()` below is what the dense parameter panels
/// actually use, since a bare knob alone is hard to set precisely or scan at a glance across many
/// rows; this stays available for any future spot that genuinely wants just a knob.
pub fn knob(ui: &mut Ui, value: &mut f32, lo: f32, hi: f32, color: Color32, label: &str) -> egui::Response {
    ui.horizontal(|ui| {
        let resp = knob_dial(ui, value, lo, hi, color, 28.0);
        ui.vertical(|ui| {
            ui.label(egui::RichText::new(label).small().color(ink2()));
            ui.label(egui::RichText::new(format!("{value:.2}")).small().monospace().color(ink()));
        });
        resp.on_hover_text(format!("{label}: {value:.2}"))
    }).inner
}

/// A thin instrument-panel slider: a 1px hairline track at `line(5)` (the fader/slider-track
/// role) and a small ink thumb (~6×16, per `library/tools/patch/components/param-control/param-control.css`).
/// Click or drag anywhere along the track to set the value — unlike the knob, which is
/// vertical-drag-only — matching the paired `<input type=range>` in the JS original.
fn themed_slider(ui: &mut Ui, value: &mut f32, lo: f32, hi: f32) -> egui::Response {
    let desired = Vec2::new(ui.available_width().max(40.0), 16.0);
    let (rect, mut resp) = ui.allocate_exact_size(desired, Sense::click_and_drag());

    if resp.dragged() || resp.clicked() {
        if let Some(pos) = resp.interact_pointer_pos() {
            let t = ((pos.x - rect.left()) / rect.width().max(1.0)).clamp(0.0, 1.0);
            let next = lo + t * (hi - lo);
            if next != *value { *value = next; resp.mark_changed(); }
        }
    }

    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        let mid_y = rect.center().y;
        painter.line_segment([egui::pos2(rect.left(), mid_y), egui::pos2(rect.right(), mid_y)], Stroke::new(1.0, line(5)));
        let t = if hi > lo { ((*value - lo) / (hi - lo)).clamp(0.0, 1.0) } else { 0.0 };
        let thumb_x = rect.left() + t * rect.width();
        let thumb = egui::Rect::from_center_size(egui::pos2(thumb_x, mid_y), Vec2::new(6.0, 16.0));
        let thumb_color = if resp.hovered() || resp.dragged() { accent() } else { ink() };
        painter.rect_filled(thumb, CornerRadius::same(3), thumb_color);
    }
    resp
}

/// A ghost button: transparent fill, a hairline border (`library/tools/patch/shared/patch.css`'s `.p-btn`
/// — border `line(4)`, ink text, 10px rounding), replacing egui's default filled/grey button chrome.
/// Desktop-mouse pragmatic note: the skill's 44px minimum is a touch target; this app is dense and
/// mouse-only, so these sit at 30px tall rather than fighting the toolbar for space.
pub fn ghost_button(text: &str) -> egui::Button<'static> {
    egui::Button::new(egui::RichText::new(text.to_owned()).monospace().size(11.0).color(ink()))
        .fill(Color32::TRANSPARENT)
        .stroke(Stroke::new(1.0, line(4)))
        .corner_radius(CornerRadius::same(10))
        .min_size(Vec2::new(0.0, 30.0))
}

/// An LED-indicator toggle, replacing egui's default checkbox glyph: a small dot that fills solid
/// and glows the given signal colour when on, stays a hollow ink2 ring when off, with the label
/// beside it recolouring the same way. "Draw, don't fill; colour is a signal" from the
/// tape08-design-language skill, applied to an on/off control.
///
/// Adaptation note: `library/tools/patch/components/led-bypass`'s real geometry is a fixed 48×40 box with
/// a short "ON"/"BYP" caption — that's sized for a known-short module-bypass label and doesn't fit
/// call sites here with long descriptive text (e.g. "Beam from the first portal"). This keeps the
/// dot's draw-don't-fill/colour-as-signal identity and swaps the fixed box + ON/BYP caption for the
/// caller's own label, since these toggles aren't bypass switches and the literal caption wouldn't
/// mean anything for e.g. "Finial" or "Keep evolving".
pub fn led_toggle(ui: &mut Ui, on: &mut bool, label: &str, color: Color32) -> egui::Response {
    let dot_d = 7.0;
    let gap = 7.0;
    let font = egui::FontId::monospace(12.0);
    let galley = ui.painter().layout_no_wrap(label.to_owned(), font.clone(), ink());
    let size = Vec2::new(dot_d + gap + galley.size().x + 4.0, galley.size().y.max(dot_d + 2.0));
    let (rect, mut resp) = ui.allocate_exact_size(size, Sense::click());
    if resp.clicked() { *on = !*on; resp.mark_changed(); }

    if ui.is_rect_visible(rect) {
        let painter = ui.painter_at(rect);
        let dot_c = egui::pos2(rect.left() + dot_d * 0.5, rect.center().y);
        let text_color = if *on { ink() } else { ink2() };
        if *on {
            painter.circle_filled(dot_c, dot_d * 0.42, color.linear_multiply(0.3));
            painter.circle_filled(dot_c, dot_d * 0.5 * 0.55, color);
        } else {
            painter.circle_stroke(dot_c, dot_d * 0.5 * 0.55, Stroke::new(1.0, ink2()));
        }
        painter.text(egui::pos2(rect.left() + dot_d + gap, rect.center().y), egui::Align2::LEFT_CENTER, label, font, text_color);
        if resp.hovered() {
            let y = rect.bottom();
            painter.line_segment([egui::pos2(rect.left(), y), egui::pos2(rect.right(), y)], Stroke::new(1.0, if *on { color } else { line(3) }));
        }
    }
    resp
}

/// The Patch "param-control" row: a small rotary dial in a fixed-width left column, and to its
/// right a label/value header over a thin hairline slider — knob and slider drive the same
/// value, exactly mirroring `library/tools/patch/components/param-control/param-control.js`'s knob+range
/// pairing. Denser and far more precisely settable across many rows than a bare `knob()`, which
/// is why `slide()`/`slide_u()` in `ui.rs` route every Tiers/Crown & foot/Aura/Look field through
/// this instead of the bare dial.
pub fn param_control(ui: &mut Ui, value: &mut f32, lo: f32, hi: f32, color: Color32, label: &str) -> egui::Response {
    ui.horizontal(|ui| {
        let dial_resp = knob_dial(ui, value, lo, hi, color, 32.0);
        let slider_resp = ui.vertical(|ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                ui.label(egui::RichText::new(label).small().color(ink2()));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(egui::RichText::new(format!("{value:.2}")).small().monospace().color(ink()));
                });
            });
            themed_slider(ui, value, lo, hi)
        }).inner;
        dial_resp.union(slider_resp).on_hover_text(format!("{label}: {value:.2}"))
    }).inner
}
