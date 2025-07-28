# DNS Switcher

A simple Electron app to quickly switch your system DNS servers from the macOS menu bar.

## Features
- Tray menu for fast DNS switching (Google, Cloudflare, OpenDNS, Quad9)
- Uses `sudo-prompt` for secure privilege escalation
- macOS Authorization dialog supports "Always Allow" (if you have an `icon.icns` in `assets/`)
- "Configure Passwordless Access" option: sets up a sudoers rule so you won't be prompted for your password again
- Automatic fallback to system icon if no custom icon is found

## Setup
1. Install dependencies:
   ```sh
   npm install
   ```
2. (Optional) Convert your PNG icon to ICNS for best experience:
   ```sh
   sips -s format icns assets/icon.png --out assets/icon.icns
   ```
3. Start the app:
   ```sh
   npm start
   ```

## Usage
- Click the tray icon to select a DNS provider.
- The first time you switch DNS, you'll be prompted for your password. You can check "Always Allow" to avoid future prompts.
- Or, use the "Configure Passwordless Access" menu item to set up a sudoers rule for DNS changes.

## Security
- The app only requests privilege for `networksetup`.
- The sudoers rule is validated before being installed.

---
MIT License
