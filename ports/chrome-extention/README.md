# CNVS Chrome Extension Port

This extension opens CNVS (`https://canvas.nishantmakwana.tech`) as a resizable right-side split panel on any website.

## Features

- Side-by-side split layout with draggable width handle.
- Remembers open/closed state and panel width per browser profile.
- Keyboard shortcut behavior is natural by focus:
  - CNVS shortcuts work when the CNVS panel is focused.
  - Browser/page shortcuts work when the web page is focused.

## Load (Developer Mode)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `ports/chrome-extention`.

## Usage

- Click the extension action icon to toggle the panel.
- Optional shortcut: `Ctrl+Shift+Y` (`Command+Shift+Y` on macOS).
- Drag the vertical handle on the panel edge to resize split width.
